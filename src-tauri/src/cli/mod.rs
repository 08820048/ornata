//! `ornata` on the command line: the same executable as the app, run with a
//! subcommand. It gives any external agent (over MCP) or script the vault
//! without the UI — search, read, tasks, daily notes, and, when Settings
//! allows it, writes. See `tools` for the shared tool set.

mod commands;
pub(crate) mod app_api;
pub(crate) mod http;
mod mcp;
mod project_tools;
pub(crate) mod presence;
mod tools;
mod vault_path;



/// Runs a CLI subcommand if the process was started with one. Returns the
/// exit code, or `None` to start the app normally.
pub fn try_run() -> Option<i32> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    #[cfg(windows)]
    if !args.is_empty() {
        attach_console();
    }
    commands::dispatch(&args)
}

/// The release exe is a GUI-subsystem program, so a terminal that started it
/// gives it no console. Attach to the parent's and point any missing standard
/// handle at it, so `ornata search …` prints (redirected pipes are kept, which
/// is what MCP over stdio uses).
#[cfg(windows)]
fn attach_console() {
    use std::fs::OpenOptions;
    use std::os::windows::io::IntoRawHandle;

    type Handle = *mut core::ffi::c_void;
    extern "system" {
        fn AttachConsole(process_id: u32) -> i32;
        fn GetStdHandle(which: u32) -> Handle;
        fn SetStdHandle(which: u32, handle: Handle) -> i32;
    }
    const ATTACH_PARENT_PROCESS: u32 = u32::MAX;
    const STD_INPUT: u32 = -10i32 as u32;
    const STD_OUTPUT: u32 = -11i32 as u32;
    const STD_ERROR: u32 = -12i32 as u32;

    // SAFETY: plain Win32 calls; the opened handles are leaked on purpose
    // and live for the process.
    unsafe {
        if AttachConsole(ATTACH_PARENT_PROCESS) == 0 {
            return;
        }
        for (which, name, write) in [(STD_INPUT, "CONIN$", false), (STD_OUTPUT, "CONOUT$", true), (STD_ERROR, "CONOUT$", true)] {
            let current = GetStdHandle(which);
            if current.is_null() || current as isize == -1 {
                if let Ok(file) = OpenOptions::new().read(!write).write(write).open(name) {
                    SetStdHandle(which, file.into_raw_handle() as Handle);
                }
            }
        }
    }
}
