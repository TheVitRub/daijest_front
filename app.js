// ============================================================
//   CONFIG
// ============================================================
const STORAGE_KEY = "digest-builder-draft-v2";
const AUTH_TOKEN_KEY = "digest-builder-auth-token-v1";
const CURRENT_DIGEST_KEY = "digest-builder-current-digest-v1";
const AUTOSAVE_ENABLED_KEY = "digest-builder-autosave-enabled-v1";
const PUBLIC_BASE_PATH =
  window.DJST_PUBLIC_BASE_PATH ||
  (window.location.pathname === "/daijest" || window.location.pathname.startsWith("/daijest/")
    ? "/daijest"
    : "");
const API_BASE = window.DJST_API_BASE || `${PUBLIC_BASE_PATH}/api`;
const AUTOSAVE_DELAY_MS = 5000;
const HISTORY_LIMIT = 60;
const ADMIN_USERS_PAGE_SIZE = 50;

const COMPANIES = [
  { key: "volkov_z",  name: "Волков (Заринск)",         theme: "volkov",  color: "#f4a93d" },
  { key: "volkov_k",  name: "Волков (Кемерово)",         theme: "kalina",  color: "#d63031" },
  { key: "broiler",   name: "Кузбасский Бройлер (КУБ)", theme: "broiler", color: "#6fa86b" },
  { key: "retail",    name: "Розничная сеть (ФРС)",      theme: "tochka",  color: "#E51C4C" },
  { key: "vg",        name: "Волков групп",              theme: "zarinsk", color: "#c0392b" }
];

const BLOCK_TYPES = [
  { key: "main",         label: "О главном" },
  { key: "products",     label: "Продукты" },
  { key: "people",       label: "О людях" },
  { key: "publicity",    label: "Публичность" },
  { key: "achievements", label: "Есть чем гордиться" }
];

// ============================================================
//   STATE
// ============================================================
const state = {
  digestCover: "",
  letter: {
    title: "Уважаемые читатели и сотрудники",
    paragraphs: "Рады приветствовать вас в новом выпуске нашего дайджеста.\nПриятного чтения!",
    signature: "С уважением, редакция дайджеста",
    cover: "",
    collapsed: false
  },
  companies: COMPANIES.map(c => ({ key: c.key, collapsed: true, blocks: [] }))
};
const INITIAL_STATE_SNAPSHOT = JSON.stringify(state);

let authToken = safeStorageGet(AUTH_TOKEN_KEY) || "";
let currentUser = null;
let checkingSession = !!authToken;
let currentDigestId = safeStorageGet(CURRENT_DIGEST_KEY) || "";
let remoteDigests = [];
let remoteRevisions = [];
let remoteSaveTimer = null;
let lastRemoteSnapshot = "";
let lastRemoteTitle = "";
let currentProjectTitle = "";
let saveStatus = "";
let authMode = "code";
let authError = "";
let authBusy = false;
let authDraft = { email: "", name: "", password: "", confirm: "", code: "" };
let adminPanelOpen = false;
let adminUsers = [];
let adminNewUserName = "";
let adminBusy = false;
let adminError = "";
let adminSearch = "";
let adminVisibleLimit = ADMIN_USERS_PAGE_SIZE;
let adminDeletingUserId = "";
let adminEditUser = null;
let adminEditDraftName = "";
let currentDigestType = "analytical";
let newProjectType = "analytical";
let projectsPanelOpen = false;
let projectSearch = "";
let projectMenuOpenId = "";
let projectMenuPosition = null;
let confirmDialog = null;
let newProjectDialogOpen = false;
let newProjectTitle = "";
let historyProjectId = "";
let historyRevisions = [];
let historyLoading = false;
let importTargetProjectId = "";
let pendingImport = null;
let companyImportTargetKey = "";
let pendingCompanyImport = null;
let renamingProjectId = "";
let renameDraft = "";
let revisionPreview = null;
let autosaveEnabled = safeStorageGet(AUTOSAVE_ENABLED_KEY) !== "false";
let projectDirty = false;
let savingRemote = false;
let booting = true;
let localHistory = [];
let redoHistory = [];

