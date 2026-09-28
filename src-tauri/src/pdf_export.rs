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
use objc2_foundation::{NSObject, NSSize, NSString, NSURL};
use objc2_web_kit::WKWebView;

use crate::config::PdfSettings;
use crate::error::{AppError, AppResult};
use crate::print_export::OutlineEntry;

type Done = Box<dyn FnOnce(Result<(), String>)>;

/// What the delegate needs once WebKit has written the file.
struct Job {
    done: Done,
    dest: PathBuf,
    outline: Vec<OutlineEntry>,
}

define_class!(
    // SAFETY: NSObject has no subclassing requirements; no Drop impl.
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "OrnataPdfExportDelegate"]
    #[ivars = RefCell<Option<Job>>]
    struct PdfDelegate;

    impl PdfDelegate {
        #[unsafe(method(printOperationDidRun:success:contextInfo:))]
        fn did_run(&self, _op: &NSPrintOperation, success: Bool, _context: *mut c_void) {
            let Some(Job { done, dest, outline }) = self.ivars().borrow_mut().take() else {
                return;
            };
            let written = std::fs::metadata(&dest).map(|m| m.len() > 0).unwrap_or(false);
            if !(success.as_bool() && written) {
                done(Err("PDF export failed".into()));
                return;
            }
            // Bookmarks are a nicety: the PDF itself is already on disk, so a
            // failure here is logged, not reported as a failed export.
            if let Err(message) = crate::pdf_outline::add_outline(&dest, &outline) {
                eprintln!("pdf outline: {message}");
            }
            done(Ok(()));
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
    outline: Vec<OutlineEntry>,
    page: PdfSettings,
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
                Some(mtm) => {
                    let job = Job { done: Box::new(done), dest, outline };
                    run(mtm, wk, ns_window, &title, page, job)
                }
                None => done(Err("PDF export ran off the main thread".into())),
            }
        })
        .map_err(|e| AppError::Other(format!("pdf export: {e}")))
}

fn run(
    mtm: MainThreadMarker,
    wk: &WKWebView,
    ns_window: &NSWindow,
    title: &str,
    page: PdfSettings,
    job: Job,
) {
    let Some(url) = NSURL::from_file_path(&job.dest) else {
        (job.done)(Err(format!("bad PDF path: {}", job.dest.display())));
        return;
    };

    // A private copy of the shared print info: starts from the system paper
    // size (A4/Letter by region) without mutating the app-wide defaults.
    let shared = NSPrintInfo::sharedPrintInfo();
    // SAFETY: the dictionary is NSPrintInfo's own attribute dictionary.
    let info =
        unsafe { NSPrintInfo::initWithDictionary(NSPrintInfo::alloc(), &shared.dictionary()) };
    if let Some((width, height)) = page.paper.points() {
        info.setPaperSize(NSSize::new(width, height));
    }
    // Zero here on purpose: WebKit paginates from the page's CSS `@page`
    // margin, which the print view sets to the user's choice (see
    // PrintSource::page_margin_mm). Side margins set here were ignored, and
    // any value would risk stacking on top of `@page`.
    info.setTopMargin(0.0);
    info.setBottomMargin(0.0);
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
        let this = PdfDelegate::alloc(mtm).set_ivars(RefCell::new(Some(job)));
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
