//! Silent PDF export on macOS: WebKit's own print operation with the job
//! disposition set to "save to file", so no print sheet or progress panel
//! appears. Output is paginated, vector, with selectable text — the same
//! engine the print sheet's "Save as PDF" uses, minus the sheet.
//!
//! Known WebKit quirks this works around:
//! - `runOperation` on a WKWebView print operation yields blank pages; it has
//!   to run window-modal, which reports completion through a delegate.
//! - The operation's view can start with a zero frame; sized to the webview.

use std::cell::RefCell;
use std::ffi::c_void;
use std::path::PathBuf;

use objc2::rc::Retained;
use objc2::runtime::{AnyObject, Bool};
use objc2::{
    define_class, msg_send, sel, AnyThread, DefinedClass, MainThreadMarker, MainThreadOnly,
};
use objc2_app_kit::{
    NSPrintInfo, NSPrintJobSavingURL, NSPrintOperation, NSPrintSaveJob, NSPrintingPaginationMode,
    NSWindow,
};
use objc2_foundation::{NSObject, NSString, NSURL};
use objc2_web_kit::WKWebView;

use crate::error::{AppError, AppResult};

/// 12mm in points — vertical page margin. Horizontal inset comes from the
/// print view's own padding.
const PAGE_MARGIN_PT: f64 = 34.0;

type Done = Box<dyn FnOnce(Result<(), String>)>;

define_class!(
    // SAFETY: NSObject has no subclassing requirements; no Drop impl.
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "OrnataPdfExportDelegate"]
    #[ivars = RefCell<Option<(Done, PathBuf)>>]
    struct PdfDelegate;

    impl PdfDelegate {
        #[unsafe(method(printOperationDidRun:success:contextInfo:))]
        fn did_run(&self, _op: &NSPrintOperation, success: Bool, _context: *mut c_void) {
            let Some((done, dest)) = self.ivars().borrow_mut().take() else {
                return;
            };
            let written = std::fs::metadata(&dest).map(|m| m.len() > 0).unwrap_or(false);
            done(if success.as_bool() && written {
                Ok(())
            } else {
                Err("PDF export failed".into())
            });
        }
    }
);

thread_local! {
    // NSPrintOperation does not retain its delegate. Held until the next
    // export replaces it — never dropped from inside its own callback.
    static DELEGATE: RefCell<Option<Retained<PdfDelegate>>> = const { RefCell::new(None) };
}

/// Write the window's current page to `dest` as PDF. Returns once the job is
/// queued; `done` runs on the main thread when the file is written (or not).
pub fn save_pdf(
    window: &tauri::WebviewWindow,
    dest: PathBuf,
    title: String,
    done: impl FnOnce(Result<(), String>) + Send + 'static,
) -> AppResult<()> {
    window
        .with_webview(move |webview| {
            // SAFETY: tauri hands over the live WKWebView/NSWindow pointers and
            // runs this closure on the main thread.
            let (wk, ns_window) = unsafe {
                (
                    &*webview.inner().cast::<WKWebView>(),
                    &*webview.ns_window().cast::<NSWindow>(),
                )
            };
            match MainThreadMarker::new() {
                Some(mtm) => run(mtm, wk, ns_window, dest, &title, Box::new(done)),
                None => done(Err("PDF export ran off the main thread".into())),
            }
        })
        .map_err(|e| AppError::Other(format!("pdf export: {e}")))
}

fn run(
    mtm: MainThreadMarker,
    wk: &WKWebView,
    ns_window: &NSWindow,
    dest: PathBuf,
    title: &str,
    done: Done,
) {
    let Some(url) = NSURL::from_file_path(&dest) else {
        done(Err(format!("bad PDF path: {}", dest.display())));
        return;
    };

    // A private copy of the shared print info: keeps the user's paper size
    // (A4/Letter by locale) without mutating the app-wide defaults.
    let shared = NSPrintInfo::sharedPrintInfo();
    // SAFETY: the dictionary is NSPrintInfo's own attribute dictionary.
    let info =
        unsafe { NSPrintInfo::initWithDictionary(NSPrintInfo::alloc(), &shared.dictionary()) };
    info.setTopMargin(PAGE_MARGIN_PT);
    info.setBottomMargin(PAGE_MARGIN_PT);
    info.setLeftMargin(0.0);
    info.setRightMargin(0.0);
    info.setHorizontalPagination(NSPrintingPaginationMode::Fit);
    info.setVerticalPagination(NSPrintingPaginationMode::Automatic);
    // SAFETY: NSPrintSaveJob / NSPrintJobSavingURL are AppKit constants and
    // the saving URL's value type is NSURL.
    unsafe {
        info.setJobDisposition(NSPrintSaveJob);
        let url_obj: &AnyObject = url.as_ref();
        info.dictionary().insert(NSPrintJobSavingURL, url_obj);
    }

    // SAFETY: plain WebKit/AppKit calls on the main thread.
    let op = unsafe { wk.printOperationWithPrintInfo(&info) };
    op.setShowsPrintPanel(false);
    op.setShowsProgressPanel(false);
    op.setJobTitle(Some(&NSString::from_str(title)));
    if let Some(view) = op.view() {
        view.setFrame(wk.bounds());
    }

    let delegate: Retained<PdfDelegate> = {
        let this = PdfDelegate::alloc(mtm).set_ivars(RefCell::new(Some((done, dest))));
        // SAFETY: NSObject's init on a freshly allocated instance.
        unsafe { msg_send![super(this), init] }
    };
    // SAFETY: the selector matches `did_run`'s signature; the delegate is
    // kept alive in DELEGATE until the next export.
    unsafe {
        op.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
            ns_window,
            Some(&delegate),
            Some(sel!(printOperationDidRun:success:contextInfo:)),
            std::ptr::null_mut(),
        );
    }
    DELEGATE.with(|slot| *slot.borrow_mut() = Some(delegate));
}
