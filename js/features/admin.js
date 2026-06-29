// ============================================================
//   ADMIN PANEL — user management (logic + views)
// ============================================================
import { g } from "../store.js";
import { apiRequest } from "../api.js";
import { ADMIN_USERS_PAGE_SIZE } from "../config.js";
import { escAttr, escText } from "../dom/escape.js";
import { render } from "../render.js";
import { renderAccountBar } from "../view/account.js";
import { setSaveStatus } from "../view/status.js";
import { openConfirmDialog } from "./projects.js";

export function openAdminPanel() {
  g.adminPanelOpen = true;
  g.adminVisibleLimit = ADMIN_USERS_PAGE_SIZE;
  loadAdminUsers();
  renderAccountBar();
}
export function closeAdminPanel() {
  g.adminPanelOpen = false;
  g.adminError = "";
  renderAccountBar();
}
export async function loadAdminUsers() {
  try {
    const data = await apiRequest("/admin/users");
    g.adminUsers = data.users || [];
  } catch (err) {
    console.error("loadAdminUsers:", err);
  }
  renderAccountBar();
}
export async function createAdminUser() {
  const name = g.adminNewUserName.trim();
  if (!name || g.adminBusy) return;
  g.adminBusy = true;
  g.adminError = "";
  renderAccountBar();
  try {
    await apiRequest("/admin/users", { method: "POST", body: JSON.stringify({ name }) });
    g.adminNewUserName = "";
    await loadAdminUsers();
  } catch (err) {
    g.adminError = err.message || "Ошибка создания пользователя";
  } finally {
    g.adminBusy = false;
    renderAccountBar();
  }
}
export function setAdminSearch(value) {
  g.adminSearch = value || "";
  g.adminVisibleLimit = ADMIN_USERS_PAGE_SIZE;
  syncAdminUserList();
}
export function showMoreAdminUsers() {
  g.adminVisibleLimit += ADMIN_USERS_PAGE_SIZE;
  syncAdminUserList();
}
export async function deleteAdminUser(userId) {
  if (!userId || g.adminDeletingUserId) return;
  g.adminDeletingUserId = userId;
  g.adminError = "";
  renderAccountBar();
  try {
    await apiRequest("/admin/users/" + userId, { method: "DELETE" });
    g.adminUsers = g.adminUsers.filter(u => u.id !== userId);
    setSaveStatus("Пользователь удалён");
  } catch (err) {
    g.adminError = err.message || "Ошибка удаления пользователя";
  } finally {
    g.adminDeletingUserId = "";
    renderAccountBar();
  }
}
export function confirmDeleteAdminUser(userId) {
  const user = g.adminUsers.find(u => u.id === userId);
  if (!user || user.id === g.currentUser?.id) return;
  const label = user.name || user.email || user.accessCode || "пользователь";
  openConfirmDialog({
    title: `Удалить пользователя "${label}"?`,
    message: "Будут удалены его доступ, сессии и сохранённые проекты. Это действие нельзя отменить.",
    confirmText: "Удалить",
    danger: true,
    onConfirm: () => deleteAdminUser(userId)
  });
}
export async function toggleAdminRole(userId, makeAdmin) {
  const user = g.adminUsers.find(u => u.id === userId);
  if (!user) return;
  try {
    const data = await apiRequest(`/admin/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ isAdmin: makeAdmin })
    });
    const idx = g.adminUsers.findIndex(u => u.id === userId);
    if (idx !== -1) g.adminUsers[idx] = data.user;
    if (g.adminEditUser?.id === userId) g.adminEditUser = data.user;
    render();
  } catch (e) {
    alert("Не удалось изменить права: " + e.message);
  }
}
export function filteredAdminUsers() {
  const query = g.adminSearch.trim().toLowerCase();
  return query
    ? g.adminUsers.filter(u => [u.name, u.email, u.accessCode].some(value => (value || "").toLowerCase().includes(query)))
    : g.adminUsers;
}
export function renderAdminListMeta() {
  const filteredUsers = filteredAdminUsers();
  return `${filteredUsers.length} из ${g.adminUsers.length}`;
}
export function openAdminEdit(id) {
  const user = g.adminUsers.find(u => u.id === id);
  if (!user) return;
  g.adminEditUser = user;
  g.adminEditDraftName = user.name || "";
  render();
}
export function closeAdminEditModal() {
  g.adminEditUser = null;
  g.adminEditDraftName = "";
  render();
}
export async function saveAdminEditName() {
  if (!g.adminEditUser || !g.adminEditDraftName.trim()) return;
  try {
    const data = await apiRequest(`/admin/users/${g.adminEditUser.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: g.adminEditDraftName.trim() })
    });
    const idx = g.adminUsers.findIndex(u => u.id === g.adminEditUser.id);
    if (idx !== -1) g.adminUsers[idx] = data.user;
    g.adminEditUser = data.user;
    render();
  } catch (e) {
    alert("Не удалось сохранить: " + e.message);
  }
}
export function renderAdminEditModal() {
  if (!g.adminEditUser) return "";
  const u = g.adminEditUser;
  const isSelf = u.id === g.currentUser?.id;
  return `
    <div class="confirm-backdrop" data-act="closeAdminEditModal" data-self>
      <div class="admin-edit-modal">
        <div class="admin-edit-modal-header">
          <span class="admin-edit-modal-title">${escText(u.name || "Пользователь")}</span>
          ${u.accessCode ? `<code class="admin-user-code">${escText(u.accessCode)}</code>` : ""}
          ${u.isAdmin ? `<span class="admin-user-admin-badge">Админ</span>` : ""}
          <button type="button" class="admin-edit-modal-close-x" data-act="closeAdminEditModal">✕</button>
        </div>
        <div class="admin-edit-modal-body">
          <label class="admin-edit-label">Имя
            <input class="admin-edit-input" type="text" value="${escAttr(g.adminEditDraftName)}"
              data-bind="adminEditDraftName" data-keydown='{"Enter":"saveAdminEditName"}'>
          </label>
          <button type="button" class="admin-edit-save-btn" data-act="saveAdminEditName">Сохранить имя</button>
        </div>
        <div class="admin-edit-modal-actions">
          ${!isSelf ? `<button type="button" class="admin-dd-item" data-act="toggleAdminRole" data-args='["${escAttr(u.id)}",${!u.isAdmin}]'>
            ${u.isAdmin ? "Снять права администратора" : "Назначить администратором"}
          </button>` : ""}
          ${!isSelf ? `<button type="button" class="admin-dd-item admin-dd-danger" data-act="confirmDeleteAdminUser" data-args='["${escAttr(u.id)}"]'>
            Удалить пользователя
          </button>` : ""}
        </div>
      </div>
    </div>`;
}
export function renderAdminUserList() {
  const visibleUsers = g.adminUsers.slice(0, g.adminVisibleLimit);
  const rows = visibleUsers.map(u => {
    const isSelf = u.id === g.currentUser?.id;
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
        ${!isSelf ? `<button type="button" class="admin-user-edit-btn" data-act="openAdminEdit" data-args='["${escAttr(u.id)}"]' title="Редактировать">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>` : ""}
      </div>
    </div>`;
  }).join("");
  return g.adminUsers.length ? rows : `<div class="panel-empty-line">Нет пользователей</div>`;
}
export function renderAdminListFooter() {
  const filteredUsers = filteredAdminUsers();
  const visibleCount = Math.min(g.adminVisibleLimit, filteredUsers.length);
  const hasMoreUsers = filteredUsers.length > visibleCount;
  return hasMoreUsers ? `<button type="button" class="admin-load-more" data-act="showMoreAdminUsers">Показать ещё ${Math.min(ADMIN_USERS_PAGE_SIZE, filteredUsers.length - visibleCount)}</button>` : "";
}
export function syncAdminUserList() {
  const list = document.getElementById("adminUserList");
  if (list) list.innerHTML = renderAdminUserList();
  const meta = document.getElementById("adminListMeta");
  if (meta) meta.textContent = renderAdminListMeta();
  const footer = document.getElementById("adminListFooter");
  if (footer) footer.innerHTML = renderAdminListFooter();
}
export function renderAdminSection() {
  if (!g.currentUser?.isAdmin) return "";
  if (!g.adminPanelOpen) {
    g.adminPanelOpen = true;
    g.adminVisibleLimit = ADMIN_USERS_PAGE_SIZE;
    loadAdminUsers();
  }
  return `
    <section class="drawer-section">
      <div class="projects-heading plain-heading">
        <span>Пользователи</span>
        <small id="adminListMeta" class="admin-list-meta">${renderAdminListMeta()}</small>
      </div>
      <form class="admin-create-form" data-act="createAdminUser">
        <input class="project-search" style="flex:1;margin:0" type="text" placeholder="Имя нового пользователя..." value="${escAttr(g.adminNewUserName)}" data-bind="adminNewUserName">
        <button type="submit" class="admin-create-btn" ${g.adminBusy ? "disabled" : ""}>${g.adminBusy ? "..." : "Создать"}</button>
      </form>
      ${g.adminError ? `<div class="auth-error" style="margin:0 0 8px">${escText(g.adminError)}</div>` : ""}
      <div id="adminUserList" class="admin-user-list">
        ${renderAdminUserList()}
      </div>
      <div id="adminListFooter" class="admin-list-footer">
        ${renderAdminListFooter()}
      </div>
    </section>`;
}
