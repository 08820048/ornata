fn main() {
    // Tauri only emits a rerun directive for tauri.conf.json. Track the icon
    // inputs explicitly so `tauri dev` does not keep an icon embedded in a
    // stale debug binary after the artwork changes.
    for icon in [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/256x256.png",
        "icons/icon.icns",
        "icons/icon.png",
    ] {
        println!("cargo:rerun-if-changed={icon}");
    }
    tauri_build::build()
}
