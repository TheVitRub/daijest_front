// ============================================================
//   ACTIONS — registry of handler functions for event delegation
// ============================================================
// Maps action name -> function. data-act="name" on an element looks the
// handler up here (no globals). Built from the same modules the temporary
// window bridge used.
import * as stateMod from "./state/state.js";
import * as historyMod from "./state/history.js";
import * as auth from "./features/auth.js";
import * as projects from "./features/projects.js";
import * as admin from "./features/admin.js";
import * as impexp from "./features/import-export.js";
import * as media from "./features/media-export.js";
import * as dnd from "./dnd.js";
import * as editor from "./view/editor.js";
import * as account from "./view/account.js";
import * as preview from "./view/preview.js";

export const fns = Object.assign(
  Object.create(null),
  stateMod, historyMod, auth, projects, admin, impexp, media, dnd, editor, account, preview,
);
