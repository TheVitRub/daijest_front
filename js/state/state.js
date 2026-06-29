// ============================================================
//   STATE — the digest document + content mutations
// ============================================================
import { COMPANIES } from "../config.js";
import { g } from "../store.js";
import { render, debouncedRenderAndSave } from "../render.js";

export const state = {
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
export const INITIAL_STATE_SNAPSHOT = JSON.stringify(state);

export function loadState(data) {
  if (!data || typeof data !== 'object') return;
  if (typeof data.digestCover === 'string' || (data.digestCover && typeof data.digestCover === 'object')) state.digestCover = data.digestCover;
  if (Array.isArray(data.companies)) state.companies = data.companies;
  if (data.letter && typeof data.letter === 'object') state.letter = data.letter;
}
export function resetStateToInitial() {
  loadState(JSON.parse(INITIAL_STATE_SNAPSHOT));
}
export function captureState() {
  return JSON.stringify(state);
}

export function getComp(key)  { return state.companies.find(c => c.key === key) || null; }
export function getBlock(compKey, blockId) {
  const comp = getComp(compKey);
  return comp ? comp.blocks.find(b => b.id === blockId) : null;
}
// Tiles of a metric item, with the legacy single-value fallback.
export function getTiles(item) {
  return item.tiles && item.tiles.length
    ? item.tiles
    : [{ value: item.value || "", label: item.label || "", delta: item.delta || "", direction: item.direction || "up" }];
}

export function digestTitle() {
  return (state.letter && state.letter.title ? state.letter.title : "Новый проект").trim() || "Новый проект";
}
export function projectTitle() {
  return (g.currentProjectTitle || digestTitle()).trim() || "Новый проект";
}

let blockIdSeq = 0;
export function createBlockId() {
  blockIdSeq += 1;
  return "b" + Date.now() + Math.floor(Math.random() * 1000) + blockIdSeq;
}

// ----- company actions -----
export function toggleCompany(compKey) {
  const c = getComp(compKey);
  if (c) { c.collapsed = !c.collapsed; render(); }
}

// ----- block actions -----
export function addBlock(compKey, blockType) {
  const comp = getComp(compKey);
  if (!comp) return;
  const id = createBlockId();
  comp.blocks.push({ id, type: blockType, collapsed: false, items: [{ kind: "news", title: "", text: "", photos: [], photoLayout: "bottom", photoRatio: "4/3" }], comment: "" });
  const menu = document.querySelector(`[data-addmenu="${compKey}"]`);
  if (menu) menu.classList.remove("open");
  render();
}
export function removeBlock(compKey, blockId) {
  const comp = getComp(compKey);
  if (!comp) return;
  comp.blocks = comp.blocks.filter(b => b.id !== blockId);
  render();
}
export function toggleBlock(compKey, blockId) {
  const b = getBlock(compKey, blockId);
  if (b) { b.collapsed = !b.collapsed; render(); }
}
export function moveBlock(compKey, blockId, dir) {
  const comp = getComp(compKey);
  if (!comp) return;
  const i = comp.blocks.findIndex(b => b.id === blockId);
  const j = i + dir;
  if (j < 0 || j >= comp.blocks.length) return;
  [comp.blocks[i], comp.blocks[j]] = [comp.blocks[j], comp.blocks[i]];
  render();
}

// ----- item actions -----
export function addItem(compKey, blockId, kind) {
  const b = getBlock(compKey, blockId);
  if (!b) return;
  if (kind === "news") b.items.push({ kind: "news", title: "", text: "", photos: [], photoLayout: "bottom", photoRatio: "4/3" });
  else                 b.items.push({ kind: "metric", tiles: [{ value: "", label: "", delta: "", direction: "up" }] });
  render();
}
export function removeItem(compKey, blockId, idx) {
  const b = getBlock(compKey, blockId);
  if (!b) return;
  b.items.splice(idx, 1);
  render();
}
export function updateBlockField(compKey, blockId, field, value) {
  const b = getBlock(compKey, blockId);
  if (!b) return;
  b[field] = value;
  debouncedRenderAndSave();
}
export function updateItemField(compKey, blockId, idx, field, value) {
  const b = getBlock(compKey, blockId);
  if (!b || !b.items[idx]) return;
  b.items[idx][field] = value;
  debouncedRenderAndSave();
}
export function updateLetterField(field, value) {
  state.letter[field] = value;
  debouncedRenderAndSave();
}

// ----- metric tiles -----
export function updateMetricTile(compKey, blockId, itemIdx, tileIdx, field, value) {
  const b = getBlock(compKey, blockId);
  if (!b || !b.items[itemIdx]) return;
  if (!b.items[itemIdx].tiles) b.items[itemIdx].tiles = [{ value:'', label:'', delta:'', direction:'up' }];
  b.items[itemIdx].tiles[tileIdx][field] = value;
  debouncedRenderAndSave();
}
export function addMetricTile(compKey, blockId, itemIdx) {
  const b = getBlock(compKey, blockId);
  if (!b || !b.items[itemIdx]) return;
  if (!b.items[itemIdx].tiles) b.items[itemIdx].tiles = [];
  b.items[itemIdx].tiles.push({ value: '', label: '', delta: '', direction: 'up' });
  b.items[itemIdx].activeTileIdx = b.items[itemIdx].tiles.length - 1;
  render();
}
export function removeMetricTile(compKey, blockId, itemIdx, tileIdx) {
  const b = getBlock(compKey, blockId);
  if (!b || !b.items[itemIdx] || !b.items[itemIdx].tiles) return;
  b.items[itemIdx].tiles.splice(tileIdx, 1);
  const len = b.items[itemIdx].tiles.length;
  if (len > 0) b.items[itemIdx].activeTileIdx = Math.min(b.items[itemIdx].activeTileIdx || 0, len - 1);
  render();
}
