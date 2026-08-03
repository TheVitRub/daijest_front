// ============================================================
//   AUTH — session, login-form submit, logout, bootstrap
// ============================================================
import { g } from "../store.js";
import { apiRequest } from "../api.js";
import { AUTH_TOKEN_KEY, CURRENT_DIGEST_KEY, STORAGE_KEY, ADMIN_USERS_PAGE_SIZE } from "../config.js";
import { safeStorageSet, safeStorageRemove } from "../storage.js";
import { resetStateToInitial } from "../state/state.js";
import { loadRemoteDigests } from "./projects.js";
import { renderAuthScreen, renderAccountBar } from "../view/account.js";
import { renderShellState, setSaveStatus } from "../view/status.js";

export function setAuthSession(data) {
  g.authToken = data.token || "";
  g.currentUser = data.user || null;
  g.authDraft = { email: "", name: "", password: "", confirm: "", code: "" };
  g.authError = "";
  if (g.authToken) safeStorageSet(AUTH_TOKEN_KEY, g.authToken);
  renderAuthScreen();
  renderAccountBar();
  renderShellState();
}

export function setAuthMode(mode) {
  g.authMode = mode === "register" ? "register" : "login";
  g.authError = "";
  renderAuthScreen();
}
export function authErrorMessage(message) {
  if (/invalid email or password/i.test(message)) return "Неверный email или пароль.";
  if (/invalid access code/i.test(message)) return "Неверный код доступа.";
  if (/already registered/i.test(message)) return "Такой email уже зарегистрирован.";
  if (/at least 8/i.test(message)) return "Пароль должен быть не короче 8 символов.";
  return message || "Не удалось выполнить запрос.";
}
export function validateAuthForm(email, password, confirm) {
  if (g.authMode === "code") {
    const code = (document.getElementById("authCode")?.value || g.authDraft.code || "").trim();
    if (!/^\d{8}$/.test(code)) return "Введите 8-значный цифровой код.";
    return "";
  }
  if (!email.trim() || !email.includes("@")) return "Введите корректный email.";
  if (password.length < 8) return "Пароль должен быть не короче 8 символов.";
  if (g.authMode === "register" && password !== confirm) return "Пароли не совпадают.";
  return "";
}
export async function submitAuthForm(event) {
  if (event) event.preventDefault();
  if (g.authBusy) return;
  const email = document.getElementById("authEmail")?.value || "";
  const name = document.getElementById("authName")?.value || "";
  const password = document.getElementById("authPassword")?.value || "";
  const confirm = document.getElementById("authPasswordConfirm")?.value || "";
  const code = (document.getElementById("authCode")?.value || "").trim();
  g.authDraft = { email, name, password, confirm, code };
  const validationError = validateAuthForm(email, password, confirm);
  if (validationError) {
    g.authError = validationError;
    renderAuthScreen();
    return;
  }

  g.authBusy = true;
  g.authError = "";
  renderAuthScreen();
  try {
    const path = g.authMode === "register" ? "/auth/register" : "/auth/login";
    let body;
    if (g.authMode === "code") {
      body = { code };
    } else if (g.authMode === "register") {
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
    setSaveStatus(g.authMode === "register" ? "Аккаунт создан" : "Проекты загружены");
  } catch (err) {
    g.authError = authErrorMessage(err.message);
    renderAuthScreen();
  } finally {
    g.authBusy = false;
    renderAuthScreen();
  }
}
export async function registerAccount() {
  g.authMode = "register";
  await submitAuthForm();
}
export async function loginAccount() {
  g.authMode = "login";
  await submitAuthForm();
}
export function logoutAccount() {
  g.authToken = "";
  g.currentUser = null;
  g.currentDigestId = "";
  g.remoteDigests = [];
  g.remoteRevisions = [];
  g.lastRemoteSnapshot = "";
  g.lastRemoteTitle = "";
  g.currentProjectTitle = "";
  g.projectDirty = false;
  g.savingRemote = false;
  g.projectsPanelOpen = false;
  g.projectMenuOpenId = "";
  g.projectMenuPosition = null;
  g.confirmDialog = null;
  g.newProjectDialogOpen = false;
  g.newProjectTitle = "";
  g.newProjectType = "analytical";
  g.currentDigestType = "analytical";
  g.adminPanelOpen = false;
  g.adminUsers = [];
  g.adminNewUserName = "";
  g.adminError = "";
  g.adminSearch = "";
  g.adminVisibleLimit = ADMIN_USERS_PAGE_SIZE;
  g.adminDeletingUserId = "";
  g.adminEditUser = null;
  g.adminEditDraftName = "";
  g.historyProjectId = "";
  g.historyRevisions = [];
  g.historyLoading = false;
  g.importTargetProjectId = "";
  g.pendingImport = null;
  g.companyImportTargetKey = "";
  g.pendingCompanyImport = null;
  g.revisionPreview = null;
  g.previewPage = 0;
  g.authMode = "code";
  g.authDraft = { email: "", name: "", password: "", confirm: "", code: "" };
  clearTimeout(g.remoteSaveTimer);
  resetStateToInitial();
  safeStorageRemove(AUTH_TOKEN_KEY);
  safeStorageRemove(CURRENT_DIGEST_KEY);
  safeStorageRemove(STORAGE_KEY);
  renderAuthScreen();
  renderAccountBar();
  renderShellState();
}
export async function bootstrapRemoteSession() {
  if (!g.authToken) {
    g.checkingSession = false;
    renderAuthScreen();
    renderAccountBar();
    renderShellState();
    return;
  }
  try {
    const data = await apiRequest("/me");
    g.currentUser = data.user;
    g.checkingSession = false;
    await loadRemoteDigests(true);
  } catch (_) {
    g.checkingSession = false;
    logoutAccount();
  }
}
