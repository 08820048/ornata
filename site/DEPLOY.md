# Deploying the site

The marketing site is a Next.js 15 app deployed to **Cloudflare Workers** via
[OpenNext](https://opennext.js.org/cloudflare). There is no Vercel, no CI
pipeline — deploys are run manually from a machine with Cloudflare credentials.

## Layout

- `wrangler.jsonc` — Worker config. `main` points at the OpenNext bundle
  (`.open-next/worker.js`); static assets ship through the `ASSETS` binding.
  The `routes` entry attaches `ornata.app` as a Worker **custom domain**, which
  makes Cloudflare own the DNS records for the apex.
- `open-next.config.ts` — OpenNext adapter config (currently defaults).

## Prerequisites

1. [Bun](https://bun.sh) and `bun install` inside `site/`.
2. Cloudflare auth: `bunx wrangler login` (OAuth; credentials land in
   `~/Library/Preferences/.wrangler/config/`). The login needs write access to
   Workers for the account that owns the `ornata.app` zone.

## Commands

```bash
bun run dev      # next dev with Cloudflare dev bindings
bun run preview  # build + run the OpenNext bundle locally
bun run deploy   # build + deploy to production (ornata.app)
```

`deploy` runs `opennextjs-cloudflare build && opennextjs-cloudflare deploy`:
it produces a production Next.js build, transforms it for Workers, and uploads
the worker + assets in one step. Deploys are atomic and versioned — a failed
attach leaves the previous version live. To roll back:
`bunx wrangler rollback` (or redeploy an older commit).

## Domain notes

- `ornata.app` resolves **only** through Cloudflare. The custom-domain
  attachment manages its DNS records; don't add manual A/AAAA/CNAME records
  for the apex in the Cloudflare dashboard. A stray record pointing elsewhere
  (e.g. a leftover host) will split traffic between providers and produce
  intermittent 404s from whatever it points at.
- The `workers.dev` subdomain (`ornata-site.ornataapp.workers.dev`) is
  disabled — production is the custom domain only.
- After any DNS change, public resolvers update quickly, but ISP caches may
  serve stale answers until the old TTL expires.

## Versioning

`site/package.json` version tracks the app release (currently `0.5.0`) and is
informational for the site; the app's own release pipeline
(`scripts/release.sh` at the repo root) is separate.
