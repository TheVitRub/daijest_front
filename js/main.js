// ============================================================
//   MAIN — entry point, window bridge, init
// ============================================================
import * as storeMod from "./store.js";
import * as stateMod from "./state/state.js";
import * as historyMod from "./state/history.js";
import * as storageMod from "./storage.js";
import * as apiMod from "./api.js";
import * as iconsMod from "./dom/icons.js";
import * as escapeMod from "./dom/escape.js";
import * as auth from "./features/auth.js";
import * as projects from "./features/projects.js";
import * as admin from "./features/admin.js";
import * as impexp from "./features/import-export.js";
import * as media from "./features/media-export.js";
import * as dnd from "./dnd.js";
import * as editor from "./view/editor.js";
import * as preview from "./view/preview.js";
import * as account from "./view/account.js";
import * as status from "./view/status.js";
import * as renderMod from "./render.js";

import { g } from "./store.js";
import { AUTH_TOKEN_KEY, CURRENT_DIGEST_KEY, AUTOSAVE_ENABLED_KEY } from "./config.js";
import { safeStorageGet, loadLocalDraft, saveLocalDraft } from "./storage.js";
import { render } from "./render.js";
import { captureState } from "./state/state.js";
import { rememberSnapshot } from "./state/history.js";
import { bootstrapRemoteSession } from "./features/auth.js";
import { closeProjectMenu } from "./features/projects.js";
import { attachDelegatedEvents } from "./events.js";

// Close the project 3-dot menu when clicking anywhere outside it (replaces the
// old stopPropagation + handleProjectsDrawerClick approach, which doesn't work
// with document-level delegation).
function attachProjectMenuDismiss() {
  document.addEventListener("click", (e) => {
    if (g.projectMenuOpenId &&
        !e.target.closest(".project-menu-layer") &&
        !e.target.closest(".project-menu-button")) {
      closeProjectMenu();
    }
  });
}

// --- Window bridge -------------------------------------------------------
// Inline on* handlers in the generated HTML run in the global scope and
// reference handler functions (and the store object `g`) by bare name. Until
// Phase 3 (event delegation) replaces them, expose everything on window.
Object.assign(
  window,
  storeMod, stateMod, historyMod, storageMod, apiMod, iconsMod, escapeMod,
  auth, projects, admin, impexp, media, dnd,
  editor, preview, account, status, renderMod,
);
window.g = g;

// --- Editor / preview resize handle -------------------------------------
function setupResizeHandle() {
  const handle = document.getElementById('resizeHandle');
  const app    = document.querySelector('.app');
  if (!handle || !app) return;
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
}

// --- Init ----------------------------------------------------------------
function init() {
  // Hydrate session fields from localStorage (deferred here to avoid a
  // store <-> storage import cycle).
  g.authToken = safeStorageGet(AUTH_TOKEN_KEY) || "";
  g.currentDigestId = safeStorageGet(CURRENT_DIGEST_KEY) || "";
  g.checkingSession = !!g.authToken;
  g.autosaveEnabled = safeStorageGet(AUTOSAVE_ENABLED_KEY) !== "false";

  setupResizeHandle();
  attachDelegatedEvents();
  attachProjectMenuDismiss();
  loadLocalDraft();
  g.booting = false;
  render(false);
  rememberSnapshot(captureState());
  saveLocalDraft();
  bootstrapRemoteSession();
}
init();
