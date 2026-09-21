#!/bin/bash

# Regenerate every icon the app and site use from one master image.
#
# Tauri's `icon` command produces the platform bundles (icns/ico/pngs plus the
# Windows Store logos); the sizes it skips (256x256, the 1024 master) and the
# web/site favicons are derived here with macOS `sips`.
#
# Usage: bun run icon:generate [source-image]
#   source-image defaults to src-tauri/icons/icon-source.jpg

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ICONS_DIR="$PROJECT_ROOT/src-tauri/icons"

SOURCE="${1:-$ICONS_DIR/icon-source.jpg}"
if [ ! -f "$SOURCE" ]; then
  echo "Error: source image not found: $SOURCE" >&2
  exit 1
fi

command -v sips >/dev/null || { echo "Error: sips (macOS) is required" >&2; exit 1; }
command -v bunx >/dev/null || { echo "Error: bunx is required to run tauri icon" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
SOURCE_PNG="$work/icon-source.png"

echo "Converting source to PNG..."
sips -s format png "$SOURCE" --out "$SOURCE_PNG" >/dev/null

echo "Generating platform icons with tauri icon..."
bunx tauri icon "$SOURCE_PNG" --output "$ICONS_DIR"

# tauri icon skips these two, but tauri.conf.json references 256x256.png.
echo "Generating 256x256.png and the 1024 master..."
sips -z 256 256 "$SOURCE_PNG" --out "$ICONS_DIR/256x256.png" >/dev/null
sips -z 1024 1024 "$SOURCE_PNG" --out "$ICONS_DIR/icon-master.png" >/dev/null

echo "Generating web and site favicons..."
sips -z 256 256 "$SOURCE_PNG" --out "$PROJECT_ROOT/public/ornata-icon.png" >/dev/null
sips -z 512 512 "$SOURCE_PNG" --out "$PROJECT_ROOT/site/app/icon.png" >/dev/null
sips -z 512 512 "$SOURCE_PNG" --out "$PROJECT_ROOT/site/app/apple-icon.png" >/dev/null

# Desktop-only project: drop the mobile icon trees tauri icon also emits.
rm -rf "$ICONS_DIR/android" "$ICONS_DIR/ios"

echo "Icons regenerated from $SOURCE"
echo "Next: restart the app (or rebuild a release) to pick up the new icon."
