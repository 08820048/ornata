#!/bin/bash

set -euo pipefail

configure_release_environment() {
  # Use the certificate fingerprint because the keychain contains multiple
  # Developer ID certificates with the same display name.
  export APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:-B5B549B0DE0CDF5F843A2756EFE5CCE412D2CF43}"
  export APPLE_TEAM_ID="${APPLE_TEAM_ID:-9XAXTT7H29}"

  local default_tauri_key="$HOME/.tauri/ornata-markd.key"
  if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ] && [ -f "$default_tauri_key" ]; then
    export TAURI_SIGNING_PRIVATE_KEY="$default_tauri_key"
  fi

  if [ -z "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" ]; then
    local key_password
    key_password=$(security find-generic-password \
      -a "$USER" \
      -s "ornata-markd-tauri-updater" \
      -w 2>/dev/null || true)
    if [ -n "$key_password" ]; then
      export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$key_password"
    fi
  fi

  if [ -z "${APPLE_API_ISSUER:-}" ]; then
    APPLE_API_ISSUER=$(security find-generic-password \
      -a "$USER" \
      -s "ornata-markd-apple-api-issuer" \
      -w 2>/dev/null || true)
    export APPLE_API_ISSUER
  fi

  if [ -z "${APPLE_API_KEY:-}" ]; then
    APPLE_API_KEY=$(security find-generic-password \
      -a "$USER" \
      -s "ornata-markd-apple-api-key" \
      -w 2>/dev/null || true)
    export APPLE_API_KEY
  fi

  if [ -z "${APPLE_API_KEY_PATH:-}" ]; then
    APPLE_API_KEY_PATH=$(security find-generic-password \
      -a "$USER" \
      -s "ornata-markd-apple-api-key-path" \
      -w 2>/dev/null || true)
    export APPLE_API_KEY_PATH
  fi
}

fail() {
  echo "Error: $1" >&2
  exit 1
}

configure_release_environment

command -v security >/dev/null || fail "macOS security tool is unavailable"
command -v codesign >/dev/null || fail "codesign is unavailable"
command -v xcrun >/dev/null || fail "Xcode command line tools are unavailable"

[ -n "${APPLE_SIGNING_IDENTITY:-}" ] || fail "APPLE_SIGNING_IDENTITY is not set"
[ "${APPLE_SIGNING_IDENTITY}" != "-" ] || fail "Ad-hoc signing is not allowed for releases"
[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ] || fail "TAURI_SIGNING_PRIVATE_KEY is not set"
[ -n "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" ] || fail "TAURI_SIGNING_PRIVATE_KEY_PASSWORD is not set"

if ! security find-identity -v -p codesigning | grep -F "${APPLE_SIGNING_IDENTITY}" >/dev/null; then
  fail "APPLE_SIGNING_IDENTITY was not found in the current keychain"
fi

has_api_key=false
if [ -n "${APPLE_API_ISSUER:-}" ] && [ -n "${APPLE_API_KEY:-}" ] && [ -n "${APPLE_API_KEY_PATH:-}" ]; then
  has_api_key=true
  [ -f "${APPLE_API_KEY_PATH}" ] || fail "APPLE_API_KEY_PATH does not point to a file"
fi

has_apple_id=false
if [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; then
  has_apple_id=true
fi

if [ "$has_api_key" != true ] && [ "$has_apple_id" != true ]; then
  fail "Set complete App Store Connect API credentials or APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID"
fi

echo "Apple Developer ID identity, notarization credentials, and Tauri updater key are ready."
