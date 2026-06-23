// ============================================================
//   DRAG & DROP — blocks, items, metric groups
// ============================================================
import { getComp, getBlock } from "./state/state.js";
import { render } from "./render.js";

let dragSrcCompKey = null;
let dragSrcBlockId = null;

export function clearDragOver() {
  document.querySelectorAll('.block-card').forEach(el => el.classList.remove('drag-over'));
}

export function onDragStart(e, compKey, blockId) {
  const tag = e.target.tagName.toLowerCase();
  if (['input', 'textarea', 'select', 'button'].includes(tag)) { e.preventDefault(); return; }
  dragSrcCompKey = compKey;
  dragSrcBlockId = blockId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', blockId);
  setTimeout(() => { if (e.delegateTarget) e.delegateTarget.style.opacity = '0.4'; }, 0);
}
export function onDragEnd(e) {
  e.delegateTarget.style.opacity = '';
  e.delegateTarget.draggable = false;
  clearDragOver();
}
export function onDragOver(e, compKey, blockId) {
  e.preventDefault();
  if (dragSrcBlockId === blockId) return;
  clearDragOver();
  e.delegateTarget.classList.add('drag-over');
}
export function onDrop(e, compKey, blockId) {
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

export function clearItemDragOver() {
  document.querySelectorAll('.item-block, .metrics-group-card').forEach(el => el.classList.remove('insert-before', 'insert-after'));
}
export function onItemDragStart(e, compKey, blockId, idx) {
  dragSrcItemCompKey = compKey;
  dragSrcItemBlockId = blockId;
  dragSrcItemIdx     = idx;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => { if (e.delegateTarget) e.delegateTarget.style.opacity = '0.4'; }, 0);
}
export function onItemDragEnd(e) {
  e.delegateTarget.style.opacity = '';
  e.delegateTarget.draggable = false;
  clearItemDragOver();
}
export function onItemDragOver(e, compKey, blockId, idx) {
  e.preventDefault(); e.stopPropagation();
  clearItemDragOver();
  const rect = e.delegateTarget.getBoundingClientRect();
  dragInsertBefore = e.clientY < rect.top + rect.height / 2;
  e.delegateTarget.classList.add(dragInsertBefore ? 'insert-before' : 'insert-after');
}
export function onItemDrop(e, compKey, blockId, idx) {
  e.stopPropagation();
  clearItemDragOver();
  if (dragSrcItemCompKey !== compKey || dragSrcItemBlockId !== blockId) return;
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
