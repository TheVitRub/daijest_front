// ============================================================
//   STATUS — save-status code/text/class + shell visibility
// ============================================================
import { g } from "../store.js";
import { currentRemoteDigest, formatProjectTime } from "../features/projects.js";

// Status codes — the single source of truth for save-status styling/summary.
export const SAVE = {
  ERROR: "error", SAVING: "saving", CHANGES: "changes",
  OFF: "off", PREVIEW: "preview", SAVED: "saved",
};

// Classify a status message into a code. Kept in ONE place (previously the
// same regexes were duplicated across saveStatusClass and saveStatusSummary).
// setSaveStatus can also receive an explicit code to bypass text matching.
function classify(text) {
  if (/ошибка/i.test(text)) return SAVE.ERROR;
  // "выключено" before "сохранение": "автоСОХРАНЕНИЕ выключено" contains
  // "сохранение", which previously mis-styled the autosave-off state.
  if (/выключено/i.test(text)) return SAVE.OFF;
  if (/сохранение/i.test(text)) return SAVE.SAVING;
  if (/просмотр/i.test(text)) return SAVE.PREVIEW;
  if (/изменения/i.test(text)) return SAVE.CHANGES;
  return SAVE.SAVED;
}

export function saveStatusClass() {
  switch (g.saveStatusCode) {
    case SAVE.ERROR:  return "error";
    case SAVE.SAVING: return "saving";
    case SAVE.CHANGES:
    case SAVE.OFF:
    case SAVE.PREVIEW: return "dirty";
    default: return "saved";
  }
}
export function saveStatusSummary() {
  if (g.revisionPreview) return "Просмотр v" + g.revisionPreview.version;
  if (g.saveStatusCode === SAVE.ERROR) return "Ошибка сохранения";
  if (g.saveStatusCode === SAVE.SAVING) return "Сохраняем...";
  if (g.projectDirty || g.saveStatusCode === SAVE.CHANGES) return "Есть изменения";
  if (!g.autosaveEnabled && g.saveStatusCode === SAVE.OFF) return "Автосохранение выключено";
  const savedAt = currentRemoteDigest()?.updatedAt;
  const time = formatProjectTime(savedAt);
  return time ? "Сохранено " + time : "Сохранено";
}
export function renderSaveStatusOnly() {
  const statusEl = document.getElementById("saveStatusText");
  if (statusEl) statusEl.textContent = g.saveStatus || (g.autosaveEnabled ? "Сохранено" : "Автосохранение выключено");
  const mainStatusEl = document.getElementById("mainSaveStatusText");
  if (mainStatusEl) mainStatusEl.textContent = saveStatusSummary();
  const drawerStatusEl = document.getElementById("drawerSaveStatusText");
  if (drawerStatusEl) drawerStatusEl.textContent = saveStatusSummary();
  const pill = document.getElementById("saveStatusPill");
  if (pill) pill.className = "save-status " + saveStatusClass();
  const mainPill = document.getElementById("mainSaveStatusPill");
  if (mainPill) mainPill.className = "main-save-status " + saveStatusClass();
  const drawerPill = document.getElementById("drawerSaveStatusPill");
  if (drawerPill) drawerPill.className = "save-dot " + saveStatusClass();
  const saveBtn = document.getElementById("manualSaveBtn");
  if (saveBtn) saveBtn.disabled = g.savingRemote;
  const autosaveToggle = document.getElementById("autosaveToggle");
  if (autosaveToggle) autosaveToggle.checked = g.autosaveEnabled;
}
export function renderShellState() {
  const authScreen = document.getElementById("authScreen");
  const app = document.querySelector(".app");
  if (authScreen) authScreen.hidden = !!g.currentUser;
  if (app) app.classList.toggle("app-hidden", !g.currentUser);
  if (app) app.classList.toggle("revision-preview-mode", !!g.revisionPreview);
}
// setSaveStatus(text) classifies the text; setSaveStatus(text, code) is explicit.
export function setSaveStatus(text, code) {
  g.saveStatus = text || "";
  g.saveStatusCode = code || classify(g.saveStatus);
  renderSaveStatusOnly();
}
