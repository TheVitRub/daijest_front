// ============================================================
//   ACCOUNT VIEW — auth screen, projects drawer, dialogs, toolbar, account bar
// ============================================================
import { g } from "../store.js";
import { escAttr, escText } from "../dom/escape.js";
import { PUBLIC_BASE_PATH } from "../config.js";
import { projectTitle } from "../state/state.js";
import { formatProjectDate, currentVersion, projectById } from "../features/projects.js";
import { saveStatusClass, saveStatusSummary, renderShellState, setSaveStatus } from "./status.js";
import { renderAdminSection, renderAdminEditModal } from "../features/admin.js";

export function renderAuthScreen() {
  const el = document.getElementById("authScreen");
  if (!el) return;
  renderShellState();
  if (g.currentUser || g.checkingSession) {
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
      <form class="auth-form" data-act="submitAuthForm">
        <label>Код доступа
          <input id="authCode" type="text" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" autocomplete="one-time-code" value="${escAttr(g.authDraft.code)}" data-bind="authDraft.code" placeholder="8 цифр" autofocus>
        </label>
        ${g.authError ? `<div class="auth-error">${escText(g.authError)}</div>` : ""}
        <button class="auth-submit" type="submit" ${g.authBusy ? "disabled" : ""}>
          ${g.authBusy ? "Подождите..." : "Войти"}
        </button>
      </form>
    </div>`;
}

export function digestTypeLabel(type) {
  return { analytical: "Аналитический", farming: "Фермерский", company_group: "Группа компаний" }[type] || "";
}

export function renderProjectList() {
  const query = g.projectSearch.trim().toLowerCase();
  const projects = g.remoteDigests
    .slice()
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    .filter(d => !query || (d.title || "Новый проект").toLowerCase().includes(query));

  if (!g.remoteDigests.length) {
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
      const active = d.id === g.currentDigestId;
      const title = d.title || "Новый проект";
      const updated = formatProjectDate(d.updatedAt || d.createdAt);
      const isRenaming = g.renamingProjectId === d.id;
      return `
        <article class="project-item ${active ? "active" : ""}">
          <div class="project-item-main">
            ${isRenaming ? `
              <input class="project-rename-input" value="${escAttr(g.renameDraft)}" data-bind="renameDraft" data-keydown='{"Enter":"finishRenameProject","Escape":"cancelRenameProject"}'>
              <div class="project-rename-actions">
                <button type="button" data-act="finishRenameProject">Готово</button>
                <button type="button" data-act="cancelRenameProject">Отмена</button>
              </div>` : `
              <div class="project-item-title-row">
                <span class="project-item-title">${escText(title)}</span>
                ${d.digestType ? `<span class="project-type-badge">${escText(digestTypeLabel(d.digestType))}</span>` : ""}
              </div>
              <span class="project-item-meta">Изменен: ${escText(updated)}</span>`}
          </div>
          <div class="project-item-actions">
            ${active ? `<span class="project-opened">Открыт</span>` : `<button type="button" data-act="openProject" data-args='["${escAttr(d.id)}"]'>Открыть</button>`}
            <button type="button" class="project-menu-button" data-act="toggleProjectMenu" data-args='["$event","${escAttr(d.id)}"]' aria-label="Меню проекта">&#8942;</button>
          </div>
        </article>`;
    }).join("");
}

export function renderProjectMenu() {
  if (!g.projectMenuOpenId) return "";
  const digest = g.remoteDigests.find(d => d.id === g.projectMenuOpenId);
  if (!digest) return "";
  const top = g.projectMenuPosition ? g.projectMenuPosition.top : 92;
  const right = g.projectMenuPosition ? g.projectMenuPosition.right : 24;
  const id = escAttr(digest.id);
  const active = digest.id === g.currentDigestId;
  return `
    <div class="project-menu-layer" style="top:${top}px;right:${right}px">
      ${active ? `<button type="button" disabled>Открыт</button>` : `<button type="button" data-act="openProject" data-args='["${id}"]'>Открыть</button>`}
      <button type="button" data-act="startRenameProject" data-args='["${id}"]'>Переименовать</button>
      ${active ? `<button type="button" data-act="saveCurrentProjectFromMenu">Сохранить сейчас</button>` : ""}
      ${active ? `<button type="button" data-act="toggleAutosaveFromMenu">Автосохранение: ${g.autosaveEnabled ? "включено" : "выключено"}</button>` : ""}
      <button type="button" data-act="exportProjectJSON" data-args='["${id}"]'>Экспортировать JSON</button>
      <button type="button" data-act="importJSON" data-args='["${id}"]'>Импорт JSON в этот проект</button>
      <button type="button" data-act="openProjectHistory" data-args='["${id}"]'>История версий</button>
      <button type="button" class="danger-text" data-act="confirmDeleteProject" data-args='["${id}"]'>Удалить</button>
    </div>`;
}

export function renderRevisionHistory(projectId, revisions) {
  const list = revisions || g.remoteRevisions;
  if (!list.length) {
    return `<div class="panel-empty-line">Версий пока нет.</div>`;
  }
  return list
    .slice()
    .sort((a, b) => (b.version || 0) - (a.version || 0))
    .map(revision => {
      const activeProject = projectId || g.currentDigestId;
      const digest = projectById(activeProject);
      const currentProjectVersion = activeProject === g.currentDigestId ? currentVersion() : (digest?.currentVersion || 0);
      const isCurrent = !g.revisionPreview && revision.version === currentProjectVersion;
      const isPreview = g.revisionPreview && g.revisionPreview.id === revision.id;
      return `
        <div class="revision-item ${isCurrent || isPreview ? "active" : ""}">
          <div>
            <strong>v${revision.version}</strong>
            <span>${escText(formatProjectDate(revision.createdAt))}${isCurrent ? " · текущая" : ""}${isPreview ? " · просмотр" : ""}</span>
          </div>
          <div class="revision-actions">
            ${isCurrent ? `<span class="project-opened">Текущая</span>` : `<button type="button" data-act="openRevisionPreview" data-args='["${escAttr(activeProject)}","${escAttr(revision.id)}"]'>Открыть</button>`}
            ${isCurrent ? "" : `<button type="button" data-act="confirmRollbackRevision" data-args='["${escAttr(activeProject)}","${escAttr(revision.id)}",${revision.version}]'>Откатить</button>`}
          </div>
        </div>`;
    }).join("");
}

export function renderConfirmDialog() {
  if (!g.confirmDialog) return "";
  const actionButtons = Array.isArray(g.confirmDialog.actions) && g.confirmDialog.actions.length
    ? g.confirmDialog.actions.map((action, i) => `
          <button type="button" class="${escAttr(action.className || "primary-action")}" data-act="acceptConfirmDialogAction" data-args='[${i}]'>${escText(action.text || "Подтвердить")}</button>
        `).join("")
    : `<button type="button" class="${g.confirmDialog.danger ? "danger-action" : "primary-action"}" data-act="acceptConfirmDialog">${escText(g.confirmDialog.confirmText || "Подтвердить")}</button>`;
  return `
    <div class="confirm-backdrop">
      <div class="confirm-dialog">
        <h3>${escText(g.confirmDialog.title || "Подтвердите действие")}</h3>
        <p>${escText(g.confirmDialog.message || "")}</p>
        <div class="confirm-actions">
          <button type="button" data-act="closeConfirmDialog">Отмена</button>
          ${actionButtons}
        </div>
      </div>
    </div>`;
}

export function renderNewProjectDialog() {
  if (!g.newProjectDialogOpen) return "";
  return `
    <div class="confirm-backdrop" data-act="closeNewProjectDialog" data-self>
      <form class="confirm-dialog project-name-dialog" data-act="createProjectFromDialog">
        <h3>Новый проект</h3>
        <label>Название
          <input class="drawer-title-input" value="${escAttr(g.newProjectTitle)}" data-bind="newProjectTitle" placeholder="Новый проект" autofocus>
        </label>
        <label>Тип дайджеста
          <select class="new-project-type-select" data-bind="newProjectType">
            <option value="analytical" ${g.newProjectType === "analytical" ? "selected" : ""}>Аналитический</option>
            <option value="farming" ${g.newProjectType === "farming" ? "selected" : ""}>Фермерский</option>
            <option value="company_group" ${g.newProjectType === "company_group" ? "selected" : ""}>Группа компаний</option>
          </select>
        </label>
        <div class="confirm-actions">
          <button type="button" data-act="closeNewProjectDialog">Отмена</button>
          <button type="submit" class="primary-action">Создать</button>
        </div>
      </form>
    </div>`;
}

export function renderProjectsDrawer() {
  if (!g.projectsPanelOpen) return "";
  const historyProject = g.historyProjectId ? projectById(g.historyProjectId) : null;
  if (g.historyProjectId) {
    return `
      <div class="projects-drawer-backdrop" data-act="closeProjectsPanel" data-self>
        <aside class="projects-drawer">
          <header class="drawer-header">
            <div>
              <h2>История версий</h2>
              <p>${escText(historyProject?.title || "Новый проект")}</p>
            </div>
            <button type="button" class="drawer-close" data-act="closeProjectHistory">Назад</button>
          </header>
          <section class="drawer-section history-screen">
            ${g.revisionPreview && g.revisionPreview.projectId === g.historyProjectId ? `
              <div class="revision-preview-banner">
                <strong>Просмотр v${g.revisionPreview.version}</strong>
                <span>Редактирование и автосохранение временно выключены.</span>
                <div class="drawer-action-row">
                  <button type="button" data-act="returnToCurrentRevision">Вернуться к текущей</button>
                  <button type="button" class="primary-action" data-act="confirmRollbackRevision" data-args='["${escAttr(g.historyProjectId)}","${escAttr(g.revisionPreview.id)}",${g.revisionPreview.version}]'>Откатить</button>
                </div>
              </div>` : ""}
            ${g.historyLoading ? `<div class="panel-empty-line">Загружаем версии...</div>` : `<div class="revision-list">${renderRevisionHistory(g.historyProjectId, g.historyRevisions)}</div>`}
          </section>
          <div id="projectMenuLayerHost">${renderProjectMenu()}</div>
        </aside>
      </div>`;
  }

  return `
    <div class="projects-drawer-backdrop" data-act="closeProjectsPanel" data-self>
      <aside class="projects-drawer">
        <header class="drawer-header">
          <div>
            <h2>Проекты</h2>
            <p>Проекты доступны только вашему аккаунту.</p>
          </div>
          <button type="button" class="drawer-close" data-act="closeProjectsPanel">Закрыть</button>
        </header>

        <button type="button" class="drawer-new-project" data-act="openNewProjectDialog">+ Новый проект</button>
        <input class="project-search" type="search" placeholder="Поиск проекта..." value="${escAttr(g.projectSearch)}" data-act="setProjectSearch" data-args='["$value"]'>

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
export function renderToolbar() {
  const userInfo = document.getElementById("toolbarUserInfo");
  const logoutBtn = document.getElementById("toolbarLogoutBtn");
  if (!userInfo) return;
  if (!g.currentUser) {
    userInfo.innerHTML = "";
    if (logoutBtn) logoutBtn.hidden = true;
    return;
  }
  if (logoutBtn) logoutBtn.hidden = false;
  const displayId = g.currentUser.accessCode || "";
  userInfo.innerHTML = displayId ? `
    <div class="toolbar-id ${g.currentUser.isAdmin ? 'toolbar-id-admin' : ''}">
      ${g.currentUser.isAdmin ? '<span class="toolbar-id-admin-label">Администратор</span>' : '<span class="toolbar-id-label">Код</span>'}
      <span class="toolbar-id-value">${escText(displayId)}</span>
      <button type="button" class="toolbar-id-copy" data-act="copyUserId" title="Скопировать">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      </button>
    </div>` : "";
}

export function copyUserId() {
  const displayId = g.currentUser?.accessCode || g.currentUser?.email || "";
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

export function renderAccountBar() {
  const el = document.getElementById("accountBar");
  if (!el) return;
  renderToolbar();
  renderAuthScreen();

  if (!g.currentUser) {
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
        ${saveStatusClass() === "error" ? `<button type="button" class="retry-save-button" data-act="saveRemoteNow">Повторить</button>` : ""}
      </div>
      <button type="button" class="projects-open-button" data-act="openProjectsPanel">Проекты</button>
    </section>
    ${renderProjectsDrawer()}
    ${renderNewProjectDialog()}
    ${renderConfirmDialog()}
    ${renderAdminEditModal()}`;
}