// ============================================================
//   HELPERS
// ============================================================
function escAttr(s) { return (s || "").replace(/"/g, "&quot;"); }
function escText(s) { return (s || "").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function getCompMeta(key) { return COMPANIES.find(c => c.key === key) || COMPANIES[0]; }
function getBlockLabel(key) { return (BLOCK_TYPES.find(t => t.key === key) || {}).label || key; }
function collapseIcon(collapsed) { return collapsed ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>'; }

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
const debouncedRenderAndSave = debounce(() => { renderPreview(); afterStateChanged("edit"); }, 250);

function safeStorageGet(key) {
  try { return localStorage.getItem(key); } catch (_) { return ""; }
}
function safeStorageSet(key, value) {
  try { localStorage.setItem(key, value); } catch (_) {}
}
function safeStorageRemove(key) {
  try { localStorage.removeItem(key); } catch (_) {}
}
function stateEnvelope() {
  return { schemaVersion: 1, exportedAt: new Date().toISOString(), title: projectTitle(), state };
}
function importedState(data) {
  if (data && data.schemaVersion && data.state) return data.state;
  return data;
}
function captureState() {
  return JSON.stringify(state);
}
function saveLocalDraft() {
  safeStorageSet(STORAGE_KEY, JSON.stringify(stateEnvelope()));
}
function loadLocalDraft() {
  const raw = safeStorageGet(STORAGE_KEY);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    loadState(importedState(data));
    if (data && typeof data.title === "string") currentProjectTitle = data.title;
    return true;
  } catch (_) {
    return false;
  }
}
function rememberSnapshot(snapshot) {
  if (!snapshot) snapshot = captureState();
  if (localHistory[localHistory.length - 1] === snapshot) return;
  localHistory.push(snapshot);
  if (localHistory.length > HISTORY_LIMIT) localHistory.shift();
  redoHistory = [];
}
function applySnapshot(snapshot, action) {
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
function undoAction() {
  if (localHistory.length <= 1) return;
  const current = localHistory.pop();
  redoHistory.push(current);
  applySnapshot(localHistory[localHistory.length - 1], "undo");
}
function redoAction() {
  const snapshot = redoHistory.pop();
  if (!snapshot) return;
  localHistory.push(snapshot);
  applySnapshot(snapshot, "redo");
}
function afterStateChanged(action) {
  if (booting) return;
  if (revisionPreview) {
    setSaveStatus("Просмотр v" + revisionPreview.version);
    renderAccountBar();
    return;
  }
  const snapshot = captureState();
  rememberSnapshot(snapshot);
  saveLocalDraft();
  projectDirty = true;
  scheduleRemoteAutosave(action || "autosave");
  renderAccountBar();
}

function autoGrow(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
function initTextareas() {
  document.getElementById('editor').querySelectorAll('textarea').forEach(ta => {
    autoGrow(ta);
    ta.addEventListener('input', () => autoGrow(ta), { once: false });
  });
}

function getComp(key)  { return state.companies.find(c => c.key === key) || null; }
function getBlock(compKey, blockId) {
  const comp = getComp(compKey);
  return comp ? comp.blocks.find(b => b.id === blockId) : null;
}

const ITEM_DRAG_HANDLE = `<span class="drag-handle" onmousedown="this.closest('.item-block').draggable=true" onmouseup="this.closest('.item-block').draggable=false"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="9" cy="5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="9" cy="19" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="15" cy="19" r="2"/></svg></span>`;
function itemDragAttrs(compKey, blockId, idx) {
  return `draggable="false" ondragstart="onItemDragStart(event,'${compKey}','${blockId}',${idx})" ondragend="onItemDragEnd(event)" ondragover="onItemDragOver(event,'${compKey}','${blockId}',${idx})" ondrop="onItemDrop(event,'${compKey}','${blockId}',${idx})"`;
}

function loadState(data) {
  if (!data || typeof data !== 'object') return;
  if (typeof data.digestCover === 'string') state.digestCover = data.digestCover;
  if (Array.isArray(data.companies)) state.companies = data.companies;
  if (data.letter && typeof data.letter === 'object') state.letter = data.letter;
}

function digestTitle() {
  return (state.letter && state.letter.title ? state.letter.title : "Новый проект").trim() || "Новый проект";
}
function resetStateToInitial() {
  loadState(JSON.parse(INITIAL_STATE_SNAPSHOT));
}
function projectTitle() {
  return (currentProjectTitle || digestTitle()).trim() || "Новый проект";
}
function currentRemoteDigest() {
  return remoteDigests.find(d => d.id === currentDigestId) || null;
}
function projectById(projectId) {
  return remoteDigests.find(d => d.id === projectId) || null;
}
function projectTitleById(projectId) {
  const project = projectById(projectId);
  return (project?.title || (projectId === currentDigestId ? projectTitle() : "Новый проект")).trim() || "Новый проект";
}
function currentVersion() {
  const current = currentRemoteDigest();
  return current?.currentVersion || remoteRevisions[0]?.version || 1;
}
function formatProjectDate(value) {
  if (!value) return "без даты";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "без даты";
  return date.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function formatProjectTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
function safeFileTitle(value) {
  return (value || "project").trim().replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80) || "project";
}
let blockIdSeq = 0;
function createBlockId() {
  blockIdSeq += 1;
  return "b" + Date.now() + Math.floor(Math.random() * 1000) + blockIdSeq;
}
function saveStatusClass() {
  if (/ошибка/i.test(saveStatus)) return "error";
  if (/сохранение/i.test(saveStatus)) return "saving";
  if (/изменения|выключено|просмотр/i.test(saveStatus)) return "dirty";
  return "saved";
}
function saveStatusSummary() {
  if (revisionPreview) return "Просмотр v" + revisionPreview.version;
  if (/ошибка/i.test(saveStatus)) return "Ошибка сохранения";
  if (/сохранение/i.test(saveStatus)) return "Сохраняем...";
  if (projectDirty || /изменения/i.test(saveStatus)) return "Есть изменения";
  if (!autosaveEnabled && /выключено/i.test(saveStatus)) return "Автосохранение выключено";
  const savedAt = currentRemoteDigest()?.updatedAt;
  const time = formatProjectTime(savedAt);
  return time ? "Сохранено " + time : "Сохранено";
}
function renderSaveStatusOnly() {
  const statusEl = document.getElementById("saveStatusText");
  if (statusEl) statusEl.textContent = saveStatus || (autosaveEnabled ? "Сохранено" : "Автосохранение выключено");
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
  if (saveBtn) saveBtn.disabled = savingRemote;
  const autosaveToggle = document.getElementById("autosaveToggle");
  if (autosaveToggle) autosaveToggle.checked = autosaveEnabled;
}
function renderShellState() {
  const authScreen = document.getElementById("authScreen");
  const app = document.querySelector(".app");
  if (authScreen) authScreen.hidden = !!currentUser;
  if (app) app.classList.toggle("app-hidden", !currentUser);
  if (app) app.classList.toggle("revision-preview-mode", !!revisionPreview);
}
function setSaveStatus(text) {
  saveStatus = text || "";
  renderSaveStatusOnly();
}
async function apiRequest(path, options = {}) {
  const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
  if (authToken) headers.Authorization = "Bearer " + authToken;
  const res = await fetch(API_BASE + path, Object.assign({}, options, { headers }));
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
  return data;
}
function setAuthSession(data) {
  authToken = data.token || "";
  currentUser = data.user || null;
  authError = "";
  if (authToken) safeStorageSet(AUTH_TOKEN_KEY, authToken);
  renderAuthScreen();
  renderAccountBar();
  renderShellState();
}

function setAuthMode(mode) {
  authMode = mode === "register" ? "register" : "login";
  authError = "";
  renderAuthScreen();
}
function authErrorMessage(message) {
  if (/invalid email or password/i.test(message)) return "Неверный email или пароль.";
  if (/invalid access code/i.test(message)) return "Неверный код доступа.";
  if (/already registered/i.test(message)) return "Такой email уже зарегистрирован.";
  if (/at least 8/i.test(message)) return "Пароль должен быть не короче 8 символов.";
  return message || "Не удалось выполнить запрос.";
}
function validateAuthForm(email, password, confirm) {
  if (authMode === "code") {
    const code = (document.getElementById("authCode")?.value || authDraft.code || "").trim();
    if (!/^\d{8}$/.test(code)) return "Введите 8-значный цифровой код.";
    return "";
  }
  if (!email.trim() || !email.includes("@")) return "Введите корректный email.";
  if (password.length < 8) return "Пароль должен быть не короче 8 символов.";
  if (authMode === "register" && password !== confirm) return "Пароли не совпадают.";
  return "";
}
async function submitAuthForm(event) {
  if (event) event.preventDefault();
  if (authBusy) return;
  const email = document.getElementById("authEmail")?.value || "";
  const name = document.getElementById("authName")?.value || "";
  const password = document.getElementById("authPassword")?.value || "";
  const confirm = document.getElementById("authPasswordConfirm")?.value || "";
  const code = (document.getElementById("authCode")?.value || "").trim();
  authDraft = { email, name, password, confirm, code };
  const validationError = validateAuthForm(email, password, confirm);
  if (validationError) {
    authError = validationError;
    renderAuthScreen();
    return;
  }

  authBusy = true;
  authError = "";
  renderAuthScreen();
  try {
    const path = authMode === "register" ? "/auth/register" : "/auth/login";
    let body;
    if (authMode === "code") {
      body = { code };
    } else if (authMode === "register") {
      body = { email, name, password };
    } else {
      body = { email, password };
    }
    const data = await apiRequest(path, {
      method: "POST",
      body: JSON.stringify(body)
    });
    setAuthSession(data);
    await loadRemoteDigests(true);
    setSaveStatus(authMode === "register" ? "Аккаунт создан" : "Проекты загружены");
  } catch (err) {
    authError = authErrorMessage(err.message);
    renderAuthScreen();
  } finally {
    authBusy = false;
    renderAuthScreen();
  }
}
async function registerAccount() {
  authMode = "register";
  await submitAuthForm();
}
async function loginAccount() {
  authMode = "login";
  await submitAuthForm();
}
function logoutAccount() {
  authToken = "";
  currentUser = null;
  currentDigestId = "";
  remoteDigests = [];
  remoteRevisions = [];
  lastRemoteSnapshot = "";
  lastRemoteTitle = "";
  currentProjectTitle = "";
  projectDirty = false;
  savingRemote = false;
  projectsPanelOpen = false;
  projectMenuOpenId = "";
  projectMenuPosition = null;
  confirmDialog = null;
  newProjectDialogOpen = false;
  newProjectTitle = "";
  newProjectType = "analytical";
  currentDigestType = "analytical";
  adminPanelOpen = false;
  adminUsers = [];
  adminNewUserName = "";
  adminError = "";
  adminSearch = "";
  adminVisibleLimit = ADMIN_USERS_PAGE_SIZE;
  adminDeletingUserId = "";
  adminEditUser = null;
  adminEditDraftName = "";
  historyProjectId = "";
  historyRevisions = [];
  historyLoading = false;
  importTargetProjectId = "";
  pendingImport = null;
  companyImportTargetKey = "";
  pendingCompanyImport = null;
  revisionPreview = null;
  clearTimeout(remoteSaveTimer);
  safeStorageRemove(AUTH_TOKEN_KEY);
  safeStorageRemove(CURRENT_DIGEST_KEY);
  renderAuthScreen();
  renderAccountBar();
  renderShellState();
}
async function bootstrapRemoteSession() {
  if (!authToken) {
    checkingSession = false;
    renderAuthScreen();
    renderAccountBar();
    renderShellState();
    return;
  }
  try {
    const data = await apiRequest("/me");
    currentUser = data.user;
    checkingSession = false;
    await loadRemoteDigests(true);
  } catch (_) {
    checkingSession = false;
    logoutAccount();
  }
}
async function loadRemoteDigests(createIfEmpty) {
  if (!authToken) return;
  const data = await apiRequest("/digests");
  remoteDigests = data.digests || [];
  const known = remoteDigests.some(d => d.id === currentDigestId);
  if (!known) currentDigestId = remoteDigests[0]?.id || "";
  if (!currentDigestId && createIfEmpty) {
    currentProjectTitle = "Новый проект";
    await createRemoteDigest("created");
    return;
  }
  if (currentDigestId) {
    safeStorageSet(CURRENT_DIGEST_KEY, currentDigestId);
    await loadRemoteDigest(currentDigestId, true);
  }
  renderAccountBar();
}
async function refreshProjectListOnly() {
  if (!authToken) return;
  const data = await apiRequest("/digests");
  remoteDigests = data.digests || [];
  if (currentDigestId && !remoteDigests.some(d => d.id === currentDigestId)) {
    currentDigestId = remoteDigests[0]?.id || "";
    if (currentDigestId) safeStorageSet(CURRENT_DIGEST_KEY, currentDigestId);
  }
  renderAccountBar();
}
async function createRemoteDigest(action) {
  if (!authToken) return null;
  const title = projectTitle();
  const data = await apiRequest("/digests", {
    method: "POST",
    body: JSON.stringify({ title, state, action: action || "created", digestType: currentDigestType || "analytical" })
  });
  currentDigestId = data.digest.id;
  currentProjectTitle = data.digest.title || title;
  safeStorageSet(CURRENT_DIGEST_KEY, currentDigestId);
  lastRemoteSnapshot = captureState();
  lastRemoteTitle = currentProjectTitle;
  projectDirty = false;
  await loadRemoteDigests(false);
  return data.digest;
}
async function newRemoteDigest(title) {
  if (projectDirty && currentDigestId && !revisionPreview) {
    await saveRemoteDraft("before new project", true);
  }
  clearTimeout(remoteSaveTimer);
  resetStateToInitial();
  currentDigestId = "";
  currentProjectTitle = (title || "Новый проект").trim() || "Новый проект";
  render(false);
  rememberSnapshot(captureState());
  saveLocalDraft();
  await createRemoteDigest("created");
  setSaveStatus("Создан новый проект");
}
function openNewProjectDialog() {
  newProjectDialogOpen = true;
  newProjectTitle = "Новый проект";
  closeProjectMenu();
  renderAccountBar();
}
function closeNewProjectDialog() {
  newProjectDialogOpen = false;
  newProjectTitle = "";
  renderAccountBar();
}
async function createProjectFromDialog() {
  const title = (newProjectTitle || "").trim() || "Новый проект";
  currentDigestType = newProjectType || "analytical";
  newProjectDialogOpen = false;
  newProjectTitle = "";
  newProjectType = "analytical";
  try {
    await newRemoteDigest(title);
  } catch (err) {
    console.error("Project create failed:", err);
    setSaveStatus("Ошибка создания проекта");
    renderAccountBar();
  }
}
async function saveRemoteNow() {
  try {
    await saveRemoteDraft("manual save", true);
  } catch (err) {
    console.error("Manual save error:", err);
    setSaveStatus("Ошибка сохранения");
  }
}
async function saveCurrentProjectFromMenu() {
  closeProjectMenu();
  await saveRemoteNow();
}
function toggleAutosaveFromMenu() {
  closeProjectMenu();
  toggleAutosave();
}
function scheduleRemoteAutosave(action) {
  if (revisionPreview) {
    setSaveStatus("Просмотр v" + revisionPreview.version);
    return;
  }
  if (!authToken) {
    setSaveStatus("Черновик сохранен локально");
    return;
  }
  clearTimeout(remoteSaveTimer);
  projectDirty = true;
  if (!autosaveEnabled) {
    setSaveStatus("Автосохранение выключено");
    return;
  }
  setSaveStatus("Есть изменения");
  remoteSaveTimer = setTimeout(() => {
    saveRemoteDraft(action || "autosave", false).catch(err => {
      console.error("Autosave error:", err);
      setSaveStatus("Ошибка сохранения");
    });
  }, AUTOSAVE_DELAY_MS);
}
async function saveRemoteDraft(action, force) {
  if (revisionPreview) {
    setSaveStatus("Просмотр v" + revisionPreview.version);
    return;
  }
  if (!authToken) return;
  const snapshot = captureState();
  const title = projectTitle();
  if (!force && snapshot === lastRemoteSnapshot && title === lastRemoteTitle) {
    projectDirty = false;
    setSaveStatus("Сохранено v" + currentVersion());
    return;
  }
  savingRemote = true;
  setSaveStatus("Сохранение...");
  if (!currentDigestId) {
    try {
      await createRemoteDigest(action || "manual save");
      setSaveStatus("Сохранено v" + currentVersion());
    } finally {
      savingRemote = false;
      renderSaveStatusOnly();
    }
    return;
  }
  try {
    const data = await apiRequest("/digests/" + currentDigestId + "/autosave", {
      method: "PUT",
      body: JSON.stringify({ title, state, action: action || "autosave", digestType: currentDigestType || "analytical" })
    });
    lastRemoteSnapshot = snapshot;
    lastRemoteTitle = title;
    projectDirty = false;
    const current = remoteDigests.find(d => d.id === currentDigestId);
    if (current) {
      current.title = title;
      current.currentVersion = data.revision.version;
      current.updatedAt = new Date().toISOString();
    }
    setSaveStatus("Сохранено v" + data.revision.version);
    await refreshRemoteRevisions();
  } finally {
    savingRemote = false;
    renderSaveStatusOnly();
  }
}
async function loadSelectedDigest() {
  const selected = document.getElementById("digestSelect")?.value || currentDigestId;
  if (!selected) return;
  await loadRemoteDigest(selected, false);
}
async function loadRemoteDigest(digestId, quiet) {
  try {
    revisionPreview = null;
    const data = await apiRequest("/digests/" + digestId);
    currentDigestId = data.digest.id;
    safeStorageSet(CURRENT_DIGEST_KEY, currentDigestId);
    loadState(data.digest.state);
    currentProjectTitle = data.digest.title || digestTitle();
    currentDigestType = data.digest.digestType || "analytical";
    lastRemoteSnapshot = captureState();
    lastRemoteTitle = currentProjectTitle;
    projectDirty = false;
    rememberSnapshot(lastRemoteSnapshot);
    saveLocalDraft();
    render(false);
    await refreshRemoteRevisions();
    setSaveStatus(quiet ? "Сохранено v" + data.digest.currentVersion : "Открыт v" + data.digest.currentVersion);
  } catch (err) {
    if (quiet) console.warn("Remote load failed:", err);
    else setSaveStatus("Ошибка загрузки");
  }
}
async function refreshRemoteRevisions() {
  if (!authToken || !currentDigestId) {
    remoteRevisions = [];
    if (historyProjectId === currentDigestId) historyRevisions = [];
    renderAccountBar();
    return;
  }
  const data = await apiRequest("/digests/" + currentDigestId + "/revisions");
  remoteRevisions = data.revisions || [];
  if (historyProjectId === currentDigestId) historyRevisions = remoteRevisions.slice();
  renderAccountBar();
}
async function openProjectHistory(projectId) {
  if (!authToken || !projectId) return;
  historyProjectId = projectId;
  historyRevisions = [];
  historyLoading = true;
  closeProjectMenu();
  renderAccountBar();
  try {
    const data = await apiRequest("/digests/" + projectId + "/revisions");
    historyRevisions = data.revisions || [];
  } catch (err) {
    console.error("Revision history load failed:", err);
    setSaveStatus("Ошибка истории версий");
  } finally {
    historyLoading = false;
    renderAccountBar();
  }
}
async function closeProjectHistory() {
  if (revisionPreview) {
    await returnToCurrentRevision();
  }
  historyProjectId = "";
  historyRevisions = [];
  historyLoading = false;
  renderAccountBar();
}
async function rollbackRemoteRevision() {
  const revisionId = document.getElementById("revisionSelect")?.value || "";
  if (!revisionId || !currentDigestId) return;
  const revision = remoteRevisions.find(r => r.id === revisionId);
  confirmRollbackRevision(revisionId, revision?.version || "");
}

async function openProject(projectId) {
  if (!projectId) return;
  if (projectId === currentDigestId) {
    closeProjectMenu();
    return;
  }
  try {
    if (revisionPreview) {
      revisionPreview = null;
    } else if (projectDirty && currentDigestId) {
      await saveRemoteDraft("switch project", true);
    }
    await loadRemoteDigest(projectId, false);
    closeProjectMenu();
  } catch (err) {
    console.error("Project open failed:", err);
    setSaveStatus("Ошибка загрузки");
  }
}
function renameCurrentProject(value) {
  currentProjectTitle = (value || "").trim() || "Новый проект";
  const current = currentRemoteDigest();
  if (current) current.title = currentProjectTitle;
  projectDirty = true;
  scheduleRemoteAutosave("renamed");
  renderAccountBar();
}
function toggleAutosave() {
  autosaveEnabled = !autosaveEnabled;
  safeStorageSet(AUTOSAVE_ENABLED_KEY, autosaveEnabled ? "true" : "false");
  clearTimeout(remoteSaveTimer);
  if (!autosaveEnabled) {
    setSaveStatus("Автосохранение выключено");
  } else if (projectDirty) {
    scheduleRemoteAutosave("autosave enabled");
  } else {
    setSaveStatus("Сохранено v" + currentVersion());
  }
  renderAccountBar();
}
function openProjectsPanel() {
  projectsPanelOpen = true;
  projectMenuOpenId = "";
  projectMenuPosition = null;
  historyProjectId = "";
  historyRevisions = [];
  historyLoading = false;
  renderAccountBar();
}
async function closeProjectsPanel() {
  if (revisionPreview) {
    await returnToCurrentRevision();
  }
  projectsPanelOpen = false;
  projectMenuOpenId = "";
  projectMenuPosition = null;
  historyProjectId = "";
  historyRevisions = [];
  historyLoading = false;
  newProjectDialogOpen = false;
  importTargetProjectId = "";
  pendingImport = null;
  confirmDialog = null;
  renderAccountBar();
}
function setProjectSearch(value) {
  projectSearch = value || "";
  const list = document.getElementById("projectList");
  if (list) list.innerHTML = renderProjectList();
  closeProjectMenu();
}
function syncProjectMenuLayer() {
  const host = document.getElementById("projectMenuLayerHost");
  if (host) host.innerHTML = renderProjectMenu();
}
function closeProjectMenu() {
  projectMenuOpenId = "";
  projectMenuPosition = null;
  syncProjectMenuLayer();
}
function toggleProjectMenu(event, projectId) {
  event.stopPropagation();
  if (projectMenuOpenId === projectId) {
    closeProjectMenu();
    return;
  }
  const rect = event.currentTarget.getBoundingClientRect();
  const menuHeight = 238;
  projectMenuOpenId = projectId;
  projectMenuPosition = {
    top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - menuHeight - 12)),
    right: Math.max(12, window.innerWidth - rect.right)
  };
  syncProjectMenuLayer();
}
function handleProjectsDrawerClick(event) {
  event.stopPropagation();
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (projectMenuOpenId && !target.closest(".project-menu-layer") && !target.closest(".project-menu-button")) {
    closeProjectMenu();
  }
}
function startRenameProject(projectId) {
  const digest = remoteDigests.find(d => d.id === projectId) || currentRemoteDigest();
  if (!digest) return;
  renamingProjectId = projectId;
  renameDraft = digest.title || projectTitle();
  closeProjectMenu();
  renderAccountBar();
}
function cancelRenameProject() {
  renamingProjectId = "";
  renameDraft = "";
  renderAccountBar();
}
async function finishRenameProject() {
  const nextTitle = (renameDraft || "").trim() || "Новый проект";
  if (!renamingProjectId) return;
  if (renamingProjectId !== currentDigestId) {
    const targetId = renamingProjectId;
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
      renamingProjectId = "";
      renameDraft = "";
      await refreshProjectListOnly();
      setSaveStatus("Проект переименован");
    } catch (err) {
      console.error("Project rename failed:", err);
      setSaveStatus("Ошибка переименования");
      renderAccountBar();
    }
    return;
  }
  currentProjectTitle = nextTitle;
  const current = currentRemoteDigest();
  if (current) current.title = nextTitle;
  renamingProjectId = "";
  renameDraft = "";
  projectDirty = true;
  await saveRemoteDraft("renamed", true);
  await loadRemoteDigests(false);
}
function openConfirmDialog(config) {
  confirmDialog = config;
  renderAccountBar();
}
function closeConfirmDialog() {
  if (confirmDialog?.clearPendingImport) {
    pendingImport = null;
    importTargetProjectId = "";
  }
  if (confirmDialog?.clearPendingCompanyImport) {
    pendingCompanyImport = null;
    companyImportTargetKey = "";
  }
  confirmDialog = null;
  renderAccountBar();
}
async function acceptConfirmDialog() {
  const dialog = confirmDialog;
  if (!dialog || typeof dialog.onConfirm !== "function") return;
  confirmDialog = null;
  renderAccountBar();
  await dialog.onConfirm();
}
async function acceptConfirmDialogAction(index) {
  const dialog = confirmDialog;
  const action = dialog?.actions?.[index];
  if (!action || typeof action.onConfirm !== "function") return;
  confirmDialog = null;
  renderAccountBar();
  await action.onConfirm();
}
async function duplicateProject(projectId) {
  if (!authToken || !projectId) return;
  try {
    if (projectDirty && projectId === currentDigestId && !revisionPreview) {
      await saveRemoteDraft("before duplicate", true);
    }
    const data = await apiRequest("/digests/" + projectId);
    const title = "Копия - " + (data.digest.title || "Новый проект");
    const created = await apiRequest("/digests", {
      method: "POST",
      body: JSON.stringify({ title, state: data.digest.state, action: "duplicated" })
    });
    currentDigestId = created.digest.id;
    currentProjectTitle = created.digest.title || title;
    safeStorageSet(CURRENT_DIGEST_KEY, currentDigestId);
    closeProjectMenu();
    await loadRemoteDigest(currentDigestId, false);
    await loadRemoteDigests(false);
    setSaveStatus("Проект дублирован");
  } catch (err) {
    console.error("Duplicate project failed:", err);
    setSaveStatus("Ошибка дублирования");
  }
}
async function deleteProject(projectId) {
  if (!authToken || !projectId) return;
  try {
    await apiRequest("/digests/" + projectId, { method: "DELETE" });
    closeProjectMenu();
    if (projectId === currentDigestId) {
      currentDigestId = "";
      remoteRevisions = [];
      lastRemoteSnapshot = "";
      lastRemoteTitle = "";
      revisionPreview = null;
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
function confirmDeleteProject(projectId) {
  const digest = remoteDigests.find(d => d.id === projectId) || currentRemoteDigest();
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
async function clearCurrentProject() {
  resetStateToInitial();
  revisionPreview = null;
  render(false);
  rememberSnapshot(captureState());
  saveLocalDraft();
  projectDirty = true;
  await saveRemoteDraft("cleared", true);
}
function confirmClearCurrentProject() {
  openConfirmDialog({
    title: "Очистить текущий проект?",
    message: "Все блоки и обложки будут удалены, а пустое состояние сохранится в базу.",
    confirmText: "Очистить",
    danger: true,
    onConfirm: clearCurrentProject
  });
}
async function openRevisionPreview(projectId, revisionId) {
  if (!revisionId) {
    revisionId = projectId;
    projectId = currentDigestId;
  }
  if (!authToken || !projectId || !revisionId) return;
  try {
    if (projectDirty && !revisionPreview && currentDigestId) {
      await saveRemoteDraft("before revision preview", true);
    }
    if (projectId !== currentDigestId) {
      const projectData = await apiRequest("/digests/" + projectId);
      currentDigestId = projectData.digest.id;
      safeStorageSet(CURRENT_DIGEST_KEY, currentDigestId);
      currentProjectTitle = projectData.digest.title || "Новый проект";
      lastRemoteSnapshot = JSON.stringify(projectData.digest.state || {});
      lastRemoteTitle = currentProjectTitle;
      projectDirty = false;
    }
    const data = await apiRequest("/digests/" + projectId + "/revisions/" + revisionId);
    revisionPreview = {
      id: data.revision.id,
      projectId,
      version: data.revision.version,
      action: data.revision.action || "",
      createdAt: data.revision.createdAt || ""
    };
    loadState(data.revision.state);
    render(false);
    setSaveStatus("Просмотр v" + data.revision.version);
    await refreshRemoteRevisions();
  } catch (err) {
    console.error("Revision preview failed:", err);
    setSaveStatus("Ошибка версии");
  }
}
async function returnToCurrentRevision() {
  if (!currentDigestId) return;
  revisionPreview = null;
  await loadRemoteDigest(currentDigestId, false);
}
async function rollbackRevision(projectId, revisionId, version) {
  if (!version) {
    version = revisionId;
    revisionId = projectId;
    projectId = currentDigestId;
  }
  if (!projectId || !revisionId) return;
  if (!revisionPreview && projectDirty && currentDigestId) {
    await saveRemoteDraft("before rollback", true);
  }
  try {
    if (projectId !== currentDigestId) {
      await loadRemoteDigest(projectId, false);
    }
    const data = await apiRequest("/digests/" + projectId + "/rollback", {
      method: "POST",
      body: JSON.stringify({ revisionId })
    });
    revisionPreview = null;
    loadState(data.digest.state);
    currentProjectTitle = data.digest.title || currentProjectTitle || digestTitle();
    lastRemoteSnapshot = captureState();
    lastRemoteTitle = currentProjectTitle;
    projectDirty = false;
    rememberSnapshot(lastRemoteSnapshot);
    saveLocalDraft();
    render(false);
    await refreshRemoteRevisions();
    if (historyProjectId === projectId) {
      const history = await apiRequest("/digests/" + projectId + "/revisions");
      historyRevisions = history.revisions || [];
    }
    setSaveStatus("Откат к v" + (version || data.digest.currentVersion));
  } catch (err) {
    console.error("Rollback failed:", err);
    setSaveStatus("Ошибка отката");
  }
}
function confirmRollbackRevision(projectId, revisionId, version) {
  if (!version) {
    version = revisionId;
    revisionId = projectId;
    projectId = currentDigestId;
  }
  openConfirmDialog({
    title: "Откатить проект к версии v" + version + "?",
    message: "Текущая версия будет сохранена перед откатом.",
    confirmText: "Откатить",
    danger: false,
    onConfirm: () => rollbackRevision(projectId, revisionId, version)
  });
}

// ============================================================
//   DRAG AND DROP
// ============================================================
let dragSrcCompKey = null;
let dragSrcBlockId = null;

function clearDragOver() {
  document.querySelectorAll('.block-card').forEach(el => el.classList.remove('drag-over'));
}

function onDragStart(e, compKey, blockId) {
  const tag = e.target.tagName.toLowerCase();
  if (['input', 'textarea', 'select', 'button'].includes(tag)) { e.preventDefault(); return; }
  dragSrcCompKey = compKey;
  dragSrcBlockId = blockId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', blockId);
  setTimeout(() => { if (e.currentTarget) e.currentTarget.style.opacity = '0.4'; }, 0);
}
function onDragEnd(e) {
  e.currentTarget.style.opacity = '';
  e.currentTarget.draggable = false;
  clearDragOver();
}
function onDragOver(e, compKey, blockId) {
  e.preventDefault();
  if (dragSrcBlockId === blockId) return;
  clearDragOver();
  e.currentTarget.classList.add('drag-over');
}
function onDrop(e, compKey, blockId) {
  e.stopPropagation();
  clearDragOver();
  if (!dragSrcBlockId || dragSrcBlockId === blockId || dragSrcCompKey !== compKey) return;
  const comp = getComp(compKey);
  if (!comp) return;
  const fromIdx = comp.blocks.findIndex(b => b.id === dragSrcBlockId);
  const toIdx   = comp.blocks.findIndex(b => b.id === blockId);
  if (fromIdx < 0 || toIdx < 0) return;
  const [moved] = comp.blocks.splice(fromIdx, 1);
  comp.blocks.splice(toIdx, 0, moved);
  dragSrcCompKey = null;
  dragSrcBlockId = null;
  render();
}

// ============================================================
//   ITEM DRAG AND DROP
// ============================================================
let dragSrcItemCompKey    = null;
let dragSrcItemBlockId    = null;
let dragSrcItemIdx        = null;
let dragInsertBefore      = true;
let dragSrcIsMetricsGroup = false;

function clearItemDragOver() {
  document.querySelectorAll('.item-block, .metrics-group-card').forEach(el => el.classList.remove('insert-before', 'insert-after'));
}
function onItemDragStart(e, compKey, blockId, idx) {
  dragSrcItemCompKey = compKey;
  dragSrcItemBlockId = blockId;
  dragSrcItemIdx     = idx;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => { if (e.currentTarget) e.currentTarget.style.opacity = '0.4'; }, 0);
}
function onItemDragEnd(e) {
  e.currentTarget.style.opacity = '';
  e.currentTarget.draggable = false;
  clearItemDragOver();
}
function onItemDragOver(e, compKey, blockId, idx) {
  e.preventDefault(); e.stopPropagation();
  clearItemDragOver();
  const rect = e.currentTarget.getBoundingClientRect();
  dragInsertBefore = e.clientY < rect.top + rect.height / 2;
  e.currentTarget.classList.add(dragInsertBefore ? 'insert-before' : 'insert-after');
}
function onItemDrop(e, compKey, blockId, idx) {
  e.stopPropagation();
  clearItemDragOver();
  if (dragSrcItemCompKey !== compKey || dragSrcItemBlockId !== blockId) return;

  if (dragSrcIsMetricsGroup) {
    const b = getBlock(compKey, blockId);
    if (!b) return;
    let targetIdx = dragInsertBefore ? idx : idx + 1;
    const metricsBefore = b.items.slice(0, targetIdx).filter(it => it.kind === 'metric').length;
    const adjustedIdx = targetIdx - metricsBefore;
    const metrics = b.items.filter(it => it.kind === 'metric');
    b.items = b.items.filter(it => it.kind !== 'metric');
    b.items.splice(adjustedIdx, 0, ...metrics);
    dragSrcIsMetricsGroup = false;
    dragSrcItemCompKey = null; dragSrcItemBlockId = null;
    render(); return;
  }

  if (dragSrcItemIdx === null) return;
  let targetIdx = dragInsertBefore ? idx : idx + 1;
  if (dragSrcItemIdx === targetIdx || dragSrcItemIdx + 1 === targetIdx) return;
  const b = getBlock(compKey, blockId);
  if (!b) return;
  const [moved] = b.items.splice(dragSrcItemIdx, 1);
  if (dragSrcItemIdx < targetIdx) targetIdx--;
  b.items.splice(targetIdx, 0, moved);
  dragSrcItemCompKey = null; dragSrcItemBlockId = null; dragSrcItemIdx = null;
  render();
}
function removeAllMetrics(compKey, blockId) {
  const b = getBlock(compKey, blockId);
  if (!b) return;
  b.items = b.items.filter(it => it.kind !== 'metric');
  render();
}
function onMetricsGroupDragStart(e, compKey, blockId) {
  dragSrcItemCompKey = compKey;
  dragSrcItemBlockId = blockId;
  dragSrcItemIdx = null;
  dragSrcIsMetricsGroup = true;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => { if (e.currentTarget) e.currentTarget.style.opacity = '0.4'; }, 0);
}
function onMetricsGroupDragEnd(e) {
  e.currentTarget.style.opacity = '';
  e.currentTarget.draggable = false;
  clearItemDragOver();
  dragSrcIsMetricsGroup = false;
}
function onMetricsGroupDragOver(e, compKey, blockId) {
  e.preventDefault(); e.stopPropagation();
  if (dragSrcItemCompKey !== compKey || dragSrcItemBlockId !== blockId || dragSrcIsMetricsGroup) return;
  clearItemDragOver();
  const rect = e.currentTarget.getBoundingClientRect();
  dragInsertBefore = e.clientY < rect.top + rect.height / 2;
  e.currentTarget.classList.add(dragInsertBefore ? 'insert-before' : 'insert-after');
}
function onMetricsGroupDrop(e, compKey, blockId) {
  e.stopPropagation();
  clearItemDragOver();
  if (dragSrcIsMetricsGroup || dragSrcItemIdx === null || dragSrcItemCompKey !== compKey || dragSrcItemBlockId !== blockId) return;
  const b = getBlock(compKey, blockId);
  if (!b) return;
  const metricsIdx = b.items.reduce((acc, it, i) => it.kind === 'metric' ? i : acc, -1);
  let targetIdx = dragInsertBefore
    ? b.items.findIndex(it => it.kind === 'metric')
    : (metricsIdx >= 0 ? metricsIdx + 1 : b.items.length);
  if (targetIdx < 0) targetIdx = 0;
  if (dragSrcItemIdx === targetIdx || dragSrcItemIdx + 1 === targetIdx) {
    dragSrcItemCompKey = null; dragSrcItemBlockId = null; dragSrcItemIdx = null; return;
  }
  const [moved] = b.items.splice(dragSrcItemIdx, 1);
  if (dragSrcItemIdx < targetIdx) targetIdx--;
  b.items.splice(targetIdx, 0, moved);
  dragSrcItemCompKey = null; dragSrcItemBlockId = null; dragSrcItemIdx = null;
  render();
}

// ============================================================
//   COMPANY ACTIONS
// ============================================================
function toggleCompany(compKey) {
  const c = getComp(compKey);
  if (c) { c.collapsed = !c.collapsed; render(); }
}

// ============================================================
//   BLOCK ACTIONS
// ============================================================
function addBlock(compKey, blockType) {
  const comp = getComp(compKey);
  if (!comp) return;
  const id = createBlockId();
  comp.blocks.push({ id, type: blockType, collapsed: false, items: [{ kind: "news", title: "", text: "", photos: [], photoLayout: "bottom", photoRatio: "4/3" }], comment: "" });
  const menu = document.querySelector(`[data-addmenu="${compKey}"]`);
  if (menu) menu.classList.remove("open");
  render();
}
function removeBlock(compKey, blockId) {
  if (!confirm("Удалить блок?")) return;
  const comp = getComp(compKey);
  if (!comp) return;
  comp.blocks = comp.blocks.filter(b => b.id !== blockId);
  render();
}
function toggleBlock(compKey, blockId) {
  const b = getBlock(compKey, blockId);
  if (b) { b.collapsed = !b.collapsed; render(); }
}
function moveBlock(compKey, blockId, dir) {
  const comp = getComp(compKey);
  if (!comp) return;
  const i = comp.blocks.findIndex(b => b.id === blockId);
  const j = i + dir;
  if (j < 0 || j >= comp.blocks.length) return;
  [comp.blocks[i], comp.blocks[j]] = [comp.blocks[j], comp.blocks[i]];
  render();
}
function toggleAddMenu(compKey) {
  const menu = document.querySelector(`[data-addmenu="${compKey}"]`);
  if (menu) menu.classList.toggle("open");
}

// ============================================================
//   ITEM ACTIONS
// ============================================================
function addItem(compKey, blockId, kind) {
  const b = getBlock(compKey, blockId);
  if (!b) return;
  if (kind === "news") b.items.push({ kind: "news", title: "", text: "", photos: [], photoLayout: "bottom", photoRatio: "4/3" });
  else                 b.items.push({ kind: "metric", tiles: [{ value: "", label: "", delta: "", direction: "up" }] });
  render();
}
function removeItem(compKey, blockId, idx) {
  const b = getBlock(compKey, blockId);
  if (!b) return;
  b.items.splice(idx, 1);
  render();
}
function updateBlockField(compKey, blockId, field, value) {
  const b = getBlock(compKey, blockId);
  if (!b) return;
  b[field] = value;
  debouncedRenderAndSave();
}
function updateItemField(compKey, blockId, idx, field, value) {
  const b = getBlock(compKey, blockId);
  if (!b || !b.items[idx]) return;
  b.items[idx][field] = value;
  debouncedRenderAndSave();
}
function updateLetterField(field, value) {
  state.letter[field] = value;
  debouncedRenderAndSave();
}

// ============================================================
//   IMAGE HANDLING
// ============================================================
function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
async function loadItemPhotos(compKey, blockId, idx, files) {
  if (!files || !files.length) return;
  const b = getBlock(compKey, blockId);
  if (!b || !b.items[idx]) return;
  if (!b.items[idx].photos) b.items[idx].photos = [];
  const ratio = _ratioCtx.ratio || b.items[idx].photoRatio || '4/3';
  for (const f of files) b.items[idx].photos.push({ src: await readFileAsDataURL(f), ratio });
  render();
}
function removeItemPhoto(compKey, blockId, itemIdx, photoIdx) {
  const b = getBlock(compKey, blockId);
  if (!b || !b.items[itemIdx]) return;
  b.items[itemIdx].photos.splice(photoIdx, 1);
  render();
}

let _ratioCtx = {};
function showRatioModal(compKey, blockId, idx) {
  _ratioCtx = { compKey, blockId, idx };
  document.getElementById('ratioModal').style.display = 'flex';
}
function confirmRatio(ratio) {
  const { compKey, blockId, idx } = _ratioCtx;
  _ratioCtx.ratio = ratio;
  const b = getBlock(compKey, blockId);
  if (b && b.items[idx]) { b.items[idx].photoRatio = ratio; }
  document.getElementById('ratioModal').style.display = 'none';
  document.getElementById(`mi_${blockId}_${idx}`).click();
}
function closeRatioModal() {
  document.getElementById('ratioModal').style.display = 'none';
}

// ============================================================
//   EDITOR — LETTER SECTION
// ============================================================
function digestCoverEditorHTML() {
  const imgHTML = state.digestCover
    ? `<div class="media-row">
         <div class="media-thumb">
           <img src="${state.digestCover}">
           <button class="media-del" onclick="removeDigestCover()">✕</button>
         </div>
       </div>`
    : `<button class="media-add-btn" onclick="document.getElementById('digestCoverInput').click()">
         Загрузить обложку +<br>
         <small style="font-weight:400;opacity:0.7">PNG · рекомендуемый размер: 2360 × 835 px</small>
       </button>`;
  return `
    <div class="letter-section">
      <div class="letter-head">
        <span class="letter-title">Обложка дайджеста</span>
      </div>
      <div class="letter-body">
        ${imgHTML}
        <input type="file" id="digestCoverInput" accept="image/*" style="display:none" onchange="loadDigestCover(this.files)">
      </div>
    </div>`;
}
async function loadDigestCover(files) {
  if (!files || !files.length) return;
  state.digestCover = await readFileAsDataURL(files[0]);
  render();
}
function removeDigestCover() {
  state.digestCover = "";
  render();
}

function letterEditorHTML() {
  const l = state.letter;
  const coverHTML = l.cover
    ? `<div class="media-row">
         <div class="media-thumb">
           <img src="${l.cover}">
           <button class="media-del" onclick="removeLetterCover()">✕</button>
         </div>
       </div>`
    : `<button class="media-add-btn" onclick="document.getElementById('letterCoverInput').click()">Добавить обложку +</button>`;
  return `
    <div class="letter-section ${l.collapsed ? 'collapsed' : ''}">
      <div class="letter-head" onclick="toggleLetterSection()">
        <span class="letter-title">Обращение редакции</span>
        <span>${collapseIcon(l.collapsed)}</span>
      </div>
      <div class="letter-body">
        <label>Заголовок</label>
        <input type="text" maxlength="200" value="${escAttr(l.title)}" oninput="updateLetterField('title',this.value);document.getElementById('cc_ltitle').textContent=this.value.length+'/200'">
        <div class="char-counter" id="cc_ltitle">${(l.title||'').length}/200</div>
        <label>Текст (каждый абзац — с новой строки)</label>
        <textarea maxlength="600" oninput="updateLetterField('paragraphs',this.value);document.getElementById('cc_lpara').textContent=this.value.length+'/600'" style="min-height:90px">${escText(l.paragraphs)}</textarea>
        <div class="char-counter" id="cc_lpara">${(l.paragraphs||'').length}/600</div>
        <label>Подпись</label>
        <input type="text" value="${escAttr(l.signature)}" oninput="updateLetterField('signature',this.value)">
        <label>Обложка</label>
        ${coverHTML}
        <input type="file" id="letterCoverInput" accept="image/*" style="display:none" onchange="loadLetterCover(this.files)">
      </div>
    </div>
  `;
}
function toggleLetterSection() {
  state.letter.collapsed = !state.letter.collapsed;
  renderEditor();
}
async function loadLetterCover(files) {
  if (!files || !files.length) return;
  state.letter.cover = await readFileAsDataURL(files[0]);
  render();
}
function removeLetterCover() {
  state.letter.cover = "";
  render();
}

// ============================================================
//   EDITOR — ITEMS
// ============================================================
function itemEditorHTML(compKey, blockId, item, idx) {
  if (item.kind === "news") {
    const photos = (item.photos || []).map((p, pi) => {
      const src = typeof p === 'string' ? p : p.src;
      return `<div class="media-thumb">
        <img src="${src}">
        <button class="media-del" onclick="removeItemPhoto('${compKey}','${blockId}',${idx},${pi})">✕</button>
      </div>`;
    }).join("");
    return `
      <div class="item-block" ${itemDragAttrs(compKey, blockId, idx)}>
        <div class="item-del-row">
          ${ITEM_DRAG_HANDLE}
          <button class="item-del-btn" onclick="removeItem('${compKey}','${blockId}',${idx})">✕</button>
        </div>
        <input type="text" placeholder="Заголовок новости" maxlength="600" value="${escAttr(item.title || '')}" oninput="updateItemField('${compKey}','${blockId}',${idx},'title',this.value);document.getElementById('cc_t_${blockId}_${idx}').textContent=this.value.length+'/600'">
        <div class="char-counter" id="cc_t_${blockId}_${idx}">${(item.title||'').length}/600</div>
        <textarea placeholder="Текст новости" maxlength="600" oninput="updateItemField('${compKey}','${blockId}',${idx},'text',this.value);document.getElementById('cc_p_${blockId}_${idx}').textContent=this.value.length+'/600'">${escText(item.text || '')}</textarea>
        <div class="char-counter" id="cc_p_${blockId}_${idx}">${(item.text||'').length}/600</div>
        ${photos ? `<div class="media-row">${photos}</div>` : ""}
        <button class="media-add-btn" onclick="showRatioModal('${compKey}','${blockId}',${idx})">Добавить медиа +</button>
        <input type="file" id="mi_${blockId}_${idx}" accept="image/*" multiple style="display:none" onchange="loadItemPhotos('${compKey}','${blockId}',${idx},this.files)">
        <div class="layout-toggle">
          <button class="layout-btn ${(item.photoLayout||'bottom')==='bottom'?'active':''}" onclick="updateItemField('${compKey}','${blockId}',${idx},'photoLayout','bottom')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg> Снизу</button>
          <button class="layout-btn ${item.photoLayout==='side'?'active':''}" onclick="updateItemField('${compKey}','${blockId}',${idx},'photoLayout','side')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg> Сбоку</button>
        </div>
      </div>`;
  }
  const tiles = item.tiles && item.tiles.length ? item.tiles
    : [{ value: item.value||'', label: item.label||'', delta: item.delta||'', direction: item.direction||'up' }];
  const tilesHTML = tiles.map((tile, ti) => `
    <div class="metric-tile-row">
      <div class="row2">
        <input type="text" placeholder="Значение (напр. 150,8М)" value="${escAttr(tile.value||'')}" oninput="updateMetricTile('${compKey}','${blockId}',${idx},${ti},'value',this.value)">
        <input type="text" placeholder="Подпись" value="${escAttr(tile.label||'')}" oninput="updateMetricTile('${compKey}','${blockId}',${idx},${ti},'label',this.value)">
      </div>
      <div class="row2" style="margin-top:4px;">
        <input type="text" placeholder="Динамика (опц.)" value="${escAttr(tile.delta||'')}" oninput="updateMetricTile('${compKey}','${blockId}',${idx},${ti},'delta',this.value)">
        <div style="display:flex;gap:6px;align-items:center;min-width:0;overflow:hidden;">
          <select style="flex:1;min-width:0;width:0" onchange="updateMetricTile('${compKey}','${blockId}',${idx},${ti},'direction',this.value)">
            <option value="up"   ${tile.direction==='up'   ?'selected':''}>🟢 рост</option>
            <option value="down" ${tile.direction==='down' ?'selected':''}>🔴 падение</option>
            <option value="none" ${tile.direction==='none' ?'selected':''}>⚪ нейтрально</option>
          </select>
          ${tiles.length > 1 ? `<button class="item-del-btn" onclick="removeMetricTile('${compKey}','${blockId}',${idx},${ti})">✕</button>` : ''}
        </div>
      </div>
    </div>`).join('<div class="metric-tile-sep"></div>');
  return `
    <div class="item-block item-block-metric" ${itemDragAttrs(compKey, blockId, idx)}>
      <div class="item-del-row">
        ${ITEM_DRAG_HANDLE}
        <span class="metric-label-tag">Метрика</span>
        <button class="item-del-btn" onclick="removeItem('${compKey}','${blockId}',${idx})">✕</button>
      </div>
      ${tilesHTML}
      <button class="add-tile-btn" onclick="addMetricTile('${compKey}','${blockId}',${idx})">+ Добавить ещё</button>
    </div>`;
}
function updateMetricTile(compKey, blockId, itemIdx, tileIdx, field, value) {
  const b = getBlock(compKey, blockId);
  if (!b || !b.items[itemIdx]) return;
  if (!b.items[itemIdx].tiles) b.items[itemIdx].tiles = [{ value:'', label:'', delta:'', direction:'up' }];
  b.items[itemIdx].tiles[tileIdx][field] = value;
  debouncedRenderAndSave();
}
function addMetricTile(compKey, blockId, itemIdx) {
  const b = getBlock(compKey, blockId);
  if (!b || !b.items[itemIdx]) return;
  if (!b.items[itemIdx].tiles) b.items[itemIdx].tiles = [];
  b.items[itemIdx].tiles.push({ value: '', label: '', delta: '', direction: 'up' });
  render();
}
function removeMetricTile(compKey, blockId, itemIdx, tileIdx) {
  const b = getBlock(compKey, blockId);
  if (!b || !b.items[itemIdx] || !b.items[itemIdx].tiles) return;
  b.items[itemIdx].tiles.splice(tileIdx, 1);
  render();
}

// ============================================================
//   EDITOR — BLOCKS
// ============================================================
function blockEditorHTML(compKey, block) {
  const meta  = getCompMeta(compKey);
  const label = getBlockLabel(block.type);
  const items = block.items.map((it, i) => itemEditorHTML(compKey, block.id, it, i)).join("");
  return `
    <div class="block-card ${block.collapsed ? 'collapsed' : ''}" data-id="${block.id}"
         draggable="false"
         ondragstart="onDragStart(event,'${compKey}','${block.id}')"
         ondragend="onDragEnd(event)"
         ondragover="onDragOver(event,'${compKey}','${block.id}')"
         ondrop="onDrop(event,'${compKey}','${block.id}')">
      <div class="block-head">
        <span class="drag-handle" onmousedown="this.closest('.block-card').draggable=true" onmouseup="this.closest('.block-card').draggable=false"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="9" cy="5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="9" cy="19" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="15" cy="19" r="2"/></svg></span>
        <span class="block-badge" style="background:${meta.color}">${label}</span>
        <span class="block-actions">
          <button class="icon-btn" onclick="moveBlock('${compKey}','${block.id}',-1)" title="Вверх"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg></button>
          <button class="icon-btn" onclick="moveBlock('${compKey}','${block.id}',1)"  title="Вниз"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg></button>
          <button class="icon-btn" onclick="removeBlock('${compKey}','${block.id}')" title="Удалить"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
          <button class="icon-btn" onclick="toggleBlock('${compKey}','${block.id}')">${collapseIcon(block.collapsed)}</button>
        </span>
      </div>
      <div class="block-body">
        ${items}
        <div class="item-add-row">
          <button class="add-item-btn" onclick="addItem('${compKey}','${block.id}','news')">Новость +</button>
          <button class="add-item-btn" onclick="addItem('${compKey}','${block.id}','metric')">Метрика +</button>
        </div>
        <input type="text" class="comment-input" placeholder="Комментарий" value="${escAttr(block.comment || '')}" oninput="updateBlockField('${compKey}','${block.id}','comment',this.value)">
      </div>
    </div>`;
}

// ============================================================
//   EDITOR — COMPANIES
// ============================================================
function companyEditorHTML(compState) {
  const meta     = getCompMeta(compState.key);
  const blocks   = compState.blocks.map(b => blockEditorHTML(compState.key, b)).join("");
  const addItems = BLOCK_TYPES.map(t =>
    `<div class="add-menu-item" onclick="addBlock('${compState.key}','${t.key}')">${t.label}</div>`
  ).join("");
  return `
    <div class="company-section ${compState.collapsed ? 'collapsed' : ''}">
      <div class="company-head" onclick="toggleCompany('${compState.key}')">
        <span class="company-dot" style="background:${meta.color}"></span>
        <span class="company-name">${escText(meta.name)}</span>
        <span class="company-actions" onclick="event.stopPropagation()">
          <button type="button" class="company-json-btn" onclick="importCompanyJSON('${compState.key}')" title="Импорт JSON в ${escAttr(meta.name)}">Импорт</button>
          <button type="button" class="company-json-btn" onclick="exportCompanyJSON('${compState.key}')" title="Экспорт JSON из ${escAttr(meta.name)}">Экспорт</button>
        </span>
        <span class="company-chevron">${collapseIcon(compState.collapsed)}</span>
      </div>
      <div class="company-body">
        ${blocks}
        <div class="add-block-wrap">
          <div class="add-block-trigger" onclick="toggleAddMenu('${compState.key}')">Новый блок <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></div>
          <div class="add-block-menu" data-addmenu="${compState.key}">${addItems}</div>
        </div>
      </div>
    </div>`;
}

function renderEditor() {
  const el = document.getElementById("editor");
  if (!el) return;
  el.innerHTML = digestCoverEditorHTML() + letterEditorHTML() + state.companies.map(c => companyEditorHTML(c)).join("");
  initTextareas();
  el.querySelectorAll("input, textarea, select, button").forEach(control => {
    control.disabled = !!revisionPreview;
  });
}

// ============================================================
//   PREVIEW RENDERERS
// ============================================================
function pageCover() {
  if (!state.digestCover) return "";
  return `<div class="page cover"><img src="${state.digestCover}" alt=""></div>`;
}

function pageLetter() {
  const l = state.letter;
  const paras = (l.paragraphs || "").split("\n").filter(p => p.trim()).map(p => `<p>${escText(p)}</p>`).join("");
  const bgStyle = l.cover ? ` style="background-image:url('${l.cover}');background-size:cover;background-position:center;"` : '';
  return `
    <div class="page letter"${bgStyle}>
      <div class="letter-body-card">
        <h2>${escText(l.title)}</h2>
        ${paras}
        <div class="signature">${escText(l.signature)}</div>
      </div>
    </div>`;
}

function pageCompanyDivider(compKey) {
  const meta = getCompMeta(compKey);
  return `
    <div class="page divider theme-${meta.theme}">
      <img src="logos/logo-${meta.key}.svg" class="divider-logo" alt="${escAttr(meta.name)}">
    </div>`;
}

function metricGridHTML(tiles) {
  if (!tiles.length) return "";
  const cols = tiles.length === 1 ? 'cols-1' : tiles.length === 3 ? 'cols-3' : '';
  return `
    <div class="kpi-grid ${cols}">
      ${tiles.map(t => `
        <div class="kpi-tile">
          <div class="value">${escText(t.value || "")}</div>
          <div class="label">${escText(t.label || "")}</div>
          ${t.delta ? `<div class="delta ${t.direction || 'up'}">${escText(t.delta)}</div>` : ""}
        </div>`).join("")}
    </div>`;
}

function newsItemHTML(it) {
  const photos = it.photos || [];
  const textBlock = `
    ${it.title ? `<h4>${escText(it.title)}</h4>` : ""}
    ${it.text  ? `<p>${escText(it.text).replace(/\n/g, '<br>')}</p>`   : ""}`;
  const photoSlice = photos.slice(0, 4);
  const photoCount = photoSlice.length;
  const photoRatioVals = photoSlice.map(p => {
    const r = typeof p === 'string' ? (it.photoRatio || '4/3') : (p.ratio || '4/3');
    const [rw, rh] = r.split('/').map(Number);
    return { r, val: rw / rh };
  });
  const gridCols = photoCount > 1
    ? ` style="grid-template-columns:${photoRatioVals.map(x => x.val.toFixed(3)+'fr').join(' ')}"`
    : '';
  const photoGrid = photos.length ? `
    <div class="pt-photos n${photoCount}"${gridCols}>
      ${photoSlice.map((p, i) => {
        const src = typeof p === 'string' ? p : p.src;
        return `<div class="pt-img" style="aspect-ratio:${photoRatioVals[i].r}"><img src="${escAttr(src)}" alt=""></div>`;
      }).join("")}
    </div>` : "";
  if (photos.length && it.photoLayout === 'side') {
    return `
      <div class="news-with-photo">
        <div class="news-side-text">${textBlock}</div>
        ${photoGrid.replace('class="pt-photos', 'class="pt-photos side-photos')}
      </div>`;
  }
  return `
    <div class="news-block">
      <div class="ach-item">
        <div class="ach-content">${textBlock}</div>
      </div>${photoGrid}
    </div>`;
}

function pageBlock(compKey, block) {
  const meta      = getCompMeta(compKey);
  const label     = getBlockLabel(block.type);
  const shortName = meta.name.split("(")[0].trim();
  const itemsHTML = block.items.map(it => {
    if (it.kind === 'metric') {
      const tiles = it.tiles && it.tiles.length ? it.tiles
        : [{ value: it.value||'', label: it.label||'', delta: it.delta||'', direction: it.direction||'up' }];
      return metricGridHTML(tiles);
    }
    return newsItemHTML(it);
  }).join('');

  const footer = block.comment ? `<div class="footer-note">ⓘ ${escText(block.comment)}</div>` : "";
  return `
    <div class="page content theme-${meta.theme}">
      <div class="header">
        <h2>${escText(label)}</h2>
        <img src="logos/logo-${meta.key}.svg" class="company-logo" alt="${escAttr(meta.name)}">
      </div>
      <div class="ach-items">${itemsHTML}</div>
      ${footer}
    </div>`;
}

function renderPreview() {
  const pv = document.getElementById("preview");
  if (!pv) return;
  const hasContent = state.companies.some(c => c.blocks.length > 0);
  if (!hasContent) {
    pv.innerHTML = `<div class="empty-state"><img src="logos/kao.svg" class="empty-kao"><div>здесь пока пусто</div></div>`;
    return;
  }
  let html = pageCover() + pageLetter();
  for (const comp of state.companies) {
    if (!comp.blocks.length) continue;
    html += pageCompanyDivider(comp.key);
    for (const block of comp.blocks) html += pageBlock(comp.key, block);
  }
  pv.innerHTML = html;
}

function renderAuthScreen() {
  const el = document.getElementById("authScreen");
  if (!el) return;
  renderShellState();
  if (currentUser || checkingSession) {
    el.innerHTML = "";
    return;
  }

  const registerHref = PUBLIC_BASE_PATH ? PUBLIC_BASE_PATH + "/register.html" : "register.html";
  el.innerHTML = `
    <div class="auth-card">
      <div class="auth-brand">
        <img src="logos/logo-skladka.svg" alt="">
        <div>
          <h1>Складка</h1>
          <p>Введите код доступа, чтобы войти.</p>
        </div>
      </div>
      <form class="auth-form" onsubmit="submitAuthForm(event)">
        <label>Код доступа
          <input id="authCode" type="text" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" autocomplete="one-time-code" value="${escAttr(authDraft.code)}" oninput="authDraft.code=this.value" placeholder="8 цифр" autofocus>
        </label>
        ${authError ? `<div class="auth-error">${escText(authError)}</div>` : ""}
        <button class="auth-submit" type="submit" ${authBusy ? "disabled" : ""}>
          ${authBusy ? "Подождите..." : "Войти"}
        </button>
      </form>
    </div>`;
}

function digestTypeLabel(type) {
  return { analytical: "Аналитический", farming: "Фермерский", company_group: "Группа компаний" }[type] || "";
}

function renderProjectList() {
  const query = projectSearch.trim().toLowerCase();
  const projects = remoteDigests
    .slice()
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    .filter(d => !query || (d.title || "Новый проект").toLowerCase().includes(query));

  if (!remoteDigests.length) {
    return `
      <div class="project-empty">
        <strong>Проектов пока нет</strong>
        <span>Создайте первый проект, и он сразу сохранится в базе.</span>
      </div>`;
  }
  if (!projects.length) {
    return `
      <div class="project-empty">
        <strong>Ничего не найдено</strong>
        <span>Попробуйте изменить поисковый запрос.</span>
      </div>`;
  }

  return projects
    .map(d => {
      const active = d.id === currentDigestId;
      const title = d.title || "Новый проект";
      const updated = formatProjectDate(d.updatedAt || d.createdAt);
      const isRenaming = renamingProjectId === d.id;
      return `
        <article class="project-item ${active ? "active" : ""}">
          <div class="project-item-main">
            ${isRenaming ? `
              <input class="project-rename-input" value="${escAttr(renameDraft)}" oninput="renameDraft=this.value" onkeydown="if(event.key==='Enter')finishRenameProject();if(event.key==='Escape')cancelRenameProject()">
              <div class="project-rename-actions">
                <button type="button" onclick="finishRenameProject()">Готово</button>
                <button type="button" onclick="cancelRenameProject()">Отмена</button>
              </div>` : `
              <div class="project-item-title-row">
                <span class="project-item-title">${escText(title)}</span>
                ${d.digestType ? `<span class="project-type-badge">${escText(digestTypeLabel(d.digestType))}</span>` : ""}
              </div>
              <span class="project-item-meta">Изменен: ${escText(updated)}</span>`}
          </div>
          <div class="project-item-actions">
            ${active ? `<span class="project-opened">Открыт</span>` : `<button type="button" onclick="openProject('${escAttr(d.id)}')">Открыть</button>`}
            <button type="button" class="project-menu-button" onclick="toggleProjectMenu(event, '${escAttr(d.id)}')" aria-label="Меню проекта">&#8942;</button>
          </div>
        </article>`;
    }).join("");
}

function renderProjectMenu() {
  if (!projectMenuOpenId) return "";
  const digest = remoteDigests.find(d => d.id === projectMenuOpenId);
  if (!digest) return "";
  const top = projectMenuPosition ? projectMenuPosition.top : 92;
  const right = projectMenuPosition ? projectMenuPosition.right : 24;
  const id = escAttr(digest.id);
  const active = digest.id === currentDigestId;
  return `
    <div class="project-menu-layer" style="top:${top}px;right:${right}px" onclick="event.stopPropagation()">
      ${active ? `<button type="button" disabled>Открыт</button>` : `<button type="button" onclick="openProject('${id}')">Открыть</button>`}
      <button type="button" onclick="startRenameProject('${id}')">Переименовать</button>
      ${active ? `<button type="button" onclick="saveCurrentProjectFromMenu()">Сохранить сейчас</button>` : ""}
      ${active ? `<button type="button" onclick="toggleAutosaveFromMenu()">Автосохранение: ${autosaveEnabled ? "включено" : "выключено"}</button>` : ""}
      <button type="button" onclick="exportProjectJSON('${id}')">Экспортировать JSON</button>
      <button type="button" onclick="importJSON('${id}')">Импорт JSON в этот проект</button>
      <button type="button" onclick="openProjectHistory('${id}')">История версий</button>
      <button type="button" class="danger-text" onclick="confirmDeleteProject('${id}')">Удалить</button>
    </div>`;
}

function renderRevisionHistory(projectId, revisions) {
  const list = revisions || remoteRevisions;
  if (!list.length) {
    return `<div class="panel-empty-line">Версий пока нет.</div>`;
  }
  return list
    .slice()
    .sort((a, b) => (b.version || 0) - (a.version || 0))
    .map(revision => {
      const activeProject = projectId || currentDigestId;
      const digest = projectById(activeProject);
      const currentProjectVersion = activeProject === currentDigestId ? currentVersion() : (digest?.currentVersion || 0);
      const isCurrent = !revisionPreview && revision.version === currentProjectVersion;
      const isPreview = revisionPreview && revisionPreview.id === revision.id;
      return `
        <div class="revision-item ${isCurrent || isPreview ? "active" : ""}">
          <div>
            <strong>v${revision.version}</strong>
            <span>${escText(formatProjectDate(revision.createdAt))}${isCurrent ? " · текущая" : ""}${isPreview ? " · просмотр" : ""}</span>
          </div>
          <div class="revision-actions">
            ${isCurrent ? `<span class="project-opened">Текущая</span>` : `<button type="button" onclick="openRevisionPreview('${escAttr(activeProject)}', '${escAttr(revision.id)}')">Открыть</button>`}
            ${isCurrent ? "" : `<button type="button" onclick="confirmRollbackRevision('${escAttr(activeProject)}', '${escAttr(revision.id)}', ${revision.version})">Откатить</button>`}
          </div>
        </div>`;
    }).join("");
}

function renderConfirmDialog() {
  if (!confirmDialog) return "";
  const actionButtons = Array.isArray(confirmDialog.actions) && confirmDialog.actions.length
    ? confirmDialog.actions.map((action, i) => `
          <button type="button" class="${escAttr(action.className || "primary-action")}" onclick="acceptConfirmDialogAction(${i})">${escText(action.text || "Подтвердить")}</button>
        `).join("")
    : `<button type="button" class="${confirmDialog.danger ? "danger-action" : "primary-action"}" onclick="acceptConfirmDialog()">${escText(confirmDialog.confirmText || "Подтвердить")}</button>`;
  return `
    <div class="confirm-backdrop">
      <div class="confirm-dialog">
        <h3>${escText(confirmDialog.title || "Подтвердите действие")}</h3>
        <p>${escText(confirmDialog.message || "")}</p>
        <div class="confirm-actions">
          <button type="button" onclick="closeConfirmDialog()">Отмена</button>
          ${actionButtons}
        </div>
      </div>
    </div>`;
}

function renderNewProjectDialog() {
  if (!newProjectDialogOpen) return "";
  return `
    <div class="confirm-backdrop" onclick="closeNewProjectDialog()">
      <form class="confirm-dialog project-name-dialog" onclick="event.stopPropagation()" onsubmit="event.preventDefault();createProjectFromDialog()">
        <h3>Новый проект</h3>
        <label>Название
          <input class="drawer-title-input" value="${escAttr(newProjectTitle)}" oninput="newProjectTitle=this.value" placeholder="Новый проект" autofocus>
        </label>
        <label>Тип дайджеста
          <select class="new-project-type-select" value="${escAttr(newProjectType)}" onchange="newProjectType=this.value">
            <option value="analytical" ${newProjectType === "analytical" ? "selected" : ""}>Аналитический</option>
            <option value="farming" ${newProjectType === "farming" ? "selected" : ""}>Фермерский</option>
            <option value="company_group" ${newProjectType === "company_group" ? "selected" : ""}>Группа компаний</option>
          </select>
        </label>
        <div class="confirm-actions">
          <button type="button" onclick="closeNewProjectDialog()">Отмена</button>
          <button type="submit" class="primary-action">Создать</button>
        </div>
      </form>
    </div>`;
}

function renderProjectsDrawer() {
  if (!projectsPanelOpen) return "";
  const historyProject = historyProjectId ? projectById(historyProjectId) : null;
  if (historyProjectId) {
    return `
      <div class="projects-drawer-backdrop" onclick="closeProjectsPanel()">
        <aside class="projects-drawer" onclick="handleProjectsDrawerClick(event)">
          <header class="drawer-header">
            <div>
              <h2>История версий</h2>
              <p>${escText(historyProject?.title || "Новый проект")}</p>
            </div>
            <button type="button" class="drawer-close" onclick="closeProjectHistory()">Назад</button>
          </header>
          <section class="drawer-section history-screen">
            ${revisionPreview && revisionPreview.projectId === historyProjectId ? `
              <div class="revision-preview-banner">
                <strong>Просмотр v${revisionPreview.version}</strong>
                <span>Редактирование и автосохранение временно выключены.</span>
                <div class="drawer-action-row">
                  <button type="button" onclick="returnToCurrentRevision()">Вернуться к текущей</button>
                  <button type="button" class="primary-action" onclick="confirmRollbackRevision('${escAttr(historyProjectId)}', '${escAttr(revisionPreview.id)}', ${revisionPreview.version})">Откатить</button>
                </div>
              </div>` : ""}
            ${historyLoading ? `<div class="panel-empty-line">Загружаем версии...</div>` : `<div class="revision-list">${renderRevisionHistory(historyProjectId, historyRevisions)}</div>`}
          </section>
          <div id="projectMenuLayerHost">${renderProjectMenu()}</div>
        </aside>
      </div>`;
  }

  return `
    <div class="projects-drawer-backdrop" onclick="closeProjectsPanel()">
      <aside class="projects-drawer" onclick="handleProjectsDrawerClick(event)">
        <header class="drawer-header">
          <div>
            <h2>Проекты</h2>
            <p>Проекты доступны только вашему аккаунту.</p>
          </div>
          <button type="button" class="drawer-close" onclick="closeProjectsPanel()">Закрыть</button>
        </header>

        <button type="button" class="drawer-new-project" onclick="openNewProjectDialog()">+ Новый проект</button>
        <input class="project-search" type="search" placeholder="Поиск проекта..." value="${escAttr(projectSearch)}" oninput="setProjectSearch(this.value)">

        <section class="drawer-section projects-list-section">
          <div class="projects-heading plain-heading">
            <span>Мои проекты</span>
          </div>
          <div id="projectList" class="project-list">${renderProjectList()}</div>
        </section>
        ${renderAdminSection()}
        <div id="projectMenuLayerHost">${renderProjectMenu()}</div>
      </aside>
    </div>`;
}

// ============================================================
//   ADMIN PANEL
// ============================================================
function openAdminPanel() {
  adminPanelOpen = true;
  adminVisibleLimit = ADMIN_USERS_PAGE_SIZE;
  loadAdminUsers();
  renderAccountBar();
}
function closeAdminPanel() {
  adminPanelOpen = false;
  adminError = "";
  renderAccountBar();
}
async function loadAdminUsers() {
  try {
    const data = await apiRequest("/admin/users");
    adminUsers = data.users || [];
  } catch (err) {
    console.error("loadAdminUsers:", err);
  }
  renderAccountBar();
}
async function createAdminUser() {
  const name = adminNewUserName.trim();
  if (!name || adminBusy) return;
  adminBusy = true;
  adminError = "";
  renderAccountBar();
  try {
    await apiRequest("/admin/users", { method: "POST", body: JSON.stringify({ name }) });
    adminNewUserName = "";
    await loadAdminUsers();
  } catch (err) {
    adminError = err.message || "Ошибка создания пользователя";
  } finally {
    adminBusy = false;
    renderAccountBar();
  }
}
function setAdminSearch(value) {
  adminSearch = value || "";
  adminVisibleLimit = ADMIN_USERS_PAGE_SIZE;
  syncAdminUserList();
}
function showMoreAdminUsers() {
  adminVisibleLimit += ADMIN_USERS_PAGE_SIZE;
  syncAdminUserList();
}
async function deleteAdminUser(userId) {
  if (!userId || adminDeletingUserId) return;
  adminDeletingUserId = userId;
  adminError = "";
  renderAccountBar();
  try {
    await apiRequest("/admin/users/" + userId, { method: "DELETE" });
    adminUsers = adminUsers.filter(u => u.id !== userId);
    setSaveStatus("Пользователь удалён");
  } catch (err) {
    adminError = err.message || "Ошибка удаления пользователя";
  } finally {
    adminDeletingUserId = "";
    renderAccountBar();
  }
}
function confirmDeleteAdminUser(userId) {
  const user = adminUsers.find(u => u.id === userId);
  if (!user || user.id === currentUser?.id) return;
  const label = user.name || user.email || user.accessCode || "пользователь";
  openConfirmDialog({
    title: `Удалить пользователя "${label}"?`,
    message: "Будут удалены его доступ, сессии и сохранённые проекты. Это действие нельзя отменить.",
    confirmText: "Удалить",
    danger: true,
    onConfirm: () => deleteAdminUser(userId)
  });
}
async function toggleAdminRole(userId, makeAdmin) {
  const user = adminUsers.find(u => u.id === userId);
  if (!user) return;
  try {
    const data = await apiRequest(`/admin/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ isAdmin: makeAdmin })
    });
    const idx = adminUsers.findIndex(u => u.id === userId);
    if (idx !== -1) adminUsers[idx] = data.user;
    if (adminEditUser?.id === userId) adminEditUser = data.user;
    render();
  } catch (e) {
    alert("Не удалось изменить права: " + e.message);
  }
}
function filteredAdminUsers() {
  const query = adminSearch.trim().toLowerCase();
  return query
    ? adminUsers.filter(u => [u.name, u.email, u.accessCode].some(value => (value || "").toLowerCase().includes(query)))
    : adminUsers;
}
function renderAdminListMeta() {
  const filteredUsers = filteredAdminUsers();
  return `${filteredUsers.length} из ${adminUsers.length}`;
}
function openAdminEdit(id) {
  const user = adminUsers.find(u => u.id === id);
  if (!user) return;
  adminEditUser = user;
  adminEditDraftName = user.name || "";
  render();
}
function closeAdminEditModal() {
  adminEditUser = null;
  adminEditDraftName = "";
  render();
}
async function saveAdminEditName() {
  if (!adminEditUser || !adminEditDraftName.trim()) return;
  try {
    const data = await apiRequest(`/admin/users/${adminEditUser.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: adminEditDraftName.trim() })
    });
    const idx = adminUsers.findIndex(u => u.id === adminEditUser.id);
    if (idx !== -1) adminUsers[idx] = data.user;
    adminEditUser = data.user;
    render();
  } catch (e) {
    alert("Не удалось сохранить: " + e.message);
  }
}
function renderAdminEditModal() {
  if (!adminEditUser) return "";
  const u = adminEditUser;
  const isSelf = u.id === currentUser?.id;
  return `
    <div class="confirm-backdrop" onclick="closeAdminEditModal()">
      <div class="admin-edit-modal" onclick="event.stopPropagation()">
        <div class="admin-edit-modal-header">
          <span class="admin-edit-modal-title">${escText(u.name || "Пользователь")}</span>
          ${u.accessCode ? `<code class="admin-user-code">${escText(u.accessCode)}</code>` : ""}
          ${u.isAdmin ? `<span class="admin-user-admin-badge">Админ</span>` : ""}
        </div>
        <div class="admin-edit-modal-body">
          <label class="admin-edit-label">Имя
            <input class="admin-edit-input" type="text" value="${escAttr(adminEditDraftName)}"
              oninput="adminEditDraftName=this.value"
              onkeydown="if(event.key==='Enter')saveAdminEditName()">
          </label>
          <button type="button" class="admin-edit-save-btn" onclick="saveAdminEditName()">Сохранить имя</button>
        </div>
        <div class="admin-edit-modal-actions">
          ${!isSelf ? `<button type="button" class="admin-dd-item" onclick="toggleAdminRole('${escAttr(u.id)}', ${!u.isAdmin})">
            ${u.isAdmin ? "Снять права администратора" : "Назначить администратором"}
          </button>` : ""}
          ${!isSelf ? `<button type="button" class="admin-dd-item admin-dd-danger" onclick="confirmDeleteAdminUser('${escAttr(u.id)}')">
            Удалить пользователя
          </button>` : ""}
        </div>
        <button type="button" class="admin-edit-close-btn" onclick="closeAdminEditModal()">Закрыть</button>
      </div>
    </div>`;
}
function renderAdminUserList() {
  const visibleUsers = adminUsers.slice(0, adminVisibleLimit);
  const rows = visibleUsers.map(u => {
    const isSelf = u.id === currentUser?.id;
    return `
    <div class="admin-user-row">
      <div class="admin-user-info">
        <span class="admin-user-name">${escText(u.name || "—")}</span>
        ${u.accessCode ? `<code class="admin-user-code">${escText(u.accessCode)}</code>` : ""}
        ${u.email ? `<span class="admin-user-email">${escText(u.email)}</span>` : ""}
        ${u.isAdmin ? `<span class="admin-user-admin-badge">Админ</span>` : ""}
        ${isSelf ? `<span class="admin-user-self">Это вы</span>` : ""}
      </div>
      <div class="admin-user-actions">
        ${!isSelf ? `<button type="button" class="admin-user-edit-btn" onclick="openAdminEdit('${escAttr(u.id)}')" title="Редактировать">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>` : ""}
      </div>
    </div>`;
  }).join("");
  return adminUsers.length ? rows : `<div class="panel-empty-line">Нет пользователей</div>`;
}
function renderAdminListFooter() {
  const filteredUsers = filteredAdminUsers();
  const visibleCount = Math.min(adminVisibleLimit, filteredUsers.length);
  const hasMoreUsers = filteredUsers.length > visibleCount;
  return hasMoreUsers ? `<button type="button" class="admin-load-more" onclick="showMoreAdminUsers()">Показать ещё ${Math.min(ADMIN_USERS_PAGE_SIZE, filteredUsers.length - visibleCount)}</button>` : "";
}
function syncAdminUserList() {
  const list = document.getElementById("adminUserList");
  if (list) list.innerHTML = renderAdminUserList();
  const meta = document.getElementById("adminListMeta");
  if (meta) meta.textContent = renderAdminListMeta();
  const footer = document.getElementById("adminListFooter");
  if (footer) footer.innerHTML = renderAdminListFooter();
}
function renderAdminSection() {
  if (!currentUser?.isAdmin) return "";
  if (!adminPanelOpen) {
    return `
      <section class="drawer-section">
        <div class="projects-heading plain-heading"><span>Администратор</span></div>
        <button type="button" class="drawer-new-project" onclick="openAdminPanel()">Управление пользователями</button>
      </section>`;
  }
  return `
    <section class="drawer-section">
      <div class="projects-heading plain-heading">
        <span>Пользователи</span>
        <small id="adminListMeta" class="admin-list-meta">${renderAdminListMeta()}</small>
      </div>
      <form class="admin-create-form" onsubmit="event.preventDefault(); createAdminUser()">
        <input class="project-search" style="flex:1;margin:0" type="text" placeholder="Имя нового пользователя..." value="${escAttr(adminNewUserName)}" oninput="adminNewUserName=this.value">
        <button type="submit" class="admin-create-btn" ${adminBusy ? "disabled" : ""}>${adminBusy ? "..." : "Создать"}</button>
      </form>
      ${adminError ? `<div class="auth-error" style="margin:0 0 8px">${escText(adminError)}</div>` : ""}
      <div id="adminUserList" class="admin-user-list">
        ${renderAdminUserList()}
      </div>
      <div id="adminListFooter" class="admin-list-footer">
        ${renderAdminListFooter()}
      </div>
    </section>`;
}

function renderToolbar() {
  const userInfo = document.getElementById("toolbarUserInfo");
  const logoutBtn = document.getElementById("toolbarLogoutBtn");
  if (!userInfo) return;
  if (!currentUser) {
    userInfo.innerHTML = "";
    if (logoutBtn) logoutBtn.hidden = true;
    return;
  }
  if (logoutBtn) logoutBtn.hidden = false;
  const displayId = currentUser.accessCode || "";
  userInfo.innerHTML = displayId ? `
    <div class="toolbar-id ${currentUser.isAdmin ? 'toolbar-id-admin' : ''}">
      ${currentUser.isAdmin ? '<span class="toolbar-id-admin-label">Администратор</span>' : '<span class="toolbar-id-label">Код</span>'}
      <span class="toolbar-id-value">${escText(displayId)}</span>
      <button type="button" class="toolbar-id-copy" onclick="copyUserId()" title="Скопировать">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      </button>
    </div>` : "";
}

function copyUserId() {
  const displayId = currentUser?.accessCode || currentUser?.email || "";
  if (!displayId) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(displayId).then(() => setSaveStatus("Скопировано"));
  } else {
    const el = document.createElement("textarea");
    el.value = displayId;
    Object.assign(el.style, { position: "fixed", opacity: "0" });
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    setSaveStatus("Скопировано");
  }
}

function renderAccountBar() {
  const el = document.getElementById("accountBar");
  if (!el) return;
  renderToolbar();
  renderAuthScreen();

  if (!currentUser) {
    el.innerHTML = "";
    return;
  }

  renderShellState();
  const title = projectTitle();

  el.innerHTML = `
    <section class="workspace-project-bar">
      <div class="workspace-project-current">
        <span class="workspace-project-title">${escText(title)}</span>
        <span id="mainSaveStatusPill" class="main-save-status ${saveStatusClass()}">
          <span class="status-dot"></span>
          <span id="mainSaveStatusText">${escText(saveStatusSummary())}</span>
        </span>
        ${saveStatusClass() === "error" ? `<button type="button" class="retry-save-button" onclick="saveRemoteNow()">Повторить</button>` : ""}
      </div>
      <button type="button" class="projects-open-button" onclick="openProjectsPanel()">Проекты</button>
    </section>
    ${renderProjectsDrawer()}
    ${renderNewProjectDialog()}
    ${renderConfirmDialog()}
    ${renderAdminEditModal()}`;
}

// ============================================================
//   FULL RENDER
// ============================================================
function render(persist = true) {
  renderEditor();
  renderPreview();
  renderAccountBar();
  if (persist) afterStateChanged("change");
}

// ============================================================
//   PERSIST / EXPORT
// ============================================================
function cloneJSON(value) {
  return JSON.parse(JSON.stringify(value));
}
function cloneBlocksWithFreshIds(blocks) {
  return cloneJSON(blocks).map(block => Object.assign({}, block, { id: createBlockId() }));
}
function showCompanyImportError(message) {
  const text = message || "Не удалось импортировать JSON компании.";
  setSaveStatus(text);
  renderAccountBar();
  alert(text);
}
function exportCompanyJSON(compKey) {
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
function importCompanyJSON(compKey) {
  companyImportTargetKey = compKey;
  pendingCompanyImport = null;
  const input = document.getElementById("companyFileInput");
  if (input) input.click();
}
function openCompanyImportChoice(data) {
  const targetMeta = getCompMeta(companyImportTargetKey);
  pendingCompanyImport = {
    companyKey: companyImportTargetKey,
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
function applyCompanyImport(mode) {
  if (!pendingCompanyImport || !companyImportTargetKey) return;
  const targetKey = companyImportTargetKey;
  const comp = getComp(targetKey);
  if (!comp) {
    pendingCompanyImport = null;
    companyImportTargetKey = "";
    showCompanyImportError("Секция компании не найдена.");
    return;
  }
  const nextBlocks = cloneBlocksWithFreshIds(pendingCompanyImport.blocks || []);
  if (mode === "replace") comp.blocks = nextBlocks;
  else comp.blocks.push(...nextBlocks);
  comp.collapsed = false;
  pendingCompanyImport = null;
  companyImportTargetKey = "";
  render(false);
  afterStateChanged(mode === "replace" ? "company json replace" : "company json append");
  setSaveStatus(mode === "replace" ? "JSON компании заменил блоки" : "JSON компании добавлен");
}
function exportJSON() {
  exportProjectJSON(currentDigestId);
}
async function exportProjectJSON(projectId) {
  closeProjectMenu();
  let title = projectTitle();
  let exportedState = state;
  if (authToken && projectId && projectId !== currentDigestId) {
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
function importJSON(projectId) {
  importTargetProjectId = projectId || currentDigestId;
  pendingImport = null;
  closeProjectMenu();
  document.getElementById("fileInput").click();
}
async function saveProjectBackup(projectId, title, projectState) {
  await apiRequest("/digests/" + projectId + "/autosave", {
    method: "PUT",
    body: JSON.stringify({ title, state: projectState, action: "backup before import" })
  });
}
async function performProjectImport() {
  if (!pendingImport || !importTargetProjectId) return;
  const targetId = importTargetProjectId;
  const targetTitle = projectTitleById(targetId);
  const nextState = pendingImport.state;
  pendingImport = null;
  importTargetProjectId = "";
  try {
    if (targetId === currentDigestId) {
      await saveProjectBackup(targetId, targetTitle, state);
      loadState(nextState);
      currentProjectTitle = targetTitle;
      render(false);
      rememberSnapshot(captureState());
      saveLocalDraft();
      projectDirty = true;
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
document.getElementById("fileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const nextState = importedState(data);
    if (!authToken || !importTargetProjectId) {
      loadState(nextState);
      currentProjectTitle = (data.title || nextState?.letter?.title || "Импортированный проект").trim() || "Импортированный проект";
      render(false);
      rememberSnapshot(captureState());
      saveLocalDraft();
      projectDirty = true;
      setSaveStatus("JSON загружен локально");
      renderAccountBar();
      return;
    }
    pendingImport = { state: nextState };
    const targetTitle = projectTitleById(importTargetProjectId);
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
    pendingImport = null;
    importTargetProjectId = "";
    setSaveStatus("Ошибка импорта JSON");
  }
});

document.getElementById("companyFileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const targetKey = companyImportTargetKey;
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
    pendingCompanyImport = null;
    companyImportTargetKey = "";
    showCompanyImportError(err.message || "Ошибка импорта JSON компании.");
  }
});

async function exportPDF() {
  if (!state.companies.some(c => c.blocks.length)) { alert("Сначала добавь хотя бы один блок."); return; }
  const pages = Array.from(document.querySelectorAll('#preview .page'));
  if (!pages.length) return;

  const jspdfNS = window.jspdf;
  if (!jspdfNS || !jspdfNS.jsPDF) { alert('Библиотека jsPDF не загружена.'); return; }
  const { jsPDF } = jspdfNS;

  const btn = document.querySelector('button.export-pdf');
  const titleEl = btn ? btn.querySelector('.ec-title') : null;
  const restore = titleEl ? titleEl.textContent : '';
  if (btn) btn.disabled = true;

  try {
    // Reuse the exact PNG export pipeline (pageToDataUrl @ scale 3) so PDF and
    // PNG render through one engine and look identical. Each digest page keeps
    // its own pixel size as a separate PDF page.
    let doc = null;
    for (let i = 0; i < pages.length; i++) {
      if (titleEl) titleEl.textContent = `Генерация ${i + 1} / ${pages.length}`;
      const page = pages[i];
      const w = Math.round(page.offsetWidth);
      const h = Math.round(page.scrollHeight);
      const orientation = w >= h ? 'l' : 'p';
      const dataUrl = await pageToDataUrl(page, 3);
      if (!doc) {
        doc = new jsPDF({ unit: 'px', format: [w, h], orientation, compress: true });
      } else {
        doc.addPage([w, h], orientation);
      }
      doc.addImage(dataUrl, 'PNG', 0, 0, w, h);
    }
    doc.save('digest.pdf');
  } catch (e) {
    console.error('PDF export error:', e);
    alert('Ошибка при генерации PDF. Проверь консоль.');
  } finally {
    if (titleEl) titleEl.textContent = restore || 'Скачать PDF';
    if (btn) btn.disabled = false;
  }
}


const exportSvgDataUrlCache = new Map();
const exportAssetBaseUrl = new URL(".", document.currentScript?.src || window.location.href).href;

function isSvgImageSrc(src) {
  return /\.svg(?:[?#].*)?$/i.test(src || "");
}

async function svgImageToDataUrl(src) {
  const url = new URL(src, exportAssetBaseUrl);
  const cacheKey = url.href;
  if (exportSvgDataUrlCache.has(cacheKey)) return exportSvgDataUrlCache.get(cacheKey);

  const response = await fetch(url.href, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Cannot load ${url.pathname}: ${response.status}`);
  const svgText = await response.text();
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  exportSvgDataUrlCache.set(cacheKey, dataUrl);
  return dataUrl;
}

async function inlineSvgImagesForExport(root) {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(images.map(async img => {
    const src = img.getAttribute("src") || img.currentSrc || img.src || "";
    if (!isSvgImageSrc(src)) return;

    try {
      img.setAttribute("src", await svgImageToDataUrl(src));
    } catch (err) {
      console.warn("SVG image was not inlined for export:", src, err);
    }
  }));
}

async function pageToDataUrl(page, scale) {
  const w = page.offsetWidth;
  const h = page.scrollHeight;

  const clone = page.cloneNode(true);
  clone.style.cssText = `position:fixed;top:-99999px;left:0;width:${w}px;margin:0;box-sizing:border-box;`;
  await inlineSvgImagesForExport(clone);

  document.body.appendChild(clone);

  await Promise.all(Array.from(clone.querySelectorAll('img')).map(img =>
    new Promise(res => { if (img.complete) res(); else { img.onload = res; img.onerror = res; } })
  ));

  try {
    const canvas = await html2canvas(clone, {
      scale,
      useCORS: false,
      backgroundColor: null,
      logging: false,
      width: w,
      height: h
    });
    return canvas.toDataURL('image/png');
  } finally {
    document.body.removeChild(clone);
  }
}

async function exportPNG() {
  if (!state.companies.some(c => c.blocks.length)) { alert("Сначала добавь хотя бы один блок."); return; }
  const pages = Array.from(document.querySelectorAll('#preview .page'));
  if (!pages.length) return;

  const btn = document.querySelector('button[onclick="exportPNG()"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Генерация...'; }

  try {
    const zip = new JSZip();
    for (let i = 0; i < pages.length; i++) {
      if (btn) btn.textContent = `⏳ ${i + 1} / ${pages.length}`;
      const dataUrl = await pageToDataUrl(pages[i], 3);
      zip.file(`page-${String(i + 1).padStart(2, '0')}.png`, dataUrl.split(',')[1], { base64: true });
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'digest' + '-pages.zip';
    a.click();
  } catch(e) {
    console.error('PNG export error:', e);
    alert('Ошибка при генерации PNG. Проверь консоль.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🖼 Скачать PNG'; }
  }
}

function clearAll() {
  confirmClearCurrentProject();
}

// ============================================================
//   RESIZE HANDLE
// ============================================================
(function() {
  const handle = document.getElementById('resizeHandle');
  const app    = document.querySelector('.app');
  let dragging = false;

  handle.addEventListener('mousedown', () => {
    dragging = true;
    handle.classList.add('dragging');
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const w = Math.min(Math.max(e.clientX, 520), window.innerWidth - 400);
    app.style.setProperty('--editor-w', w + 'px');
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
  });
})();

// ============================================================
//   INIT
// ============================================================
function init() {
  loadLocalDraft();
  booting = false;
  render(false);
  rememberSnapshot(captureState());
  saveLocalDraft();
  bootstrapRemoteSession();
}
init();
