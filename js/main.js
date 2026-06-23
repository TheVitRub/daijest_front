// ============================================================
//   MAIN — entry point + init
// ============================================================
// All handler wiring goes through event delegation (events.js + actions.js);
// the whole module graph loads transitively from those imports, so no module
// needs to be referenced explicitly here beyond what init() uses.
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
