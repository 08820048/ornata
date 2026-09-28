//! Heading bookmarks for an exported PDF, added with PDFKit after WebKit has
//! written the file. The print pipeline can't tell where headings landed, so
//! each heading is located by searching the PDF's text in document order —
//! every search starts after the previous hit, keeping repeated titles
//! ("Notes", "Summary") on the right page. Known limit: if a heading's exact
//! text also appears in the body just before it, the bookmark lands there.

use std::path::Path;

use objc2::rc::Retained;
use objc2::AnyThread;
use objc2_foundation::{NSPoint, NSString, NSStringCompareOptions, NSURL};
use objc2_pdf_kit::{PDFDestination, PDFDocument, PDFOutline, PDFSelection};

use crate::print_export::OutlineEntry;

/// Room above a heading when a bookmark jumps to it, in PDF points.
const JUMP_HEADROOM: f64 = 12.0;
/// Long headings may wrap onto two lines in the PDF, where a full-text
/// search can't match; retry with this many leading characters.
const FALLBACK_CHARS: usize = 32;

/// Rewrite `path` with a bookmark per entry. Headings that can't be found are
/// left out (their children attach to the nearest found ancestor).
pub fn add_outline(path: &Path, entries: &[OutlineEntry]) -> Result<(), String> {
    if entries.is_empty() {
        return Ok(());
    }
    let url = NSURL::from_file_path(path).ok_or("bad PDF path")?;
    // SAFETY: plain PDFKit calls on a file we just wrote, made on the main
    // thread from the print delegate once WebKit is done with it.
    unsafe {
        let doc = PDFDocument::initWithURL(PDFDocument::alloc(), &url)
            .ok_or("could not reopen the PDF")?;
        let root = PDFOutline::init(PDFOutline::alloc());
        let mut nodes: Vec<Option<Retained<PDFOutline>>> = Vec::with_capacity(entries.len());
        let mut cursor: Option<Retained<PDFSelection>> = None;

        for entry in entries {
            let Some(hit) = find(&doc, &entry.text, cursor.as_deref()) else {
                nodes.push(None);
                continue;
            };
            let Some(page) = hit.pages().firstObject() else {
                nodes.push(None);
                continue;
            };
            let bounds = hit.boundsForPage(&page);
            let point = NSPoint::new(0.0, bounds.origin.y + bounds.size.height + JUMP_HEADROOM);
            let destination = PDFDestination::initWithPage_atPoint(PDFDestination::alloc(), &page, point);

            let item = PDFOutline::init(PDFOutline::alloc());
            item.setLabel(Some(&NSString::from_str(&entry.text)));
            item.setDestination(Some(&destination));
            let parent = nearest_found(entries, &nodes, entry.parent);
            let parent = parent.unwrap_or(&root);
            parent.insertChild_atIndex(&item, parent.numberOfChildren());
            if std::ptr::eq(parent, &*root) {
                // Top-level sections start expanded in the sidebar.
                item.setIsOpen(true);
            }
            nodes.push(Some(item));
            cursor = Some(hit);
        }

        if root.numberOfChildren() == 0 {
            return Ok(());
        }
        doc.setOutlineRoot(Some(&root));
        if !doc.writeToURL(&url) {
            return Err("could not write the PDF outline".into());
        }
    }
    Ok(())
}

/// The closest ancestor, following `parent` links through `entries`, that
/// made it into the outline; None means attach at the top level.
fn nearest_found<'a>(
    entries: &[OutlineEntry],
    nodes: &'a [Option<Retained<PDFOutline>>],
    mut parent: i64,
) -> Option<&'a PDFOutline> {
    // Parents always precede children, so each step strictly decreases.
    while parent >= 0 {
        let index = parent as usize;
        if let Some(Some(node)) = nodes.get(index) {
            return Some(node);
        }
        let next = entries.get(index).map_or(-1, |entry| entry.parent);
        if next >= parent {
            return None;
        }
        parent = next;
    }
    None
}

/// Next occurrence of `text` after `from`, retrying with a prefix for
/// headings long enough to wrap.
unsafe fn find(
    doc: &PDFDocument,
    text: &str,
    from: Option<&PDFSelection>,
) -> Option<Retained<PDFSelection>> {
    let options = NSStringCompareOptions::CaseInsensitiveSearch;
    let full = doc.findString_fromSelection_withOptions(&NSString::from_str(text), from, options);
    if full.is_some() || text.chars().count() <= FALLBACK_CHARS {
        return full;
    }
    let prefix: String = text.chars().take(FALLBACK_CHARS).collect();
    doc.findString_fromSelection_withOptions(&NSString::from_str(&prefix), from, options)
}
