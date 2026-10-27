// Serves download.ornata.app from the R2 bucket exactly as the bucket's own
// domain would, and counts what is fetched. Nothing about a person is kept:
// a path class, the release, the country, and a one-day salted hash to count a
// device once a day (classify.ts). Data goes to Workers Analytics Engine.

import { classify, clientClass, clientInfo, dayKey, deviceId, startsAtBeginning } from "./classify";

interface R2Range {
  offset?: number;
  length?: number;
  suffix?: number;
}
interface R2Object {
  size: number;
  httpEtag: string;
  uploaded: Date;
  range?: R2Range;
  body?: ReadableStream;
  writeHttpMetadata(headers: Headers): void;
}
interface Env {
  BUCKET: { get(key: string, options: { range: Headers; onlyIf: Headers }): Promise<R2Object | null> };
  STATS: { writeDataPoint(point: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void };
  /** `wrangler secret put HASH_SECRET`; without it devices are simply not counted. */
  HASH_SECRET?: string;
}

/** First and last byte served, and the bytes in between. */
function served(object: R2Object): { start: number; end: number; length: number } {
  const { size, range } = object;
  if (range?.suffix !== undefined) {
    const length = Math.min(range.suffix, size);
    return { start: size - length, end: size - 1, length };
  }
  const start = range?.offset ?? 0;
  const length = Math.min(range?.length ?? size - start, size - start);
  return { start, end: start + length - 1, length };
}

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    }
    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (!key) return new Response("Not Found", { status: 404 });

    const object = await env.BUCKET.get(key, { range: request.headers, onlyIf: request.headers });
    if (!object) return new Response("Not Found", { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("last-modified", object.uploaded.toUTCString());
    headers.set("accept-ranges", "bytes");

    // A failed precondition comes back without a body: 304 for If-None-Match / If-Modified-Since.
    if (!object.body) {
      const notModified = request.headers.has("if-none-match") || request.headers.has("if-modified-since");
      if (notModified) headers.set("content-length", String(object.size));
      return new Response(null, { status: notModified ? 304 : 412, headers });
    }

    const ranged = request.headers.has("range") && object.range !== undefined;
    const { start, end, length } = served(object);
    if (ranged) headers.set("content-range", `bytes ${start}-${end}/${object.size}`);
    headers.set("content-length", String(length));
    const status = ranged ? 206 : 200;

    if (request.method === "GET" && startsAtBeginning(request.headers.get("range"))) {
      ctx.waitUntil(record(request, env, key, status, length, url.searchParams));
    }
    return new Response(request.method === "HEAD" ? null : object.body, { status, headers });
  },
};

async function record(request: Request, env: Env, key: string, status: number, bytes: number, params: URLSearchParams): Promise<void> {
  try {
    const hit = classify(key);
    if (hit.kind === "other") return;
    const day = dayKey(new Date());
    const device = await deviceId(request.headers.get("cf-connecting-ip"), day, env.HASH_SECRET);
    const country = (request as Request & { cf?: { country?: string } }).cf?.country ?? "";
    const app = hit.kind === "update_check" ? clientInfo(params) : { version: "", target: "" };
    // Column order is the contract with scripts/download-stats.js.
    env.STATS.writeDataPoint({
      indexes: [hit.kind],
      blobs: [hit.kind, hit.version, hit.platform, hit.file, country, clientClass(request.headers.get("user-agent")), device, String(status), app.version, app.target],
      doubles: [1, bytes],
    });
  } catch {
    // Counting must never break a download.
  }
}
