// ============================================================
//   HISTORY — local undo / redo snapshots
// ============================================================
import { HISTORY_LIMIT } from "../config.js";
import { captureState, loadState } from "./state.js";
import { render } from "../render.js";
import { scheduleRemoteAutosave } from "../features/projects.js";
import { saveLocalDraft } from "../storage.js";

let localHistory = [];
let redoHistory = [];

export function rememberSnapshot(snapshot) {
  if (!snapshot) snapshot = captureState();
  if (localHistory[localHistory.length - 1] === snapshot) return;
  localHistory.push(snapshot);
  if (localHistory.length > HISTORY_LIMIT) localHistory.shift();
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
