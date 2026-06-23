// ============================================================
//   RENDER — orchestration of editor + preview + account bar
// ============================================================
import { g } from "./store.js";
import { renderEditor } from "./view/editor.js";
import { renderPreview } from "./view/preview.js";
import { renderAccountBar } from "./view/account.js";
import { setSaveStatus } from "./view/status.js";
import { captureState } from "./state/state.js";
import { rememberSnapshot } from "./state/history.js";
import { saveLocalDraft } from "./storage.js";
import { scheduleRemoteAutosave } from "./features/projects.js";

export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export const debouncedRenderAndSave = debounce(() => { renderPreview(); afterStateChanged("edit"); }, 250);

export function afterStateChanged(action) {
  if (g.booting) return;
  if (g.revisionPreview) {
    setSaveStatus("Просмотр v" + g.revisionPreview.version);
    renderAccountBar();
    return;
  }
  const snapshot = captureState();
  rememberSnapshot(snapshot);
  saveLocalDraft();
  g.projectDirty = true;
  scheduleRemoteAutosave(action || "autosave");
  renderAccountBar();
}

export function render(persist = true) {
  renderEditor();
  renderPreview();
  renderAccountBar();
  if (persist) afterStateChanged("change");
}
