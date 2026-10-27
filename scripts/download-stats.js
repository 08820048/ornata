// Download and update-check numbers from the download Worker's Analytics Engine
// dataset (workers/download-stats). Usage:
//   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... bun scripts/download-stats.js [days]
// The token needs "Account Analytics: Read". Bots are left out of every figure.
// Columns written by the Worker: blob1 kind, blob2 version, blob3 platform, blob4 file,
// blob5 country, blob6 client, blob7 device (daily hash), blob8 status; double1 count, double2 bytes.

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const days = Math.max(1, Math.min(90, Number(process.argv[2]) || 14));
if (!account || !token) {
  console.error("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Account Analytics: Read).");
  process.exit(1);
}

async function sql(query) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: query,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text}`);
  return JSON.parse(text).data ?? [];
}

const since = `timestamp > NOW() - INTERVAL '${days}' DAY AND blob6 != 'bot'`;
// _sample_interval makes the counts right even if Analytics Engine sampled them.
const section = (title, rows) => {
  console.log(`\n${title}`);
  if (rows.length === 0) return console.log("  (no data yet)");
  console.table(rows);
};

section(
  `Per day, last ${days} days: installers downloaded, update checks, and distinct devices that checked`,
  await sql(`
    SELECT formatDateTime(timestamp, '%Y-%m-%d') AS day,
           SUM(IF(blob1 = 'download', _sample_interval, 0)) AS downloads,
           SUM(IF(blob1 = 'update_check', _sample_interval, 0)) AS update_checks,
           COUNT(DISTINCT IF(blob1 = 'update_check', blob7, NULL)) AS devices,
           SUM(IF(blob1 = 'update_download', _sample_interval, 0)) AS updates_installed
    FROM ornata_downloads WHERE ${since} AND blob8 IN ('200', '206')
    GROUP BY day ORDER BY day DESC FORMAT JSON`),
);

section(
  "Installers by version and platform",
  await sql(`
    SELECT blob2 AS version, blob3 AS platform, SUM(_sample_interval) AS downloads
    FROM ornata_downloads WHERE ${since} AND blob1 = 'download' AND blob8 IN ('200', '206')
    GROUP BY version, platform ORDER BY downloads DESC LIMIT 20 FORMAT JSON`),
);

section(
  "Countries (update checks and downloads)",
  await sql(`
    SELECT blob5 AS country, SUM(_sample_interval) AS requests
    FROM ornata_downloads WHERE ${since} AND blob1 IN ('download', 'update_check') AND blob8 IN ('200', '206')
    GROUP BY country ORDER BY requests DESC LIMIT 10 FORMAT JSON`),
);
