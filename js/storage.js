// ============================================================
//   STORAGE — localStorage helpers + local draft persistence
// ============================================================
import { STORAGE_KEY } from "./config.js";
import { g } from "./store.js";
import { state, loadState, projectTitle } from "./state/state.js";

export function safeStorageGet(key) {
  try { return localStorage.getItem(key); } catch (_) { return ""; }
}
export function safeStorageSet(key, value) {
  try { localStorage.setItem(key, value); } catch (_) {}
}
export function safeStorageRemove(key) {
  try { localStorage.removeItem(key); } catch (_) {}
}
export function stateEnvelope() {
  return { schemaVersion: 1, exportedAt: new Date().toISOString(), title: projectTitle(), state };
}
export function importedState(data) {
  if (data && data.schemaVersion && data.state) return data.state;
  return data;
}
export function saveLocalDraft() {
  safeStorageSet(STORAGE_KEY, JSON.stringify(stateEnvelope()));
}
export function loadLocalDraft() {
  const raw = safeStorageGet(STORAGE_KEY);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    loadState(importedState(data));
    if (data && typeof data.title === "string") g.currentProjectTitle = data.title;
    return true;
  } catch (_) {
    return false;
  }
}
