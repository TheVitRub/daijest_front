// ============================================================
//   HISTORY — local undo / redo snapshots
// ============================================================
import { HISTORY_LIMIT } from "../config.js";
import { captureState, loadState } from "./state.js";
import { render } from "../render.js";
import { scheduleRemoteAutosave } from "../features/projects.js";
import { saveLocalDraft } from "../storage.js";

// Snapshots are full-state JSON strings that include base64 photos, so a few
// large photos make each snapshot multi-MB. Cap history by total size (not just
// count) to keep memory bounded — otherwise it grows to hundreds of MB and the
// tab thrashes GC / crashes.
const HISTORY_BYTE_BUDGET = 24_000_000; // ~24M chars

let localHistory = [];
let redoHistory = [];

function trimHistory() {
  let bytes = 0;
  for (const s of localHistory) bytes += s.length;
  while (localHistory.length > 1 &&
         (localHistory.length > HISTORY_LIMIT || bytes > HISTORY_BYTE_BUDGET)) {
    bytes -= localHistory.shift().length;
  }
}

export function rememberSnapshot(snapshot) {
  if (!snapshot) snapshot = captureState();
  if (localHistory[localHistory.length - 1] === snapshot) return;
  localHistory.push(snapshot);
  trimHistory();
  redoHistory = [];
}
export function applySnapshot(snapshot, action) {
  if (!snapshot) return;
  try {
    loadState(JSON.parse(snapshot));
    render(false);
    saveLocalDraft();
    scheduleRemoteAutosave(action || "restore");
  } catch (err) {
    console.error("Snapshot restore error:", err);
  }
}
export function undoAction() {
  if (localHistory.length <= 1) return;
  const current = localHistory.pop();
  redoHistory.push(current);
  applySnapshot(localHistory[localHistory.length - 1], "undo");
}
export function redoAction() {
  const snapshot = redoHistory.pop();
  if (!snapshot) return;
  localHistory.push(snapshot);
  applySnapshot(snapshot, "redo");
}
