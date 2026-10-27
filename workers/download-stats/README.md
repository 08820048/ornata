# download-stats

Serves `download.ornata.app` from the R2 bucket `ornata` and counts what is fetched, so downloads and
update checks can be told apart. It keeps no IP address: a request becomes one Analytics Engine data
point with the kind (installer / update check / update bundle), release, platform, country, a coarse
client class (bot / browser / app) and a salted hash of the address **and the day**, which counts a
device once a day and cannot be followed across days. Resumed downloads count once. From 0.12.2 the app
also adds its version and system to the update check (`?v=…&t=…`, from the endpoint in `tauri.conf.json`), so
active devices can be split by version; only values shaped like a version or a system are accepted.

- Column contract: `src/index.ts` (`record`) and `scripts/download-stats.js` (header comment).
- Report: `CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… bun scripts/download-stats.js [days]`
- Tests: `bun test tests/download-stats.test.ts` (the path rules); the Worker itself is checked by
  comparing its responses with the live domain before the route is switched.

## Deploy

1. `cd workers/download-stats && bunx wrangler deploy` (workers.dev only, no production traffic).
2. `openssl rand -hex 32 | bunx wrangler secret put HASH_SECRET` (without it devices are not counted).
3. Compare a few URLs on the workers.dev host with `download.ornata.app`: status, `etag`,
   `content-length`, `content-type`, `cache-control`, a `Range` request, an `If-None-Match` request.
4. Only then add the route (`"routes": [{ "pattern": "download.ornata.app/*", "zone_name": "ornata.app" }]`)
   and redeploy. Undo: remove the route and redeploy; the bucket's own domain keeps serving as before.
