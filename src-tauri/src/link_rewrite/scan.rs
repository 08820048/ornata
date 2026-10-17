//! Scanners that locate link targets and frontmatter inside note bodies.

pub(super) struct HrefSpan {
    pub(super) start: usize,
    pub(super) end: usize,
    pub(super) href: String,
}

/// Byte ranges of `](href)` targets, tolerating nested parentheses.
pub(super) fn scan_hrefs(body: &str) -> Vec<HrefSpan> {
    let mut spans = Vec::new();
    let mut iter = body.char_indices().peekable();
    while let Some((i, c)) = iter.next() {
        if c != ']' || !matches!(iter.peek(), Some((_, '('))) {
            continue;
        }
        iter.next();
        let start = i + 2;
        let mut depth = 1usize;
        let mut end = None;
        for (j, ch) in iter.by_ref() {
            match ch {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        end = Some(j);
                        break;
                    }
                }
                _ => {}
            }
        }
        if let Some(end) = end {
            spans.push(HrefSpan {
                start,
                end,
                href: body[start..end].to_string(),
            });
        }
    }
    spans
}

pub(super) struct WikiSpan {
    pub(super) target_start: usize,
    pub(super) target_end: usize,
    pub(super) target: String,
}

/// Byte ranges of `[[target]]` / `[[target|alias]]` targets.
pub(super) fn scan_wikis(body: &str) -> Vec<WikiSpan> {
    let mut spans = Vec::new();
    let mut rest = body;
    let mut offset = 0usize;
    while let Some(i) = rest.find("[[") {
        let open = offset + i;
        let Some(close) = rest[i + 2..].find("]]") else {
            break;
        };
        let inner = &rest[i + 2..i + 2 + close];
        let (target, tstart, tend) = match inner.find('|') {
            Some(bar) => (&inner[..bar], open + 2, open + 2 + bar),
            None => (inner, open + 2, open + 2 + inner.len()),
        };
        spans.push(WikiSpan {
            target_start: tstart,
            target_end: tend,
            target: target.to_string(),
        });
        let consumed = i + 2 + close + 2;
        offset += consumed;
        rest = &rest[consumed..];
    }
    spans
}

/// Split a leading `---` frontmatter block off, mirroring the frontend's
/// regex: the closing fence must sit at least one line below the opening, so
/// a `---` line directly under the opener stays body.
pub(super) fn split_frontmatter(content: &str) -> (&str, &str) {
    let bytes = content.as_bytes();
    let mut pos = 0usize;
    let mut line_no = 0usize;
    let mut open = false;
    while pos < content.len() {
        let mut line_end = pos;
        while line_end < bytes.len() && bytes[line_end] != b'\n' {
            line_end += 1;
        }
        let next = if line_end < bytes.len() { line_end + 1 } else { line_end };
        let mut line = &content[pos..line_end];
        if line.ends_with('\r') {
            line = &line[..line.len() - 1];
        }
        let is_fence = line.trim_end_matches([' ', '\t']) == "---";
        if line_no == 0 {
            if !is_fence {
                return ("", content);
            }
            open = true;
        } else if open && is_fence && line_no >= 2 {
            return content.split_at(next);
        }
        pos = next;
        line_no += 1;
    }
    ("", content)
}
