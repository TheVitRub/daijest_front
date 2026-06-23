// ============================================================
//   Inline SVG icons / drag helpers
// ============================================================
export function collapseIcon(collapsed) { return collapsed ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>'; }

export const ITEM_DRAG_HANDLE = `<span class="drag-handle" onmousedown="this.closest('.item-block').draggable=true" onmouseup="this.closest('.item-block').draggable=false"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="9" cy="5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="9" cy="19" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="15" cy="19" r="2"/></svg></span>`;

export function itemDragAttrs(compKey, blockId, idx) {
  return `draggable="false" ondragstart="onItemDragStart(event,'${compKey}','${blockId}',${idx})" ondragend="onItemDragEnd(event)" ondragover="onItemDragOver(event,'${compKey}','${blockId}',${idx})" ondrop="onItemDrop(event,'${compKey}','${blockId}',${idx})"`;
}
