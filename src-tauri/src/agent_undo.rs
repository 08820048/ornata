//! One-click undo for AssistantPi's note changes.
//!
//! Before an edit or create runs, we note what it will touch; once it has
//! succeeded we record exactly what landed on disk. Undo only proceeds if the
//! note is still byte-for-byte what the agent wrote — if the user has edited
//! it since, undo refuses rather than clobbering their work (note history
//! still has every version). Deletes aren't covered: they go to the macOS
//! Trash, where they can be restored.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use serde_json::Value;

use crate::agent_tools::BridgeRequest;
use crate::error::{AppError, AppResult};
use crate::notes;

/// Undos kept per app session; older ones fall off.
const KEPT: usize = 50;

#[derive(Debug, Clone, PartialEq)]
pub enum UndoRecord {
    /// Restore `before`, if the note still reads `after`.
    Edit { rel: String, before: String, after: String },
    /// Move the created note to the Trash, if it still reads `content`.
    Create { rel: String, content: String },
}

impl UndoRecord {
    pub fn action(&self) -> &'static str {
        match self {
            Self::Edit { .. } => "edit",
            Self::Create { .. } => "create",
        }
    }

    pub fn rel(&self) -> &str {
        match self {
            Self::Edit { rel, .. } | Self::Create { rel, .. } => rel,
        }
    }
}

/// What a request will touch, captured before it runs.
pub enum Pending {
    Edit { rel: String, before: String },
    Create,
}

#[derive(Default)]
pub struct UndoLog {
    records: Mutex<(Vec<String>, HashMap<String, UndoRecord>)>,
}

impl UndoLog {
    pub fn insert(&self, id: String, record: UndoRecord) {
        if let Ok(mut guard) = self.records.lock() {
            let (order, map) = &mut *guard;
            order.push(id.clone());
            map.insert(id, record);
            while order.len() > KEPT {
                let oldest = order.remove(0);
                map.remove(&oldest);
            }
        }
    }

    pub fn take(&self, id: &str) -> Option<UndoRecord> {
        let mut guard = self.records.lock().ok()?;
        let (order, map) = &mut *guard;
        order.retain(|known| known != id);
        map.remove(id)
    }
}

/// Before running: remember the current text of a note about to be edited.
pub fn before(root: &Path, request: &BridgeRequest) -> Option<Pending> {
    if request.resource != "notes" {
        return None;
    }
    match request.action.as_str() {
        "update" => {
            let rel = request.args.get("path")?.as_str()?.to_string();
            let before = notes::read_note(root, &rel).ok()?;
            Some(Pending::Edit { rel, before })
        }
        "create" => Some(Pending::Create),
        _ => None,
    }
}

/// After success: record what is on disk now, so undo can check nothing
/// else has changed it. `value` is the tool's result (`{ "path": … }`).
pub fn after(root: &Path, pending: Pending, value: &Value) -> Option<UndoRecord> {
    match pending {
        Pending::Edit { rel, before } => {
            let after = notes::read_note(root, &rel).ok()?;
            (after != before).then_some(UndoRecord::Edit { rel, before, after })
        }
        Pending::Create => {
            let rel = value.get("path")?.as_str()?.to_string();
            let content = notes::read_note(root, &rel).ok()?;
            Some(UndoRecord::Create { rel, content })
        }
    }
}

/// Reverse a change, unless the note moved on since the agent made it.
pub fn apply(root: &Path, record: &UndoRecord) -> AppResult<()> {
    let changed_since = || {
        AppError::InvalidInput(
            "This note has changed since AssistantPi edited it. Use the note's history to restore an earlier version."
                .into(),
        )
    };
    match record {
        UndoRecord::Edit { rel, before, after } => {
            if notes::read_note(root, rel)? != *after {
                return Err(changed_since());
            }
            notes::write_note_forced_snapshot(root, rel, before)
        }
        UndoRecord::Create { rel, content } => {
            if notes::read_note(root, rel)? != *content {
                return Err(changed_since());
            }
            notes::delete_entry(root, rel)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::{create_note, write_note};
    use crate::vault::ensure_layout;
    use serde_json::json;
    use tempfile::tempdir;

    fn request(action: &str, args: Value) -> BridgeRequest {
        serde_json::from_value(json!({ "resource": "notes", "action": action, "args": args })).unwrap()
    }

    #[test]
    fn undoes_an_edit_while_the_note_is_untouched() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_layout(root).unwrap();
        let rel = create_note(root, "", "plan").unwrap();
        write_note(root, &rel, "mine").unwrap();

        let pending = before(root, &request("update", json!({ "path": rel }))).unwrap();
        notes::write_note_forced_snapshot(root, &rel, "agent's").unwrap();
        let record = after(root, pending, &json!({ "path": rel })).unwrap();

        apply(root, &record).unwrap();
        assert_eq!(notes::read_note(root, &rel).unwrap(), "mine");
    }

    #[test]
    fn refuses_to_undo_over_later_user_edits() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_layout(root).unwrap();
        let rel = create_note(root, "", "plan").unwrap();
        write_note(root, &rel, "mine").unwrap();

        let pending = before(root, &request("update", json!({ "path": rel }))).unwrap();
        notes::write_note_forced_snapshot(root, &rel, "agent's").unwrap();
        let record = after(root, pending, &json!({ "path": rel })).unwrap();
        write_note(root, &rel, "agent's, then mine").unwrap();

        assert!(apply(root, &record).is_err());
        assert_eq!(notes::read_note(root, &rel).unwrap(), "agent's, then mine");
    }

    #[test]
    fn no_op_edits_record_nothing_and_log_is_bounded() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_layout(root).unwrap();
        let rel = create_note(root, "", "plan").unwrap();
        let pending = before(root, &request("update", json!({ "path": rel }))).unwrap();
        assert!(after(root, pending, &json!({ "path": rel })).is_none());

        let log = UndoLog::default();
        for i in 0..(KEPT + 5) {
            log.insert(i.to_string(), UndoRecord::Create { rel: rel.clone(), content: String::new() });
        }
        assert!(log.take("0").is_none());
        assert!(log.take(&(KEPT + 4).to_string()).is_some());
        assert!(log.take(&(KEPT + 4).to_string()).is_none());
    }
}
