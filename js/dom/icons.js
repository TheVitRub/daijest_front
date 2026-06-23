// ============================================================
//   Inline SVG icons / drag helpers
// ============================================================
export function collapseIcon(collapsed) { return collapsed ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>'; }

const DRAG_DOTS_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="9" cy="5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="9" cy="19" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="15" cy="19" r="2"/></svg>`;

// Drag handle that toggles `draggable` on the nearest `target` ancestor.
export function dragHandle(target) {
  return `<span class="drag-handle" data-draghandle="${target}">${DRAG_DOTS_SVG}</span>`;
}
export const ITEM_DRAG_HANDLE = dragHandle(".item-block");

export function itemDragAttrs(compKey, blockId, idx) {
  return `draggable="false" data-dragstart="onItemDragStart" data-dragend="onItemDragEnd" data-dragover="onItemDragOver" data-drop="onItemDrop" data-dargs='["${compKey}","${blockId}",${idx}]'`;
}
