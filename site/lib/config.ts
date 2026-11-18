// Release coordinates — VERSION is kept in sync by scripts/sync-version.js.
export const VERSION = "0.13.1";
export const REPO_URL = "https://github.com/08820048/ornata";
export const RELEASE_ORIGIN = "https://download.ornata.app";
export const RELEASE_PREFIX = "products/ornata-markd";
// The Windows installer is built and published separately, on a Windows
// machine, and usually trails the Mac release. Its link must point at the
// last version that really has an installer: set this by hand after each
// Windows publish (sync-version.js leaves it alone).
export const WINDOWS_VERSION: string = "0.13.1";
export const EXE = `${RELEASE_ORIGIN}/${RELEASE_PREFIX}/releases/${WINDOWS_VERSION}/windows-x86_64/Ornata_${WINDOWS_VERSION}_x64-setup.exe`;
export const DMG = `${RELEASE_ORIGIN}/${RELEASE_PREFIX}/releases/${VERSION}/darwin-aarch64/Ornata_${VERSION}_aarch64.dmg`;
