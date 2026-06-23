# app.js Decomposition + Event Delegation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Разбить `daijest_front/app.js` (~2663 строки) на изолированные ES-модули и перевести все inline-обработчики на делегирование событий, не меняя поведение приложения.

**Architecture:** Идём в 4 фазы, каждая — отдельный коммит после ручной проверки. Сначала чиним баги на монолите (Фаза 1). Затем режем на модули, временно выставляя обработчики в `window`, чтобы inline `onclick` продолжали работать (Фаза 2 = промежуточное состояние «вариант A»). Затем переводим обработчики на `data-action` + делегирование и убираем мост в `window` (Фаза 3 = «вариант B»). В конце — чистка качества (Фаза 4).

**Tech Stack:** Чистый JS (ES-модули), без сборщика. Раздача статики через nginx в `docker-compose`. Сторонние библиотеки (`html2canvas`, `jszip`, `jspdf`) грузятся как глобальные classic-скрипты, модули обращаются к ним через `window.*`.

**Верификация:** автотестов в проекте нет. Вместо них в каждой задаче — ручной прогон в браузере. Базовый запуск:

```bash
cd /c/Users/diser/Desktop/prjcts/dijest
docker compose up -d --build
# открыть конструктор в браузере по адресу из docker-compose.yml / nginx.conf
```

Полный ручной чек-лист (прогоняется в конце каждой фазы) — в самом низу под заголовком «Regression Checklist».

---

## File Structure

Целевая раскладка (создаётся в Фазе 2). Папка `daijest_front/js/`:

| Файл | Ответственность |
|------|-----------------|
| `js/config.js` | Константы ключей storage, `COMPANIES`, `BLOCK_TYPES`, `API_BASE`, `PUBLIC_BASE_PATH` |
| `js/dom/escape.js` | `escapeHtml`, `escAttr`, `escText` |
| `js/dom/icons.js` | SVG-иконки (chevron, drag-handle, стрелки, корзина, копирование, карандаш, logout) |
| `js/state/state.js` | `state`, `INITIAL_STATE_SNAPSHOT`, геттеры (`getComp`, `getBlock`), мутации блоков/айтемов/метрик, `loadState`, `resetStateToInitial`, `createBlockId` |
| `js/state/history.js` | `localHistory`, `redoHistory`, `rememberSnapshot`, `applySnapshot`, `undoAction`, `redoAction`, `captureState` |
| `js/storage.js` | `safeStorageGet/Set/Remove`, `saveLocalDraft`, `loadLocalDraft`, `stateEnvelope`, `importedState` |
| `js/api.js` | `apiRequest`, токен сессии (`authToken` геттер/сеттер) |
| `js/features/auth.js` | экран входа, `submitAuthForm`, `logoutAccount`, `bootstrapRemoteSession`, `setAuthSession` |
| `js/features/projects.js` | CRUD дайджестов, ревизии, откат, переименование, шторка проектов |
| `js/features/admin.js` | админ-панель |
| `js/features/import-export.js` | импорт/экспорт JSON (проект и компания), обработчики `fileInput`/`companyFileInput` |
| `js/features/media-export.js` | `exportPNG`, `exportPDF`, `pageToDataUrl`, `svgImageToDataUrl`, `inlineSvgImagesForExport` — **логику не менять** |
| `js/dnd.js` | drag&drop блоков, айтемов, группы метрик |
| `js/view/editor.js` | `renderEditor` + `*EditorHTML` функции |
| `js/view/preview.js` | `renderPreview` + `page*`/`*HTML` функции превью |
| `js/view/account.js` | `renderAccountBar`, шторка, диалоги, админ-секция, тулбар |
| `js/view/status.js` | статус сохранения: enum + `renderSaveStatusOnly`, `saveStatusClass`, `saveStatusSummary`, `setSaveStatus` |
| `js/render.js` | `render`, `afterStateChanged`, `scheduleRemoteAutosave`, `debouncedRenderAndSave` |
| `js/actions.js` | таблица `actions` (имя действия → функция) — заполняется в Фазе 3 |
| `js/events.js` | навешивание делегированных слушателей — Фаза 3 |
| `js/main.js` | точка входа: импорты, `init`, (Фаза 2) мост в `window` |

Принцип общего состояния между модулями: модульные переменные, которые сейчас глобальные, переезжают в свои модули и экспортируются. Изменяемые скаляры (например `currentDigestId`) оборачиваем в геттер/сеттер или в один объект-стор, чтобы избежать проблем с привязкой импортов по значению (см. Task 2.1).

---

## ФАЗА 1 — Починка багов (на монолите)

Файл: `daijest_front/app.js`. Структуру не меняем.

### Task 1.1: Починить `toggleAdminRole`

**Files:**
- Modify: `daijest_front/app.js:2011-2028`

- [ ] **Step 1: Заменить тело функции**

