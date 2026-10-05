// ============================================================
//   PROJECTS — remote digests CRUD, autosave, revisions, drawer
// ============================================================
import { g } from "../store.js";
import { apiRequest } from "../api.js";
import { AUTOSAVE_DELAY_MS, AUTOSAVE_ENABLED_KEY, CURRENT_DIGEST_KEY, getBlockLabel } from "../config.js";
import { state, projectTitle, digestTitle, captureState, loadState, resetStateToInitial, removeBlock, removeItem, getBlock } from "../state/state.js";
import { HAPPY_JOB_TYPE } from "../state/happy-job.js";
import { shouldSkipContentDeleteConfirm, rememberContentDeletePreference } from "./delete-preference.js";
import { saveLocalDraft, safeStorageSet, safeStorageRemove } from "../storage.js";
import { rememberSnapshot } from "../state/history.js";
import { render } from "../render.js";
import { setSaveStatus, renderSaveStatusOnly } from "../view/status.js";
import { renderAccountBar, renderProjectList, renderProjectMenu } from "../view/account.js";

export function currentRemoteDigest() {
  return g.remoteDigests.find(d => d.id === g.currentDigestId) || null;
}
export function projectById(projectId) {
  return g.remoteDigests.find(d => d.id === projectId) || null;
}
export function projectTitleById(projectId) {
  const project = projectById(projectId);
  return (project?.title || (projectId === g.currentDigestId ? projectTitle() : "Новый проект")).trim() || "Новый проект";
}
export function currentVersion() {
  const current = currentRemoteDigest();
  return current?.currentVersion || g.remoteRevisions[0]?.version || 1;
}
export function formatProjectDate(value) {
  if (!value) return "без даты";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "без даты";
  return date.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
export function formatProjectTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
export function safeFileTitle(value) {
  return (value || "project").trim().replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80) || "project";
}
export async function loadRemoteDigests(createIfEmpty) {
  if (!g.authToken) return;
  const data = await apiRequest("/digests");
  g.remoteDigests = data.digests || [];
  const known = g.remoteDigests.some(d => d.id === g.currentDigestId);
  if (!known) g.currentDigestId = g.remoteDigests[0]?.id || "";
  if (!g.currentDigestId && createIfEmpty) {
    // Новый профиль не должен наследовать локальный черновик предыдущего пользователя.
    resetStateToInitial();
    g.previewPage = 0;
    g.currentProjectTitle = "Новый проект";
    g.currentDigestType = "analytical";
    g.lastRemoteSnapshot = "";
    g.lastRemoteTitle = "";
    g.projectDirty = false;
    saveLocalDraft();
    await createRemoteDigest("created");
    return;
  }
  if (g.currentDigestId) {
    safeStorageSet(CURRENT_DIGEST_KEY, g.currentDigestId);
    await loadRemoteDigest(g.currentDigestId, true);
  }
  renderAccountBar();
}
export async function refreshProjectListOnly() {
  if (!g.authToken) return;
  const data = await apiRequest("/digests");
  g.remoteDigests = data.digests || [];
  if (g.currentDigestId && !g.remoteDigests.some(d => d.id === g.currentDigestId)) {
    g.currentDigestId = g.remoteDigests[0]?.id || "";
    if (g.currentDigestId) safeStorageSet(CURRENT_DIGEST_KEY, g.currentDigestId);
  }
  renderAccountBar();
}
export async function createRemoteDigest(action) {
  if (!g.authToken) return null;
  const title = projectTitle();
  const data = await apiRequest("/digests", {
    method: "POST",
    body: JSON.stringify({ title, state, action: action || "created", digestType: g.currentDigestType || "analytical" })
  });
  g.currentDigestId = data.digest.id;
  g.currentProjectTitle = data.digest.title || title;
  safeStorageSet(CURRENT_DIGEST_KEY, g.currentDigestId);
  g.lastRemoteSnapshot = captureState();
  g.lastRemoteTitle = g.currentProjectTitle;
  g.projectDirty = false;
  await loadRemoteDigests(false);
  return data.digest;
}
export async function newRemoteDigest(title) {
  if (g.projectDirty && g.currentDigestId && !g.revisionPreview) {
    await saveRemoteDraft("before new project", true);
  }
  clearTimeout(g.remoteSaveTimer);
  resetStateToInitial();
  g.currentDigestId = "";
  g.currentProjectTitle = (title || "Новый проект").trim() || "Новый проект";
  render(false);
  rememberSnapshot(captureState());
  saveLocalDraft();
  await createRemoteDigest("created");
  setSaveStatus("Создан новый проект");
}
export function openNewProjectDialog() {
  g.newProjectDialogOpen = true;
  g.newProjectTitle = "Новый проект";
  closeProjectMenu();
  renderAccountBar();
}
export function closeNewProjectDialog() {
  g.newProjectDialogOpen = false;
  g.newProjectTitle = "";
  renderAccountBar();
}
export async function createProjectFromDialog() {
  const title = (g.newProjectTitle || "").trim() || "Новый проект";
  g.currentDigestType = g.newProjectType || "analytical";
  g.newProjectDialogOpen = false;
  g.newProjectTitle = "";
  g.newProjectType = "analytical";
  try {
    await newRemoteDigest(title);
  } catch (err) {
    console.error("Project create failed:", err);
    setSaveStatus("Ошибка создания проекта");
    renderAccountBar();
  }
}
export async function saveRemoteNow() {
  try {
    await saveRemoteDraft("manual save", true);
  } catch (err) {
    console.error("Manual save error:", err);
    setSaveStatus("Ошибка сохранения");
  }
}
export async function saveCurrentProjectFromMenu() {
  closeProjectMenu();
  await saveRemoteNow();
}
export function toggleAutosaveFromMenu() {
  closeProjectMenu();
  toggleAutosave();
}
export function scheduleRemoteAutosave(action) {
  if (g.revisionPreview) {
    setSaveStatus("Просмотр v" + g.revisionPreview.version);
    return;
  }
  if (!g.authToken) {
    setSaveStatus("Черновик сохранен локально");
    return;
  }
  clearTimeout(g.remoteSaveTimer);
  g.projectDirty = true;
  if (!g.autosaveEnabled) {
    setSaveStatus("Автосохранение выключено");
    return;
  }
  setSaveStatus("Есть изменения");
  g.remoteSaveTimer = setTimeout(() => {
    saveRemoteDraft(action || "autosave", false).catch(err => {
      console.error("Autosave error:", err);
      setSaveStatus("Ошибка сохранения");
    });
  }, AUTOSAVE_DELAY_MS);
}
export async function saveRemoteDraft(action, force) {
  if (g.revisionPreview) {
    setSaveStatus("Просмотр v" + g.revisionPreview.version);
    return;
  }
  if (!g.authToken) return;
  const snapshot = captureState();
  const title = projectTitle();
  if (!force && snapshot === g.lastRemoteSnapshot && title === g.lastRemoteTitle) {
    g.projectDirty = false;
    setSaveStatus("Сохранено v" + currentVersion());
    return;
  }
  g.savingRemote = true;
  setSaveStatus("Сохранение...");
  if (!g.currentDigestId) {
    try {
      await createRemoteDigest(action || "manual save");
      setSaveStatus("Сохранено v" + currentVersion());
    } finally {
      g.savingRemote = false;
      renderSaveStatusOnly();
    }
    return;
  }
  try {
    const data = await apiRequest("/digests/" + g.currentDigestId + "/autosave", {
      method: "PUT",
      body: JSON.stringify({ title, state, action: action || "autosave", digestType: g.currentDigestType || "analytical" })
    });
    g.lastRemoteSnapshot = snapshot;
    g.lastRemoteTitle = title;
    g.projectDirty = false;
    const current = g.remoteDigests.find(d => d.id === g.currentDigestId);
    if (current) {
      current.title = title;
      current.currentVersion = data.revision.version;
      current.updatedAt = new Date().toISOString();
    }
    setSaveStatus("Сохранено v" + data.revision.version);
    await refreshRemoteRevisions();
  } finally {
    g.savingRemote = false;
    renderSaveStatusOnly();
  }
}
export async function loadRemoteDigest(digestId, quiet) {
  try {
    g.revisionPreview = null;
    const data = await apiRequest("/digests/" + digestId);
    g.currentDigestId = data.digest.id;
    safeStorageSet(CURRENT_DIGEST_KEY, g.currentDigestId);
    loadState(data.digest.state);
    g.previewPage = 0;
    g.currentProjectTitle = data.digest.title || digestTitle();
    g.currentDigestType = data.digest.digestType || "analytical";
    g.lastRemoteSnapshot = captureState();
    g.lastRemoteTitle = g.currentProjectTitle;
    g.projectDirty = false;
    rememberSnapshot(g.lastRemoteSnapshot);
    saveLocalDraft();
    render(false);
    await refreshRemoteRevisions();
    setSaveStatus(quiet ? "Сохранено v" + data.digest.currentVersion : "Открыт v" + data.digest.currentVersion);
  } catch (err) {
    if (quiet) console.warn("Remote load failed:", err);
    else setSaveStatus("Ошибка загрузки");
  }
}
export async function refreshRemoteRevisions() {
  if (!g.authToken || !g.currentDigestId) {
    g.remoteRevisions = [];
    if (g.historyProjectId === g.currentDigestId) g.historyRevisions = [];
    renderAccountBar();
    return;
  }
  const data = await apiRequest("/digests/" + g.currentDigestId + "/revisions");
  g.remoteRevisions = data.revisions || [];
  if (g.historyProjectId === g.currentDigestId) g.historyRevisions = g.remoteRevisions.slice();
  renderAccountBar();
}
export async function openProjectHistory(projectId) {
  if (!g.authToken || !projectId) return;
  g.historyProjectId = projectId;
  g.historyRevisions = [];
  g.historyLoading = true;
  closeProjectMenu();
  renderAccountBar();
  try {
    const data = await apiRequest("/digests/" + projectId + "/revisions");
    g.historyRevisions = data.revisions || [];
  } catch (err) {
    console.error("Revision history load failed:", err);
    setSaveStatus("Ошибка истории версий");
  } finally {
    g.historyLoading = false;
    renderAccountBar();
  }
}
export async function closeProjectHistory() {
  if (g.revisionPreview) {
    await returnToCurrentRevision();
  }
  g.historyProjectId = "";
  g.historyRevisions = [];
  g.historyLoading = false;
  renderAccountBar();
}
export async function openProject(projectId) {
  if (!projectId) return;
  if (projectId === g.currentDigestId) {
    closeProjectMenu();
    return;
  }
  try {
    if (g.revisionPreview) {
      g.revisionPreview = null;
    } else if (g.projectDirty && g.currentDigestId) {
      await saveRemoteDraft("switch project", true);
    }
    await loadRemoteDigest(projectId, false);
    closeProjectMenu();
  } catch (err) {
    console.error("Project open failed:", err);
    setSaveStatus("Ошибка загрузки");
  }
}
export function renameCurrentProject(value) {
  g.currentProjectTitle = (value || "").trim() || "Новый проект";
  const current = currentRemoteDigest();
  if (current) current.title = g.currentProjectTitle;
  g.projectDirty = true;
  scheduleRemoteAutosave("renamed");
  renderAccountBar();
}
export function toggleAutosave() {
  g.autosaveEnabled = !g.autosaveEnabled;
  safeStorageSet(AUTOSAVE_ENABLED_KEY, g.autosaveEnabled ? "true" : "false");
  clearTimeout(g.remoteSaveTimer);
  if (!g.autosaveEnabled) {
    setSaveStatus("Автосохранение выключено");
  } else if (g.projectDirty) {
    scheduleRemoteAutosave("autosave enabled");
  } else {
    setSaveStatus("Сохранено v" + currentVersion());
  }
  renderAccountBar();
}
export function openProjectsPanel() {
  g.projectsPanelOpen = true;
  g.projectMenuOpenId = "";
  g.projectMenuPosition = null;
  g.historyProjectId = "";
  g.historyRevisions = [];
  g.historyLoading = false;
  renderAccountBar();
}
export async function closeProjectsPanel() {
  if (g.revisionPreview) {
    await returnToCurrentRevision();
  }
  g.projectsPanelOpen = false;
  g.projectMenuOpenId = "";
  g.projectMenuPosition = null;
  g.historyProjectId = "";
  g.historyRevisions = [];
  g.historyLoading = false;
  g.newProjectDialogOpen = false;
  g.importTargetProjectId = "";
  g.pendingImport = null;
  g.confirmDialog = null;
  renderAccountBar();
}
export function setProjectSearch(value) {
  g.projectSearch = value || "";
  const list = document.getElementById("projectList");
  if (list) list.innerHTML = renderProjectList();
  closeProjectMenu();
}
export function syncProjectMenuLayer() {
  const host = document.getElementById("projectMenuLayerHost");
  if (host) host.innerHTML = renderProjectMenu();
}
export function closeProjectMenu() {
  g.projectMenuOpenId = "";
  g.projectMenuPosition = null;
  syncProjectMenuLayer();
}
export function toggleProjectMenu(event, projectId) {
  event.stopPropagation();
  if (g.projectMenuOpenId === projectId) {
    closeProjectMenu();
    return;
  }
  const rect = event.delegateTarget.getBoundingClientRect();
  const menuHeight = 238;
  g.projectMenuOpenId = projectId;
  g.projectMenuPosition = {
    top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - menuHeight - 12)),
    right: Math.max(12, window.innerWidth - rect.right)
  };
  syncProjectMenuLayer();
}
export function startRenameProject(projectId) {
  const digest = g.remoteDigests.find(d => d.id === projectId) || currentRemoteDigest();
  if (!digest) return;
  g.renamingProjectId = projectId;
  g.renameDraft = digest.title || projectTitle();
  closeProjectMenu();
  renderAccountBar();
}
export function cancelRenameProject() {
  g.renamingProjectId = "";
  g.renameDraft = "";
  renderAccountBar();
}
export async function finishRenameProject() {
  const nextTitle = (g.renameDraft || "").trim() || "Новый проект";
  if (!g.renamingProjectId) return;
  if (g.renamingProjectId !== g.currentDigestId) {
    const targetId = g.renamingProjectId;
    try {
      const data = await apiRequest("/digests/" + targetId);
      await apiRequest("/digests/" + targetId + "/autosave", {
        method: "PUT",
        body: JSON.stringify({ title: nextTitle, state: data.digest.state, action: "renamed" })
      });
      const target = projectById(targetId);
      if (target) {
        target.title = nextTitle;
        target.updatedAt = new Date().toISOString();
        target.currentVersion = (target.currentVersion || 1) + 1;
      }
      g.renamingProjectId = "";
      g.renameDraft = "";
      await refreshProjectListOnly();
      setSaveStatus("Проект переименован");
    } catch (err) {
      console.error("Project rename failed:", err);
      setSaveStatus("Ошибка переименования");
      renderAccountBar();
    }
    return;
  }
  g.currentProjectTitle = nextTitle;
  const current = currentRemoteDigest();
  if (current) current.title = nextTitle;
  g.renamingProjectId = "";
  g.renameDraft = "";
  g.projectDirty = true;
  await saveRemoteDraft("renamed", true);
  await loadRemoteDigests(false);
}
export function openConfirmDialog(config) {
  g.confirmDialog = config;
  renderAccountBar();
}
// Custom confirm for block deletion (replaces the old native confirm()).
export function confirmRemoveBlock(compKey, blockId) {
  const block = getBlock(compKey, blockId);
  if (!block || g.revisionPreview) return;
  const projectId = g.currentDigestId;
  const remove = () => {
    if (g.currentDigestId === projectId && !g.revisionPreview && getBlock(compKey, blockId) === block) {
      removeBlock(compKey, blockId);
    }
  };
  if (shouldSkipContentDeleteConfirm()) { remove(); return; }
  const label = block ? getBlockLabel(block.type) : "блок";
  openConfirmDialog({
    title: `Удалить блок "${label}"?`,
    message: "Блок и его содержимое будут удалены. Восстановление возможно только через отмену изменений или сохранённую версию, пока они доступны.",
    confirmText: "Удалить",
    danger: true,
    contentDeletion: true,
    skipContentDeletion: false,
    onConfirm: remove,
  });
}
export function confirmRemoveItem(compKey, blockId, idx) {
  const block = getBlock(compKey, blockId);
  const item = block?.items[idx];
  if (!item || g.revisionPreview || block.type === HAPPY_JOB_TYPE) return;
  const projectId = g.currentDigestId;
  const remove = () => {
    if (g.currentDigestId !== projectId || g.revisionPreview || getBlock(compKey, blockId) !== block) return;
    const currentIndex = block.items.indexOf(item);
    if (currentIndex >= 0) removeItem(compKey, blockId, currentIndex);
  };
  if (shouldSkipContentDeleteConfirm()) { remove(); return; }
  const label = { news: 'новость', tops: 'топ', metric: 'метрику' }[item.kind] || 'элемент';
  openConfirmDialog({
    title: `Удалить ${label}?`,
    message: 'Элемент и его содержимое будут удалены. Восстановление возможно только через отмену изменений или сохранённую версию, пока они доступны.',
    confirmText: 'Удалить',
    danger: true,
    contentDeletion: true,
    skipContentDeletion: false,
    onConfirm: remove,
  });
}
export function setSkipContentDeletion(checked) {
  if (g.confirmDialog?.contentDeletion) g.confirmDialog.skipContentDeletion = checked;
}
export function closeConfirmDialog() {
  if (g.confirmDialog?.clearPendingImport) {
    g.pendingImport = null;
    g.importTargetProjectId = "";
  }
  if (g.confirmDialog?.clearPendingCompanyImport) {
    g.pendingCompanyImport = null;
    g.companyImportTargetKey = "";
  }
  g.confirmDialog = null;
  renderAccountBar();
}
export async function acceptConfirmDialog() {
  const dialog = g.confirmDialog;
  if (!dialog || typeof dialog.onConfirm !== "function") return;
  if (dialog.contentDeletion && dialog.skipContentDeletion) rememberContentDeletePreference();
  g.confirmDialog = null;
  renderAccountBar();
  await dialog.onConfirm();
}
export async function acceptConfirmDialogAction(index) {
  const dialog = g.confirmDialog;
  const action = dialog?.actions?.[index];
  if (!action || typeof action.onConfirm !== "function") return;
  g.confirmDialog = null;
  renderAccountBar();
  await action.onConfirm();
}
export async function duplicateProject(projectId) {
  if (!g.authToken || !projectId) return;
  try {
    if (g.projectDirty && projectId === g.currentDigestId && !g.revisionPreview) {
      await saveRemoteDraft("before duplicate", true);
    }
    const data = await apiRequest("/digests/" + projectId);
    const title = "Копия - " + (data.digest.title || "Новый проект");
    const created = await apiRequest("/digests", {
      method: "POST",
      body: JSON.stringify({ title, state: data.digest.state, action: "duplicated" })
    });
    g.currentDigestId = created.digest.id;
    g.currentProjectTitle = created.digest.title || title;
    safeStorageSet(CURRENT_DIGEST_KEY, g.currentDigestId);
    closeProjectMenu();
    await loadRemoteDigest(g.currentDigestId, false);
    await loadRemoteDigests(false);
    setSaveStatus("Проект дублирован");
  } catch (err) {
    console.error("Duplicate project failed:", err);
    setSaveStatus("Ошибка дублирования");
  }
}
export async function deleteProject(projectId) {
  if (!g.authToken || !projectId) return;
  try {
    await apiRequest("/digests/" + projectId, { method: "DELETE" });
    closeProjectMenu();
    if (projectId === g.currentDigestId) {
      g.currentDigestId = "";
      g.remoteRevisions = [];
      g.lastRemoteSnapshot = "";
      g.lastRemoteTitle = "";
      g.revisionPreview = null;
      safeStorageRemove(CURRENT_DIGEST_KEY);
      await loadRemoteDigests(true);
    } else {
      await loadRemoteDigests(false);
    }
    setSaveStatus("Проект удален");
  } catch (err) {
    console.error("Delete project failed:", err);
    setSaveStatus("Ошибка удаления");
  }
}
export function confirmDeleteProject(projectId) {
  const digest = g.remoteDigests.find(d => d.id === projectId) || currentRemoteDigest();
  const title = digest?.title || "Новый проект";
  closeProjectMenu();
  openConfirmDialog({
    title: `Удалить проект "${title}"?`,
    message: "Это действие нельзя отменить.",
    confirmText: "Удалить",
    danger: true,
    onConfirm: () => deleteProject(projectId)
  });
}
export async function clearCurrentProject() {
  resetStateToInitial();
  g.revisionPreview = null;
  g.previewPage = 0;
  render(false);
  rememberSnapshot(captureState());
  saveLocalDraft();
  g.projectDirty = true;
  await saveRemoteDraft("cleared", true);
}
export function confirmClearCurrentProject() {
  openConfirmDialog({
    title: "Очистить текущий проект?",
    message: "Все блоки и обложки будут удалены, а пустое состояние сохранится в базу.",
    confirmText: "Очистить",
    danger: true,
    onConfirm: clearCurrentProject
  });
}
export async function openRevisionPreview(projectId, revisionId) {
  if (!revisionId) {
    revisionId = projectId;
    projectId = g.currentDigestId;
  }
  if (!g.authToken || !projectId || !revisionId) return;
  try {
    if (g.projectDirty && !g.revisionPreview && g.currentDigestId) {
      await saveRemoteDraft("before revision preview", true);
    }
    if (projectId !== g.currentDigestId) {
      const projectData = await apiRequest("/digests/" + projectId);
      g.currentDigestId = projectData.digest.id;
      safeStorageSet(CURRENT_DIGEST_KEY, g.currentDigestId);
      g.currentProjectTitle = projectData.digest.title || "Новый проект";
      g.lastRemoteSnapshot = JSON.stringify(projectData.digest.state || {});
      g.lastRemoteTitle = g.currentProjectTitle;
      g.projectDirty = false;
    }
    const data = await apiRequest("/digests/" + projectId + "/revisions/" + revisionId);
    g.revisionPreview = {
      id: data.revision.id,
      projectId,
      version: data.revision.version,
      action: data.revision.action || "",
      createdAt: data.revision.createdAt || ""
    };
    loadState(data.revision.state);
    g.previewPage = 0;
    render(false);
    setSaveStatus("Просмотр v" + data.revision.version);
    await refreshRemoteRevisions();
  } catch (err) {
    console.error("Revision preview failed:", err);
    setSaveStatus("Ошибка версии");
  }
}
export async function returnToCurrentRevision() {
  if (!g.currentDigestId) return;
  g.revisionPreview = null;
  await loadRemoteDigest(g.currentDigestId, false);
}
export async function rollbackRevision(projectId, revisionId, version) {
  if (!version) {
    version = revisionId;
    revisionId = projectId;
    projectId = g.currentDigestId;
  }
  if (!projectId || !revisionId) return;
  if (!g.revisionPreview && g.projectDirty && g.currentDigestId) {
    await saveRemoteDraft("before rollback", true);
  }
  try {
    if (projectId !== g.currentDigestId) {
      await loadRemoteDigest(projectId, false);
    }
    const data = await apiRequest("/digests/" + projectId + "/rollback", {
      method: "POST",
      body: JSON.stringify({ revisionId })
    });
    g.revisionPreview = null;
    loadState(data.digest.state);
    g.currentProjectTitle = data.digest.title || g.currentProjectTitle || digestTitle();
    g.lastRemoteSnapshot = captureState();
    g.lastRemoteTitle = g.currentProjectTitle;
    g.projectDirty = false;
    rememberSnapshot(g.lastRemoteSnapshot);
    saveLocalDraft();
    render(false);
    await refreshRemoteRevisions();
    if (g.historyProjectId === projectId) {
      const history = await apiRequest("/digests/" + projectId + "/revisions");
      g.historyRevisions = history.revisions || [];
    }
    setSaveStatus("Откат к v" + (version || data.digest.currentVersion));
  } catch (err) {
    console.error("Rollback failed:", err);
    setSaveStatus("Ошибка отката");
  }
}
export function confirmRollbackRevision(projectId, revisionId, version) {
  if (!version) {
    version = revisionId;
    revisionId = projectId;
    projectId = g.currentDigestId;
  }
  openConfirmDialog({
    title: "Откатить проект к версии v" + version + "?",
    message: "Текущая версия будет сохранена перед откатом.",
    confirmText: "Откатить",
    danger: false,
    onConfirm: () => rollbackRevision(projectId, revisionId, version)
  });
}
