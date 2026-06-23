// ============================================================
//   STATUS — save-status text/class + shell visibility
// ============================================================
import { g } from "../store.js";
import { currentRemoteDigest, formatProjectTime } from "../features/projects.js";

export function saveStatusClass() {
  if (/ошибка/i.test(g.saveStatus)) return "error";
  if (/сохранение/i.test(g.saveStatus)) return "saving";
  if (/изменения|выключено|просмотр/i.test(g.saveStatus)) return "dirty";
  return "saved";
}
export function saveStatusSummary() {
  if (g.revisionPreview) return "Просмотр v" + g.revisionPreview.version;
  if (/ошибка/i.test(g.saveStatus)) return "Ошибка сохранения";
  if (/сохранение/i.test(g.saveStatus)) return "Сохраняем...";
  if (g.projectDirty || /изменения/i.test(g.saveStatus)) return "Есть изменения";
  if (!g.autosaveEnabled && /выключено/i.test(g.saveStatus)) return "Автосохранение выключено";
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
export function setSaveStatus(text) {
  g.saveStatus = text || "";
  renderSaveStatusOnly();
}
