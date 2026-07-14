#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ $# -lt 2 ]; then
  echo "Usage: $0 <version> <release-notes>" >&2
  echo "Example: $0 0.1.5 \"Signed and notarized release\"" >&2
  exit 1
fi

VERSION="$1"
shift
NOTES="$*"

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Invalid semantic version: $VERSION" >&2
  exit 1
fi

case "$(uname -m)" in
  arm64) ARCH="aarch64" ;;
  x86_64) ARCH="x86_64" ;;
  *) echo "Unsupported macOS architecture: $(uname -m)" >&2; exit 1 ;;
esac

cd "$PROJECT_ROOT"

echo "Checking Apple and Tauri signing configuration..."
source "$SCRIPT_DIR/check-release-signing.sh"

echo "Synchronizing version $VERSION..."
bun "$SCRIPT_DIR/sync-version.js" "$VERSION"

echo "Removing stale release artifacts..."
rm -rf "$PROJECT_ROOT/src-tauri/target/release/bundle" "$PROJECT_ROOT/release/$VERSION"

echo "Building signed and notarized application..."
bun run tauri build

APP_PATH=$(find "$PROJECT_ROOT/src-tauri/target/release/bundle/macos" -maxdepth 1 -name "*.app" -type d | head -n 1)
UPDATE_BUNDLE=$(find "$PROJECT_ROOT/src-tauri/target/release/bundle/macos" -maxdepth 1 -name "*.app.tar.gz" -type f | head -n 1)
UPDATE_SIGNATURE="${UPDATE_BUNDLE}.sig"
DMG_PATH=$(find "$PROJECT_ROOT/src-tauri/target/release/bundle/dmg" -maxdepth 1 -name "*.dmg" -type f | head -n 1)

for path in "$APP_PATH" "$UPDATE_BUNDLE" "$UPDATE_SIGNATURE" "$DMG_PATH"; do
  [ -e "$path" ] || { echo "Missing release artifact: $path" >&2; exit 1; }
done

echo "Notarizing and stapling the DMG..."
if [ -n "${APPLE_API_ISSUER:-}" ] && [ -n "${APPLE_API_KEY:-}" ] && [ -n "${APPLE_API_KEY_PATH:-}" ]; then
  xcrun notarytool submit "$DMG_PATH" \
    --key "$APPLE_API_KEY_PATH" \
    --key-id "$APPLE_API_KEY" \
    --issuer "$APPLE_API_ISSUER" \
    --wait
else
  xcrun notarytool submit "$DMG_PATH" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --wait
fi
xcrun stapler staple "$DMG_PATH"

echo "Verifying Apple code signature and notarization ticket..."
codesign --verify --deep --strict --verbose=2 "$APP_PATH"
spctl --assess --type execute --verbose=4 "$APP_PATH"
xcrun stapler validate "$APP_PATH"
xcrun stapler validate "$DMG_PATH"
spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG_PATH"

echo "Verifying the archived updater application..."
VERIFY_DIR=$(mktemp -d)
trap 'rm -rf "$VERIFY_DIR"' EXIT
tar -xzf "$UPDATE_BUNDLE" -C "$VERIFY_DIR"
ARCHIVED_APP=$(find "$VERIFY_DIR" -maxdepth 2 -name "*.app" -type d | head -n 1)
[ -n "$ARCHIVED_APP" ] || { echo "Updater archive does not contain an app bundle" >&2; exit 1; }
codesign --verify --deep --strict --verbose=2 "$ARCHIVED_APP"
xcrun stapler validate "$ARCHIVED_APP"
[ -s "$UPDATE_SIGNATURE" ] || { echo "Tauri updater signature is empty" >&2; exit 1; }

PLATFORM_DIR="$PROJECT_ROOT/release/$VERSION/darwin-$ARCH"
mkdir -p "$PLATFORM_DIR"
cp "$UPDATE_BUNDLE" "$UPDATE_SIGNATURE" "$DMG_PATH" "$PLATFORM_DIR/"

echo "Generating Tauri update manifest..."
RELEASE_ARCH="$ARCH" bun run update:generate -- "$VERSION" "$NOTES"

echo "Release staged at: $PROJECT_ROOT/release/$VERSION"
echo "Review it, then run: bun run release:publish -- $VERSION --confirm"
