// Windows variant of the app icon: the square artwork inset a little and cut
// to a rounded square with transparent corners.
//
// macOS rounds a full-bleed icon itself; Windows shows it as it is, so the
// Windows icon came out as a hard-edged square next to every other app's
// rounded one. Only icon.ico and the Store logos are built from this; the
// macOS icns keeps the full-bleed square.
//
// Usage: bun scripts/round-icon.mjs <source.png> <out.png>
// sharp comes from the site's dependencies (it is Next's image library).

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(fileURLToPath(new URL("../site/package.json", import.meta.url)));
const sharp = require("sharp");

const [source, out] = process.argv.slice(2);
if (!source || !out) {
  console.error("usage: bun scripts/round-icon.mjs <source.png> <out.png>");
  process.exit(1);
}

const SIZE = 1024;
const INSET = 40; // keeps it the same visual size as other Windows app icons
const RADIUS = 176; // ≈ 19% of the visible square
const side = SIZE - INSET * 2;

const mask = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}">` +
    `<rect width="${side}" height="${side}" rx="${RADIUS}" ry="${RADIUS}" fill="#fff"/></svg>`,
);

const art = await sharp(source)
  .resize(side, side, { fit: "cover" })
  .ensureAlpha()
  .composite([{ input: mask, blend: "dest-in" }])
  .png()
  .toBuffer();

await sharp({
  create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: art, left: INSET, top: INSET }])
  .png()
  .toFile(out);

console.log(`rounded icon written to ${out}`);
