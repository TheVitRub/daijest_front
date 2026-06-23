// ============================================================
//   IMPORT / EXPORT — JSON (project + company)
// ============================================================
import { g } from "../store.js";
import { apiRequest } from "../api.js";
import { getCompMeta } from "../config.js";
import { state, getComp, loadState, captureState, createBlockId, projectTitle } from "../state/state.js";
import { importedState, saveLocalDraft } from "../storage.js";
import { rememberSnapshot } from "../state/history.js";
import { render, afterStateChanged } from "../render.js";
import { setSaveStatus } from "../view/status.js";
import { renderAccountBar } from "../view/account.js";
import {
  openConfirmDialog, saveRemoteDraft, loadRemoteDigests,
  refreshProjectListOnly, projectTitleById, safeFileTitle, closeProjectMenu
} from "./projects.js";

export function cloneJSON(value) {
  return JSON.parse(JSON.stringify(value));
}
export function cloneBlocksWithFreshIds(blocks) {
  return cloneJSON(blocks).map(block => Object.assign({}, block, { id: createBlockId() }));
}
export function showCompanyImportError(message) {
  const text = message || "Не удалось импортировать JSON компании.";
  setSaveStatus(text);
  renderAccountBar();
  alert(text);
}
export function exportCompanyJSON(compKey) {
  const comp = getComp(compKey);
  if (!comp) return;
  const meta = getCompMeta(compKey);
  const envelope = {
    schemaVersion: 1,
    exportKind: "company-blocks",
    exportedAt: new Date().toISOString(),
    projectTitle: projectTitle(),
    companyKey: compKey,
    companyName: meta.name,
    blocks: cloneJSON(comp.blocks || [])
  };
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = safeFileTitle(projectTitle()) + '-' + safeFileTitle(meta.name) + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  setSaveStatus("JSON компании экспортирован");
}
export function importCompanyJSON(compKey) {
  g.companyImportTargetKey = compKey;
  g.pendingCompanyImport = null;
  const input = document.getElementById("companyFileInput");
  if (input) input.click();
}
export function openCompanyImportChoice(data) {
  const targetMeta = getCompMeta(g.companyImportTargetKey);
  g.pendingCompanyImport = {
    companyKey: g.companyImportTargetKey,
    blocks: data.blocks,
    companyName: data.companyName || targetMeta.name
  };
  openConfirmDialog({
    title: `Импорт JSON в "${targetMeta.name}"`,
    message: "Выберите, что сделать с текущими блоками этой компании.",
    clearPendingCompanyImport: true,
    actions: [
      {
        text: "Добавить",
        className: "primary-action",
        onConfirm: () => applyCompanyImport("append")
      },
      {
        text: "Заменить",
        className: "danger-action",
        onConfirm: () => applyCompanyImport("replace")
      }
    ]
  });
}
export function applyCompanyImport(mode) {
  if (!g.pendingCompanyImport || !g.companyImportTargetKey) return;
  const targetKey = g.companyImportTargetKey;
  const comp = getComp(targetKey);
  if (!comp) {
    g.pendingCompanyImport = null;
    g.companyImportTargetKey = "";
    showCompanyImportError("Секция компании не найдена.");
    return;
  }
  const nextBlocks = cloneBlocksWithFreshIds(g.pendingCompanyImport.blocks || []);
  if (mode === "replace") comp.blocks = nextBlocks;
  else comp.blocks.push(...nextBlocks);
  comp.collapsed = false;
  g.pendingCompanyImport = null;
  g.companyImportTargetKey = "";
  render(false);
  afterStateChanged(mode === "replace" ? "company json replace" : "company json append");
  setSaveStatus(mode === "replace" ? "JSON компании заменил блоки" : "JSON компании добавлен");
}
export function exportJSON() {
  exportProjectJSON(g.currentDigestId);
}
export async function exportProjectJSON(projectId) {
  closeProjectMenu();
  let title = projectTitle();
  let exportedState = state;
  if (g.authToken && projectId && projectId !== g.currentDigestId) {
    try {
      const data = await apiRequest("/digests/" + projectId);
      title = data.digest.title || title;
      exportedState = data.digest.state;
    } catch (err) {
      console.error("Project export failed:", err);
      setSaveStatus("Ошибка экспорта JSON");
      return;
    }
  }
  const envelope = { schemaVersion: 1, exportedAt: new Date().toISOString(), title, state: exportedState };
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = safeFileTitle(title) + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
export function importJSON(projectId) {
  g.importTargetProjectId = projectId || g.currentDigestId;
  g.pendingImport = null;
  closeProjectMenu();
  document.getElementById("fileInput").click();
}
export async function saveProjectBackup(projectId, title, projectState) {
  await apiRequest("/digests/" + projectId + "/autosave", {
    method: "PUT",
    body: JSON.stringify({ title, state: projectState, action: "backup before import" })
  });
}
export async function performProjectImport() {
  if (!g.pendingImport || !g.importTargetProjectId) return;
  const targetId = g.importTargetProjectId;
  const targetTitle = projectTitleById(targetId);
  const nextState = g.pendingImport.state;
  g.pendingImport = null;
  g.importTargetProjectId = "";
  try {
    if (targetId === g.currentDigestId) {
      await saveProjectBackup(targetId, targetTitle, state);
      loadState(nextState);
      g.currentProjectTitle = targetTitle;
      render(false);
      rememberSnapshot(captureState());
      saveLocalDraft();
      g.projectDirty = true;
      await saveRemoteDraft("json import", true);
      await loadRemoteDigests(false);
      setSaveStatus("JSON импортирован");
      return;
    }

    const data = await apiRequest("/digests/" + targetId);
    const title = data.digest.title || targetTitle;
    await saveProjectBackup(targetId, title, data.digest.state);
    await apiRequest("/digests/" + targetId + "/autosave", {
      method: "PUT",
      body: JSON.stringify({ title, state: nextState, action: "json import" })
    });
    await refreshProjectListOnly();
    setSaveStatus("JSON импортирован в проект");
  } catch (err) {
    console.error("JSON project import error:", err);
    setSaveStatus("Ошибка импорта JSON");
  } finally {
    renderAccountBar();
  }
}
document.getElementById("fileInput")?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const nextState = importedState(data);
    if (!g.authToken || !g.importTargetProjectId) {
      loadState(nextState);
      g.currentProjectTitle = (data.title || nextState?.letter?.title || "Импортированный проект").trim() || "Импортированный проект";
      render(false);
      rememberSnapshot(captureState());
      saveLocalDraft();
      g.projectDirty = true;
      setSaveStatus("JSON загружен локально");
      renderAccountBar();
      return;
    }
    g.pendingImport = { state: nextState };
    const targetTitle = projectTitleById(g.importTargetProjectId);
    openConfirmDialog({
      title: `Импортировать данные в проект "${targetTitle}"?`,
      message: "Текущие данные проекта будут заменены. Перед импортом будет создана резервная версия.",
      confirmText: "Импортировать",
      danger: false,
      clearPendingImport: true,
      onConfirm: performProjectImport
    });
  } catch(err) {
    console.error("JSON import error:", err);
    g.pendingImport = null;
    g.importTargetProjectId = "";
    setSaveStatus("Ошибка импорта JSON");
  }
});

document.getElementById("companyFileInput")?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const targetKey = g.companyImportTargetKey;
  try {
    if (!targetKey) throw new Error("Не выбрана компания для импорта.");
    const targetMeta = getCompMeta(targetKey);
    const data = JSON.parse(await file.text());
    if (data.exportKind !== "company-blocks") {
      throw new Error("Этот файл не является экспортом блоков компании.");
    }
    if (data.companyKey !== targetKey) {
      const sourceName = data.companyName || data.companyKey || "другая компания";
      throw new Error(`JSON из "${sourceName}" можно импортировать только в "${targetMeta.name}".`);
    }
    if (!Array.isArray(data.blocks)) {
      throw new Error("В JSON компании нет списка блоков.");
    }
    if (!data.blocks.every(block => block && typeof block === "object" && Array.isArray(block.items))) {
      throw new Error("В JSON компании повреждены данные блоков.");
    }
    openCompanyImportChoice(data);
  } catch (err) {
    console.error("Company JSON import error:", err);
    g.pendingCompanyImport = null;
    g.companyImportTargetKey = "";
    showCompanyImportError(err.message || "Ошибка импорта JSON компании.");
  }
});