Было (баг — `apiRequest` возвращает уже распарсенные данные, `res.json` не существует):

```js
    const res = await apiRequest(`/admin/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ isAdmin: makeAdmin })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "ошибка");
```

Стало:

```js
    const data = await apiRequest(`/admin/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ isAdmin: makeAdmin })
    });
```

(`apiRequest` сам бросает исключение при `!res.ok`, поэтому ручная проверка не нужна. Остальные строки функции не трогаем.)

- [ ] **Step 2: Проверка в браузере**

`docker compose up -d --build`, войти админом, открыть шторку проектов → «Управление пользователями» → у другого пользователя «Назначить администратором».
Ожидается: бейдж «Админ» появляется, без алерта с ошибкой.

- [ ] **Step 3: Commit**

```bash
git add daijest_front/app.js
git commit -m "fix: toggleAdminRole used apiRequest result as a Response"
```

### Task 1.2: Починить `saveAdminEditName`

**Files:**
- Modify: `daijest_front/app.js:2051-2067`

- [ ] **Step 1: Заменить вызов API так же, как в Task 1.1**

Было:

```js
    const res = await apiRequest(`/admin/users/${adminEditUser.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: adminEditDraftName.trim() })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "ошибка");
```

Стало:

```js
    const data = await apiRequest(`/admin/users/${adminEditUser.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: adminEditDraftName.trim() })
    });
```

- [ ] **Step 2: Проверка в браузере**

В модалке редактирования пользователя сменить имя → «Сохранить имя».
Ожидается: имя обновилось в списке, без алерта.

- [ ] **Step 3: Commit**

```bash
git add daijest_front/app.js
git commit -m "fix: saveAdminEditName used apiRequest result as a Response"
```

### Task 1.3: Удалить мёртвый код `adminEditOpenId`

**Files:**
- Modify: `daijest_front/app.js:73` (объявление), `daijest_front/app.js:2658-2660` (обработчик в `init`)

- [ ] **Step 1: Удалить объявление переменной**

Удалить строку:

```js
let adminEditOpenId = "";
```

- [ ] **Step 2: Удалить мёртвый обработчик в `init`**

Удалить блок:

```js
  document.addEventListener("click", () => {
    if (adminEditOpenId) { adminEditOpenId = ""; render(); }
  });
```

- [ ] **Step 3: Проверить, что нет других ссылок**

Run: `grep -n "adminEditOpenId" daijest_front/app.js`
Expected: пусто (ни одного вхождения).

- [ ] **Step 4: Проверка в браузере**

Перезапустить, открыть приложение, кликнуть по странице в разных местах.
Ожидается: ничего не сломалось, лишних перерисовок нет.

- [ ] **Step 5: Commit**

```bash
git add daijest_front/app.js
git commit -m "chore: remove dead adminEditOpenId code path"
```

### Task 1.4: Добавить null-guard'ы к слушателям при загрузке

**Files:**
- Modify: `daijest_front/app.js:2414` (fileInput), `daijest_front/app.js:2450` (companyFileInput), `daijest_front/app.js:2623-2628` (IIFE ресайза)

- [ ] **Step 1: Обернуть `fileInput`**

Было:

```js
document.getElementById("fileInput").addEventListener("change", async (e) => {
```

Стало:

```js
document.getElementById("fileInput")?.addEventListener("change", async (e) => {
```

- [ ] **Step 2: Обернуть `companyFileInput`**

Аналогично добавить `?.` перед `.addEventListener` на строке с `companyFileInput`.

- [ ] **Step 3: Защитить IIFE ресайза**

Было (начало IIFE):

```js
  const handle = document.getElementById('resizeHandle');
  const app    = document.querySelector('.app');
  let dragging = false;

  handle.addEventListener('mousedown', () => {
```

Стало — добавить ранний выход:

```js
  const handle = document.getElementById('resizeHandle');
  const app    = document.querySelector('.app');
  if (!handle || !app) return;
  let dragging = false;

  handle.addEventListener('mousedown', () => {
```

- [ ] **Step 4: Проверка в браузере**

Перезапустить, проверить импорт JSON (проект и компания) и перетаскивание разделителя панелей.
Ожидается: всё работает как раньше; в консоли нет ошибок при загрузке.

- [ ] **Step 5: Commit**

```bash
git add daijest_front/app.js
git commit -m "fix: guard load-time event listeners against missing elements"
```

### Task 1.5: Прогон регрессии Фазы 1

- [ ] Прогнать полный «Regression Checklist» (внизу). Особое внимание — админка.
- [ ] Если всё ок — Фаза 1 завершена.

---

## ФАЗА 2 — Разрезать на модули (обработчики не трогаем)

Цель: один в один перенести код в модули из таблицы File Structure, не меняя поведения. Inline `onclick` продолжают работать за счёт моста в `window` (Task 2.10). HTML на этом этапе меняется минимально: только переключение `app.js` на модульную точку входа.

**Общий принцип переноса:** функции и константы переезжают в свой модуль с `export`. Потребители добавляют `import`. Изменяемые скаляры выносим в стор (Task 2.1), чтобы импорты не «застывали» на старом значении.

### Task 2.1: Создать стор изменяемого состояния сессии

**Files:**
- Create: `daijest_front/js/state/session.js`

- [ ] **Step 1: Создать модуль-стор**

Изменяемые скаляры, которые сейчас глобальные `let` и переприсваиваются из разных мест, держим в одном объекте, чтобы ссылки не ломались между модулями.

```js
// Изменяемое состояние сессии/UI. Один объект — чтобы переприсваивание
// полей было видно всем импортёрам (в отличие от `export let`).
export const session = {
  authToken: "",
  currentUser: null,
  checkingSession: false,
  currentDigestId: "",
  remoteDigests: [],
  remoteRevisions: [],
  currentProjectTitle: "",
  currentDigestType: "analytical",
  lastRemoteSnapshot: "",
  lastRemoteTitle: "",
  projectDirty: false,
  savingRemote: false,
  autosaveEnabled: true,
  booting: true,
  revisionPreview: null,
  saveStatus: "",
};

export const ui = {
  projectsPanelOpen: false,
  projectSearch: "",
  projectMenuOpenId: "",
  projectMenuPosition: null,
  confirmDialog: null,
  newProjectDialogOpen: false,
  newProjectTitle: "",
  newProjectType: "analytical",
  renamingProjectId: "",
  renameDraft: "",
  historyProjectId: "",
  historyRevisions: [],
  historyLoading: false,
  importTargetProjectId: "",
  pendingImport: null,
  companyImportTargetKey: "",
  pendingCompanyImport: null,
};

export const admin = {
  panelOpen: false,
  users: [],
  newUserName: "",
  busy: false,
  error: "",
  search: "",
  visibleLimit: 50,
  deletingUserId: "",
  editUser: null,
  editDraftName: "",
};

export const auth = {
  mode: "code",
  error: "",
  busy: false,
  draft: { email: "", name: "", password: "", confirm: "", code: "" },
};
```

> **Замечание для исполнителя:** при переносе каждой функции заменяй обращения к старым глобалям на поля этих объектов (`currentDigestId` → `session.currentDigestId` и т.д.). Это самая кропотливая часть фазы — делай по одному модулю и проверяй в браузере после каждого.

- [ ] **Step 2: Commit** (после Task 2.2, вместе с первой партией модулей)

### Task 2.2: Вынести `config.js`, `dom/escape.js`, `dom/icons.js`

**Files:**
- Create: `daijest_front/js/config.js`
- Create: `daijest_front/js/dom/escape.js`
- Create: `daijest_front/js/dom/icons.js`

- [ ] **Step 1: `config.js`** — перенести строки `daijest_front/app.js:4-32` (`STORAGE_KEY`…`BLOCK_TYPES`, `PUBLIC_BASE_PATH`, `API_BASE`, `AUTOSAVE_DELAY_MS`, `HISTORY_LIMIT`, `ADMIN_USERS_PAGE_SIZE`) с `export const` перед каждой.

- [ ] **Step 2: `dom/escape.js`** — перенести `escAttr`, `escText` (`app.js:105-106`) с `export`. Полное экранирование откладываем до Фазы 4 — сейчас перенос «как есть».

- [ ] **Step 3: `dom/icons.js`** — вынести `ITEM_DRAG_HANDLE` (`app.js:207`) и `collapseIcon` (`app.js:109`) с `export`. Повторяющийся SVG drag-handle из `blockEditorHTML` пока оставить инлайном (дедуп — Фаза 4).

- [ ] **Step 4: Commit**

```bash
git add daijest_front/js/
git commit -m "refactor: extract config, escape, icons into modules"
```

### Task 2.3: Вынести `storage.js` и `state/`

**Files:**
- Create: `daijest_front/js/storage.js`, `daijest_front/js/state/state.js`, `daijest_front/js/state/history.js`

- [ ] **Step 1: `state/state.js`** — перенести `state`, `INITIAL_STATE_SNAPSHOT`, `loadState`, `resetStateToInitial`, `getComp`, `getBlock`, `createBlockId`/`blockIdSeq`, мутации блоков/айтемов/метрик (`addBlock`, `removeBlock`, `toggleBlock`, `moveBlock`, `addItem`, `removeItem`, `updateBlockField`, `updateItemField`, `updateLetterField`, `updateMetricTile`, `addMetricTile`, `removeMetricTile`, `loadItemPhotos`, `removeItemPhoto`). Импортировать `COMPANIES`, `BLOCK_TYPES` из config. Функции, дергающие `render`/`debouncedRenderAndSave`, импортируют их из `render.js` (создаётся в 2.9) — временно оставить TODO-импорт и закрыть в 2.9.

- [ ] **Step 2: `state/history.js`** — `captureState`, `rememberSnapshot`, `applySnapshot`, `undoAction`, `redoAction`, массивы `localHistory`/`redoHistory`, `HISTORY_LIMIT` из config.

- [ ] **Step 3: `storage.js`** — `safeStorageGet/Set/Remove`, `saveLocalDraft`, `loadLocalDraft`, `stateEnvelope`, `importedState`, `projectTitle`/`digestTitle` (или их оставить в state — на усмотрение, но согласованно).

- [ ] **Step 4: Проверка** — модули пока не подключены, приложение работает на старом `app.js`. Проверка: `node --check daijest_front/js/state/state.js` и аналогично для остальных (синтаксис).

- [ ] **Step 5: Commit**

```bash
git add daijest_front/js/
git commit -m "refactor: extract storage and state modules"
```

### Task 2.4: Вынести `api.js` и `features/auth.js`

**Files:**
- Create: `daijest_front/js/api.js`, `daijest_front/js/features/auth.js`

- [ ] **Step 1: `api.js`** — `apiRequest` (`app.js:307-315`), работа с `session.authToken`.
- [ ] **Step 2: `features/auth.js`** — `setAuthSession`, `setAuthMode`, `authErrorMessage`, `validateAuthForm`, `submitAuthForm`, `registerAccount`, `loginAccount`, `logoutAccount`, `bootstrapRemoteSession`, `renderAuthScreen`.
- [ ] **Step 3:** `node --check` на оба файла.
- [ ] **Step 4: Commit** `refactor: extract api and auth modules`

### Task 2.5: Вынести `features/projects.js`

**Files:**
- Create: `daijest_front/js/features/projects.js`

- [ ] **Step 1:** Перенести `loadRemoteDigests`, `refreshProjectListOnly`, `createRemoteDigest`, `newRemoteDigest`, диалог нового проекта, `saveRemoteNow`, `scheduleRemoteAutosave` (или в render.js — согласованно), `saveRemoteDraft`, `loadSelectedDigest`, `loadRemoteDigest`, `refreshRemoteRevisions`, история/превью/откат ревизий, `openProject`, `renameCurrentProject`, `toggleAutosave`, шторка проектов, меню проекта, rename, confirm-диалоги, duplicate/delete, clear, `currentRemoteDigest`/`projectById`/`projectTitleById`/`currentVersion`, `formatProjectDate`/`formatProjectTime`/`safeFileTitle`.
- [ ] **Step 2:** `node --check`.
- [ ] **Step 3: Commit** `refactor: extract projects module`

### Task 2.6: Вынести `features/admin.js` и `features/import-export.js`

**Files:**
- Create: `daijest_front/js/features/admin.js`, `daijest_front/js/features/import-export.js`

- [ ] **Step 1: `admin.js`** — все `*Admin*` функции (`app.js:1937-2166`).
- [ ] **Step 2: `import-export.js`** — `cloneJSON`, `cloneBlocksWithFreshIds`, company import/export, `exportJSON`/`exportProjectJSON`, `importJSON`, `saveProjectBackup`, `performProjectImport`. Колбэки файловых инпутов вынести как именованные экспортируемые функции **`onFileInputChange(e)`** и **`onCompanyFileInputChange(e)`** (тела — текущие анонимные слушатели с `app.js:2414` и `app.js:2450`); навешивание — в `main.js` (Task 2.10 Step 2).
- [ ] **Step 3:** `node --check`.
- [ ] **Step 4: Commit** `refactor: extract admin and import-export modules`

### Task 2.7: Вынести `features/media-export.js` (БЕЗ изменений логики)

**Files:**
- Create: `daijest_front/js/features/media-export.js`

- [ ] **Step 1:** Перенести `exportSvgDataUrlCache`, `exportAssetBaseUrl`, `isSvgImageSrc`, `svgImageToDataUrl`, `inlineSvgImagesForExport`, `pageToDataUrl`, `exportPNG`, `exportPDF`, `clearAll` **дословно**. `html2canvas`/`JSZip`/`jspdf` читать как `window.html2canvas`, `window.JSZip`, `window.jspdf`.

> **ВНИМАНИЕ:** это хрупкий код. Не рефакторить, только перенести. `exportAssetBaseUrl` использует `document.currentScript?.src` — в ES-модуле `document.currentScript` равен `null`, поэтому заменить на `import.meta.url`:
> ```js
> const exportAssetBaseUrl = new URL(".", import.meta.url).href;
> ```

- [ ] **Step 2:** `node --check`.
- [ ] **Step 3: Commit** `refactor: extract media-export module (logic unchanged)`

### Task 2.8: Вынести `dnd.js`

**Files:**
- Create: `daijest_front/js/dnd.js`

- [ ] **Step 1:** Перенести весь блок DRAG AND DROP и ITEM DRAG AND DROP (`app.js:1060-1211`): `onDragStart/End/Over/Drop`, `onItem*`, `onMetricsGroup*`, `removeAllMetrics`, `itemDragAttrs`, переменные `dragSrc*`.
- [ ] **Step 2:** `node --check`.
- [ ] **Step 3: Commit** `refactor: extract drag-and-drop module`

### Task 2.9: Вынести `view/*`, `render.js`, `status.js`

**Files:**
- Create: `daijest_front/js/view/editor.js`, `daijest_front/js/view/preview.js`, `daijest_front/js/view/account.js`, `daijest_front/js/view/status.js`, `daijest_front/js/render.js`

- [ ] **Step 1: `view/status.js`** — `saveStatusClass`, `saveStatusSummary`, `renderSaveStatusOnly`, `setSaveStatus`, `renderShellState`. (Enum-рефактор — Фаза 4, сейчас перенос.)
- [ ] **Step 2: `view/preview.js`** — `pageCover`, `pageLetter`, `pageCompanyDivider`, `metricGridHTML`, `newsItemHTML`, `pageBlock`, `renderPreview`, `getCompMeta`, `getBlockLabel`.
- [ ] **Step 3: `view/editor.js`** — `digestCoverEditorHTML`, `letterEditorHTML`, `itemEditorHTML`, `blockEditorHTML`, `companyEditorHTML`, `renderEditor`, `initTextareas`, `autoGrow`, ratio-модалка (`showRatioModal`/`confirmRatio`/`closeRatioModal`, `_ratioCtx`), `readFileAsDataURL`, `loadDigestCover`/`removeDigestCover`/`loadLetterCover`/`removeLetterCover`/`toggleLetterSection`.
- [ ] **Step 4: `view/account.js`** — `renderToolbar`, `copyUserId`, `renderProjectList`, `renderProjectMenu`, `renderRevisionHistory`, `renderConfirmDialog`, `renderNewProjectDialog`, `renderProjectsDrawer`, `renderAdmin*`, `digestTypeLabel`, `renderAccountBar`.
- [ ] **Step 5: `render.js`** — `render`, `afterStateChanged`, `debounce`, `debouncedRenderAndSave`, `scheduleRemoteAutosave` (если не в projects). Закрыть отложенные импорты `render` из state.js (Task 2.3 Step 1).
- [ ] **Step 6:** `node --check` на все файлы.
- [ ] **Step 7: Commit** `refactor: extract view and render modules`

### Task 2.10: Точка входа `main.js` + мост в `window` + переключение HTML

**Files:**
- Create: `daijest_front/js/main.js`
- Modify: `daijest_front/digest-builder.html:87`
- Delete (в конце фазы): `daijest_front/app.js`

- [ ] **Step 1: `main.js`** — импортировать `init` и все функции, на которые ссылаются inline-обработчики, и выставить их в `window`, чтобы существующие `onclick` работали:

```js
import { init } from "./app-init.js"; // или собрать init прямо здесь
import * as auth from "./features/auth.js";
import * as projects from "./features/projects.js";
import * as admin from "./features/admin.js";
import * as impexp from "./features/import-export.js";
import * as media from "./features/media-export.js";
import * as dnd from "./dnd.js";
import * as stateMod from "./state/state.js";
import * as history from "./state/history.js";
import * as editor from "./view/editor.js";
// ...все модули с функциями-обработчиками

// ВРЕМЕННЫЙ мост: inline onclick зовут глобальные функции.
// В Фазе 3 этот блок будет удалён вместе с переходом на делегирование.
Object.assign(window, {
  ...auth, ...projects, ...admin, ...impexp, ...media,
  ...dnd, ...stateMod, ...history, ...editor, /* ...остальные */
});

init();
```

> Перечислить нужно именно те имена, что встречаются в `onclick`/`oninput`/… Получить список: `grep -oE "[a-zA-Z]+\(" daijest_front/app.js | sort -u` (снять с исходника до удаления).

- [ ] **Step 2: Навесить обработчики файловых инпутов** в `main.js` (с `?.`):

```js
document.getElementById("fileInput")?.addEventListener("change", impexp.onFileInputChange);
document.getElementById("companyFileInput")?.addEventListener("change", impexp.onCompanyFileInputChange);
```

- [ ] **Step 3: Переключить HTML** — заменить `daijest_front/digest-builder.html:87`:

Было:
```html
<script src="app.js?v=44"></script>
```
Стало:
```html
<script type="module" src="js/main.js?v=45"></script>
```

- [ ] **Step 4: Удалить `app.js`** после того, как всё перенесено.

```bash
git rm daijest_front/app.js
```

- [ ] **Step 5: Полная проверка в браузере** — `docker compose up -d --build`, прогнать весь Regression Checklist.
Ожидается: приложение ведёт себя идентично состоянию до Фазы 2.

- [ ] **Step 6: Commit**

```bash
git add daijest_front/js/ daijest_front/digest-builder.html
git rm daijest_front/app.js
git commit -m "refactor: switch to ES modules with temporary window bridge"
```

### Task 2.11: Прогон регрессии Фазы 2

- [ ] Полный Regression Checklist. Любое расхождение с Фазой 1 — чинить до коммита перехода к Фазе 3.

---

## ФАЗА 3 — Делегирование событий (вариант B)

Цель: убрать inline-обработчики, перейти на `data-action` + `data-*` и общий слушатель. Мост в `window` из Task 2.10 удалить.

### Task 3.1: Движок делегирования

**Files:**
- Create: `daijest_front/js/actions.js`
- Create: `daijest_front/js/events.js`

- [ ] **Step 1: `actions.js`** — таблица соответствий. Каждый обработчик принимает `(ctx)`, где `ctx = { event, el, ds }` и `ds` — `el.dataset`.

```js
import * as projects from "./features/projects.js";
import * as stateMod from "./state/state.js";
// ...

// Имя действия -> функция. Аргументы достаём из data-* (ctx.ds).
export const actions = {
  "open-project":   ({ ds }) => projects.openProject(ds.id),
  "delete-project": ({ ds }) => projects.confirmDeleteProject(ds.id),
  "toggle-company": ({ ds }) => stateMod.toggleCompany(ds.comp),
  "add-item":       ({ ds }) => stateMod.addItem(ds.comp, ds.block, ds.kind),
  "remove-item":    ({ ds }) => stateMod.removeItem(ds.comp, ds.block, Number(ds.idx)),
  "update-item-field": ({ el, ds }) => stateMod.updateItemField(ds.comp, ds.block, Number(ds.idx), ds.field, el.value),
  // ...по одной строке на каждое действие
};
```

- [ ] **Step 2: `events.js`** — единые слушатели на корне приложения:

```js
import { actions } from "./actions.js";

function dispatch(event, el) {
  const name = el.dataset.action;
  const fn = actions[name];
  if (fn) fn({ event, el, ds: el.dataset });
}

export function attachDelegatedEvents(root = document) {
  // click
  root.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (el) dispatch(e, el);
  });
  // input (для полей с data-action на самом input)
  root.addEventListener("input", (e) => {
    const el = e.target.closest("[data-action]");
    if (el && el === e.target) {
      dispatch(e, el);
      updateCounter(el); // см. Step 3
    }
  });
  // change, submit, keydown — аналогично с фильтром по наличию data-action
  root.addEventListener("change", (e) => {
    const el = e.target.closest("[data-action]");
    if (el && el === e.target) dispatch(e, el);
  });
  root.addEventListener("submit", (e) => {
    const el = e.target.closest("[data-action]");
    if (el) { e.preventDefault(); dispatch(e, el); }
  });
  root.addEventListener("keydown", (e) => {
    const el = e.target.closest("[data-keyaction]");
    if (el) handleKey(e, el);
  });
}
```

- [ ] **Step 3: Централизованный счётчик символов** — функция `updateCounter(el)`:

```js
// Поле с data-counter="<id элемента счётчика>" и data-max="600"
function updateCounter(el) {
  const counterId = el.dataset.counter;
  if (!counterId) return;
  const counter = document.getElementById(counterId);
  if (counter) counter.textContent = `${el.value.length}/${el.dataset.max || ""}`;
}
```

- [ ] **Step 4: Обработка клавиш** — `handleKey(event, el)` читает `data-keyaction` с парами `enter:finishRename;escape:cancelRename`:

```js
function handleKey(event, el) {
  const map = Object.fromEntries(
    (el.dataset.keyaction || "").split(";").filter(Boolean).map(p => p.split(":"))
  );
  const name = map[event.key.toLowerCase()];
  if (name && actions[name]) { actions[name]({ event, el, ds: el.dataset }); }
}
```

- [ ] **Step 5: Commit** `feat: add event delegation engine (actions + events)`

### Task 3.2: Перевести drag&drop на делегирование

**Files:**
- Modify: `daijest_front/js/dnd.js`, `daijest_front/js/events.js`, `daijest_front/js/view/editor.js`

- [ ] **Step 1:** В `events.js` добавить делегированные `dragstart`/`dragend`/`dragover`/`drop` на корне, читающие `data-dnd` (тип: `block`/`item`/`metrics`) и `data-comp`/`data-block`/`data-idx` с цели; `dataTransfer` берётся из события.
- [ ] **Step 2:** В `view/editor.js` заменить `ondragstart=...` и т.п. на `data-dnd="..." data-comp=... data-block=... data-idx=...`. Drag-хэндл `onmousedown="...draggable=true"` → `data-action="drag-handle-down"` / `drag-handle-up`, обработчик переключает `draggable` у `closest('.block-card'|'.item-block')`.
- [ ] **Step 3:** Адаптировать функции `dnd.js` принимать `(event, el)` вместо позиционных строковых аргументов, читая данные из `el.dataset`.
- [ ] **Step 4: Проверка** — перетаскивание блоков, айтемов и группы метрик.
- [ ] **Step 5: Commit** `refactor: drag-and-drop via delegation`

### Task 3.3: Перевести `view/editor.js` обработчики

**Files:**
- Modify: `daijest_front/js/view/editor.js`

- [ ] **Step 1:** Заменить все `onclick`/`oninput`/`onchange` в строках редактора на `data-action` + `data-*`. Поля с счётчиком получают `data-counter` + `data-max` (см. Task 3.1 Step 3) вместо инлайнового `...textContent=...`.
  Пример — заголовок новости:
  Было:
  ```html
  <input ... oninput="updateItemField('${compKey}','${blockId}',${idx},'title',this.value);document.getElementById('cc_t_${blockId}_${idx}').textContent=this.value.length+'/600'">
  ```
  Стало:
  ```html
  <input ... data-action="update-item-field" data-comp="${compKey}" data-block="${blockId}" data-idx="${idx}" data-field="title" data-counter="cc_t_${blockId}_${idx}" data-max="600">
  ```
- [ ] **Step 2:** Добавить недостающие записи в `actions.js`.
- [ ] **Step 3: Проверка** — редактирование всех полей, счётчики, добавление/удаление блоков и айтемов, метрики, ratio-модалка, загрузка фото/обложек.
- [ ] **Step 4: Commit** `refactor: editor view via delegation`

### Task 3.4: Перевести `view/account.js` обработчики

**Files:**
- Modify: `daijest_front/js/view/account.js`

- [ ] **Step 1:** Перевести все `onclick`/`oninput`/`onsubmit`/`onkeydown` в шторке проектов, меню проекта, диалогах, админ-секции, модалке редактирования пользователя, тулбаре на `data-action`/`data-keyaction`/`data-*`. Бэкдроп-клики (`if(event.target===this)...`) → отдельное действие с проверкой `event.target === event.currentTarget` внутри обработчика (для backdrop вешать `data-action` на сам бэкдроп и сверять `ctx.event.target === ctx.el`).
- [ ] **Step 2:** Дополнить `actions.js`.
- [ ] **Step 3: Проверка** — весь поток проектов/ревизий/админки/диалогов.
- [ ] **Step 4: Commit** `refactor: account view via delegation`

### Task 3.5: Перевести `auth.js` и статический HTML

**Files:**
- Modify: `daijest_front/js/features/auth.js`, `daijest_front/digest-builder.html`

- [ ] **Step 1:** В `renderAuthScreen` перевести форму входа на `data-action`/`data-counter`.
- [ ] **Step 2:** В `digest-builder.html` перевести статические inline-обработчики (`logoutAccount()`, `exportPDF()`, `exportPNG()`, `confirmRatio('…')`, `closeRatioModal()`, бэкдроп ratio-модалки) на `data-action`/`data-ratio`.
- [ ] **Step 3:** Дополнить `actions.js` (`logout`, `export-pdf`, `export-png`, `confirm-ratio` (читает `data-ratio`), `close-ratio`).
- [ ] **Step 4: Проверка** — вход, выход, экспорт PDF/PNG, выбор соотношения.
- [ ] **Step 5: Commit** `refactor: auth + static HTML via delegation`

### Task 3.6: Убрать мост в `window`, подключить `events.js`

**Files:**
- Modify: `daijest_front/js/main.js`

- [ ] **Step 1:** Удалить временный блок `Object.assign(window, …)` из Task 2.10.
- [ ] **Step 2:** В `init` (или `main.js`) вызвать `attachDelegatedEvents(document)`.
- [ ] **Step 3:** Проверить, что не осталось inline-обработчиков:
  Run: `grep -rnE "on(click|input|change|submit|keydown|mousedown|drag[a-z]*|drop)=" daijest_front/js daijest_front/digest-builder.html`
  Expected: пусто.
- [ ] **Step 4: Проверка** — полный Regression Checklist.
- [ ] **Step 5: Commit** `refactor: remove window bridge, enable delegation`

### Task 3.7: Прогон регрессии Фазы 3

- [ ] Полный Regression Checklist, включая визуальную сверку экспорта PNG/PDF с результатом на `main`.

---

## ФАЗА 4 — Чистка качества

### Task 4.1: Полное экранирование

**Files:**
- Modify: `daijest_front/js/dom/escape.js`

- [ ] **Step 1:** Ввести `escapeHtml` с экранированием `& < > " '` и выразить через неё `escAttr`/`escText`:

```js
const MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(s) { return (s == null ? "" : String(s)).replace(/[&<>"']/g, c => MAP[c]); }
export const escAttr = escapeHtml;
export const escText = escapeHtml;
```

- [ ] **Step 2: Проверка** — ввести в заголовки/имена символы `< > " ' &`, убедиться, что отображается буквально и ничего не ломается. Проверить экспорт.
- [ ] **Step 3: Commit** `fix: full HTML escaping`

### Task 4.2: Статусы сохранения через коды вместо парсинга текста

**Files:**
- Modify: `daijest_front/js/view/status.js`, потребители `setSaveStatus`

- [ ] **Step 1:** Ввести enum состояний и хранить код отдельно от отображаемого текста:

```js
export const SAVE = { SAVED: "saved", SAVING: "saving", DIRTY: "dirty", ERROR: "error", PREVIEW: "preview" };
```

- [ ] **Step 2:** `setSaveStatus(code, text)` сохраняет и код, и текст; `saveStatusClass()` возвращает класс по коду, без `/ошибка/i.test(...)`.
- [ ] **Step 3:** Обновить все вызовы `setSaveStatus(...)` (раньше передавали только русскую строку) — передавать код + текст.
- [ ] **Step 4: Проверка** — статусы «Сохранено / Сохраняем / Есть изменения / Ошибка / Просмотр» подсвечиваются корректно.
- [ ] **Step 5: Commit** `refactor: save-status by code, not text matching`

### Task 4.3: Дедупликация

**Files:**
- Modify: `daijest_front/js/state/state.js` (или `view/preview.js`), `daijest_front/js/dom/icons.js`, `daijest_front/js/view/editor.js`

- [ ] **Step 1:** Вынести `getTiles(item)` (fallback метрик повторяется в `itemEditorHTML` и `pageBlock`):

```js
export function getTiles(item) {
  return item.tiles && item.tiles.length
    ? item.tiles
    : [{ value: item.value || "", label: item.label || "", delta: item.delta || "", direction: item.direction || "up" }];
}
```

- [ ] **Step 2:** Заменить инлайновый SVG drag-handle в `blockEditorHTML` на `ITEM_DRAG_HANDLE`/общую иконку из `dom/icons.js`.
- [ ] **Step 3: Проверка** — метрики и перетаскивание блоков.
- [ ] **Step 4: Commit** `refactor: dedupe metric tiles fallback and drag-handle icon`

### Task 4.4: Унификация подтверждений

**Files:**
- Modify: `daijest_front/js/state/state.js`

- [ ] **Step 1:** `removeBlock` использует нативный `confirm()`, `removeItem`/`removeMetricTile` — без подтверждения. Привести к кастомному `openConfirmDialog` (как в проектах) для удаления блока/айтема/тайла. Импортировать `openConfirmDialog` из projects/account.
- [ ] **Step 2: Проверка** — удаление блока, айтема и тайла показывает единый диалог.
- [ ] **Step 3: Commit** `refactor: unify delete confirmations`

### Task 4.5: Финальный прогон

- [ ] Полный Regression Checklist.
- [ ] Сообщить пользователю: всё на ветке `refactor/app-js`, готово к локальной приёмке и решению о вливании в `main`.

---

## Regression Checklist

Прогоняется в конце каждой фазы в браузере (`docker compose up -d --build`):

- [ ] **Вход:** по коду доступа; при неверном коде — понятная ошибка; список проектов грузится.
- [ ] **Проекты:** создать (с типом), переименовать (текущий и не-текущий), дублировать, удалить (текущий и не-текущий), очистить текущий, поиск по списку.
- [ ] **Контент:** добавить блок каждого типа; добавить новость и метрику; редактировать заголовок/текст/подпись/обложку письма; счётчики символов обновляются; комментарий блока.
- [ ] **Метрики:** добавить/удалить тайл, сменить значение/подпись/динамику/направление.
- [ ] **Медиа:** загрузить обложку дайджеста, обложку письма, фото в новость; выбрать соотношение сторон; удалить фото; переключить layout (снизу/сбоку).
- [ ] **Drag&drop:** перетащить блок; айтем внутри блока; группу метрик.
- [ ] **История:** undo/redo; автосохранение (вкл/выкл); ручное сохранение; история версий — просмотр, возврат к текущей, откат.
- [ ] **Импорт/экспорт:** экспорт JSON проекта; импорт JSON в проект (с бэкапом); экспорт/импорт JSON компании (проверка несовпадения компании).
- [ ] **Админ:** создать пользователя; назначить/снять админа; править имя; удалить пользователя; «показать ещё»; поиск.
- [ ] **Экспорт медиа:** PNG (zip постранично) и PDF — открыть, визуально сверить с результатом на `main`.
- [ ] **Консоль:** нет ошибок при загрузке и в типовых сценариях.
