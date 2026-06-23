// ============================================================
//   EDITOR VIEW — editor pane HTML + image handling
// ============================================================
import { g } from "../store.js";
import { escAttr, escText } from "../dom/escape.js";
import { collapseIcon, ITEM_DRAG_HANDLE, itemDragAttrs } from "../dom/icons.js";
import { getCompMeta, getBlockLabel, BLOCK_TYPES } from "../config.js";
import { state, getBlock } from "../state/state.js";
import { render } from "../render.js";

export function autoGrow(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
export function initTextareas() {
  document.getElementById('editor').querySelectorAll('textarea').forEach(ta => {
    autoGrow(ta);
    ta.addEventListener('input', () => autoGrow(ta), { once: false });
  });
}
// Trigger a hidden <input type=file> by id (used by "add media/cover" buttons).
export function clickInput(id) { document.getElementById(id)?.click(); }
// Toggle a company's "add block" menu (DOM-only).
export function toggleAddMenu(compKey) {
  const menu = document.querySelector(`[data-addmenu="${compKey}"]`);
  if (menu) menu.classList.toggle("open");
}
export function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
export async function loadItemPhotos(compKey, blockId, idx, files) {
  if (!files || !files.length) return;
  const b = getBlock(compKey, blockId);
  if (!b || !b.items[idx]) return;
  if (!b.items[idx].photos) b.items[idx].photos = [];
  const ratio = _ratioCtx.ratio || b.items[idx].photoRatio || '4/3';
  for (const f of files) b.items[idx].photos.push({ src: await readFileAsDataURL(f), ratio });
  render();
}
export function removeItemPhoto(compKey, blockId, itemIdx, photoIdx) {
  const b = getBlock(compKey, blockId);
  if (!b || !b.items[itemIdx]) return;
  b.items[itemIdx].photos.splice(photoIdx, 1);
  render();
}

let _ratioCtx = {};
export function showRatioModal(compKey, blockId, idx) {
  _ratioCtx = { compKey, blockId, idx };
  document.getElementById('ratioModal').style.display = 'flex';
}
export function confirmRatio(ratio) {
  const { compKey, blockId, idx } = _ratioCtx;
  _ratioCtx.ratio = ratio;
  const b = getBlock(compKey, blockId);
  if (b && b.items[idx]) { b.items[idx].photoRatio = ratio; }
  document.getElementById('ratioModal').style.display = 'none';
  document.getElementById(`mi_${blockId}_${idx}`).click();
}
export function closeRatioModal() {
  document.getElementById('ratioModal').style.display = 'none';
}

// ============================================================
export function digestCoverEditorHTML() {
  const imgHTML = state.digestCover
    ? `<div class="media-row">
         <div class="media-thumb">
           <img src="${state.digestCover}">
           <button class="media-del" data-act="removeDigestCover">✕</button>
         </div>
       </div>`
    : `<button class="media-add-btn" data-act="clickInput" data-args='["digestCoverInput"]'>
         Загрузить обложку +<br>
         <small style="font-weight:400;opacity:0.7">PNG · рекомендуемый размер: 2360 × 835 px</small>
       </button>`;
  return `
    <div class="letter-section">
      <div class="letter-head">
        <span class="letter-title">Обложка дайджеста</span>
      </div>
      <div class="letter-body">
        ${imgHTML}
        <input type="file" id="digestCoverInput" accept="image/*" style="display:none" data-act="loadDigestCover" data-args='["$files"]'>
      </div>
    </div>`;
}
export async function loadDigestCover(files) {
  if (!files || !files.length) return;
  state.digestCover = await readFileAsDataURL(files[0]);
  render();
}
export function removeDigestCover() {
  state.digestCover = "";
  render();
}

export function letterEditorHTML() {
  const l = state.letter;
  const coverHTML = l.cover
    ? `<div class="media-row">
         <div class="media-thumb">
           <img src="${l.cover}">
           <button class="media-del" data-act="removeLetterCover">✕</button>
         </div>
       </div>`
    : `<button class="media-add-btn" data-act="clickInput" data-args='["letterCoverInput"]'>Добавить обложку +</button>`;
  return `
    <div class="letter-section ${l.collapsed ? 'collapsed' : ''}">
      <div class="letter-head" data-act="toggleLetterSection">
        <span class="letter-title">Обращение редакции</span>
        <span>${collapseIcon(l.collapsed)}</span>
      </div>
      <div class="letter-body">
        <label>Заголовок</label>
        <input type="text" maxlength="200" value="${escAttr(l.title)}" data-act="updateLetterField" data-args='["title","$value"]' data-counter="cc_ltitle" data-max="200">
        <div class="char-counter" id="cc_ltitle">${(l.title||'').length}/200</div>
        <label>Текст (каждый абзац — с новой строки)</label>
        <textarea maxlength="600" data-act="updateLetterField" data-args='["paragraphs","$value"]' data-counter="cc_lpara" data-max="600" style="min-height:90px">${escText(l.paragraphs)}</textarea>
        <div class="char-counter" id="cc_lpara">${(l.paragraphs||'').length}/600</div>
        <label>Подпись</label>
        <input type="text" value="${escAttr(l.signature)}" data-act="updateLetterField" data-args='["signature","$value"]'>
        <label>Обложка</label>
        ${coverHTML}
        <input type="file" id="letterCoverInput" accept="image/*" style="display:none" data-act="loadLetterCover" data-args='["$files"]'>
      </div>
    </div>
  `;
}
export function toggleLetterSection() {
  state.letter.collapsed = !state.letter.collapsed;
  renderEditor();
}
export async function loadLetterCover(files) {
  if (!files || !files.length) return;
  state.letter.cover = await readFileAsDataURL(files[0]);
  render();
}
export function removeLetterCover() {
  state.letter.cover = "";
  render();
}

// ============================================================
//   EDITOR — ITEMS
// ============================================================
export function itemEditorHTML(compKey, blockId, item, idx) {
  if (item.kind === "news") {
    const photos = (item.photos || []).map((p, pi) => {
      const src = typeof p === 'string' ? p : p.src;
      return `<div class="media-thumb">
        <img src="${src}">
        <button class="media-del" data-act="removeItemPhoto" data-args='["${compKey}","${blockId}",${idx},${pi}]'>✕</button>
      </div>`;
    }).join("");
    return `
      <div class="item-block" ${itemDragAttrs(compKey, blockId, idx)}>
        <div class="item-del-row">
          ${ITEM_DRAG_HANDLE}
          <button class="item-del-btn" data-act="removeItem" data-args='["${compKey}","${blockId}",${idx}]'>✕</button>
        </div>
        <input type="text" placeholder="Заголовок новости" maxlength="600" value="${escAttr(item.title || '')}" data-act="updateItemField" data-args='["${compKey}","${blockId}",${idx},"title","$value"]' data-counter="cc_t_${blockId}_${idx}" data-max="600">
        <div class="char-counter" id="cc_t_${blockId}_${idx}">${(item.title||'').length}/600</div>
        <textarea placeholder="Текст новости" maxlength="600" data-act="updateItemField" data-args='["${compKey}","${blockId}",${idx},"text","$value"]' data-counter="cc_p_${blockId}_${idx}" data-max="600">${escText(item.text || '')}</textarea>
        <div class="char-counter" id="cc_p_${blockId}_${idx}">${(item.text||'').length}/600</div>
        ${photos ? `<div class="media-row">${photos}</div>` : ""}
        <button class="media-add-btn" data-act="showRatioModal" data-args='["${compKey}","${blockId}",${idx}]'>Добавить медиа +</button>
        <input type="file" id="mi_${blockId}_${idx}" accept="image/*" multiple style="display:none" data-act="loadItemPhotos" data-args='["${compKey}","${blockId}",${idx},"$files"]'>
        <div class="layout-toggle">
          <button class="layout-btn ${(item.photoLayout||'bottom')==='bottom'?'active':''}" data-act="updateItemField" data-args='["${compKey}","${blockId}",${idx},"photoLayout","bottom"]'><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg> Снизу</button>
          <button class="layout-btn ${item.photoLayout==='side'?'active':''}" data-act="updateItemField" data-args='["${compKey}","${blockId}",${idx},"photoLayout","side"]'><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg> Сбоку</button>
        </div>
      </div>`;
  }
  const tiles = item.tiles && item.tiles.length ? item.tiles
    : [{ value: item.value||'', label: item.label||'', delta: item.delta||'', direction: item.direction||'up' }];
  const tilesHTML = tiles.map((tile, ti) => `
    <div class="metric-tile-row">
      <div class="row2">
        <input type="text" placeholder="Значение (напр. 150,8М)" value="${escAttr(tile.value||'')}" data-act="updateMetricTile" data-args='["${compKey}","${blockId}",${idx},${ti},"value","$value"]'>
        <input type="text" placeholder="Подпись" value="${escAttr(tile.label||'')}" data-act="updateMetricTile" data-args='["${compKey}","${blockId}",${idx},${ti},"label","$value"]'>
      </div>
      <div class="row2" style="margin-top:4px;">
        <input type="text" placeholder="Динамика (опц.)" value="${escAttr(tile.delta||'')}" data-act="updateMetricTile" data-args='["${compKey}","${blockId}",${idx},${ti},"delta","$value"]'>
        <div style="display:flex;gap:6px;align-items:center;min-width:0;overflow:hidden;">
          <select style="flex:1;min-width:0;width:0" data-act="updateMetricTile" data-args='["${compKey}","${blockId}",${idx},${ti},"direction","$value"]'>
            <option value="up"   ${tile.direction==='up'   ?'selected':''}>🟢 рост</option>
            <option value="down" ${tile.direction==='down' ?'selected':''}>🔴 падение</option>
            <option value="none" ${tile.direction==='none' ?'selected':''}>⚪ нейтрально</option>
          </select>
          ${tiles.length > 1 ? `<button class="item-del-btn" data-act="removeMetricTile" data-args='["${compKey}","${blockId}",${idx},${ti}]'>✕</button>` : ''}
        </div>
      </div>
    </div>`).join('<div class="metric-tile-sep"></div>');
  return `
    <div class="item-block item-block-metric" ${itemDragAttrs(compKey, blockId, idx)}>
      <div class="item-del-row">
        ${ITEM_DRAG_HANDLE}
        <span class="metric-label-tag">Метрика</span>
        <button class="item-del-btn" data-act="removeItem" data-args='["${compKey}","${blockId}",${idx}]'>✕</button>
      </div>
      ${tilesHTML}
      <button class="add-tile-btn" data-act="addMetricTile" data-args='["${compKey}","${blockId}",${idx}]'>+ Добавить ещё</button>
    </div>`;
}
export function blockEditorHTML(compKey, block) {
  const meta  = getCompMeta(compKey);
  const label = getBlockLabel(block.type);
  const items = block.items.map((it, i) => itemEditorHTML(compKey, block.id, it, i)).join("");
  return `
    <div class="block-card ${block.collapsed ? 'collapsed' : ''}" data-id="${block.id}"
         draggable="false"
         ondragstart="onDragStart(event,'${compKey}','${block.id}')"
         ondragend="onDragEnd(event)"
         ondragover="onDragOver(event,'${compKey}','${block.id}')"
         ondrop="onDrop(event,'${compKey}','${block.id}')">
      <div class="block-head">
        <span class="drag-handle" onmousedown="this.closest('.block-card').draggable=true" onmouseup="this.closest('.block-card').draggable=false"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="9" cy="5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="9" cy="19" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="15" cy="19" r="2"/></svg></span>
        <span class="block-badge" style="background:${meta.color}">${label}</span>
        <span class="block-actions">
          <button class="icon-btn" data-act="moveBlock" data-args='["${compKey}","${block.id}",-1]' title="Вверх"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg></button>
          <button class="icon-btn" data-act="moveBlock" data-args='["${compKey}","${block.id}",1]'  title="Вниз"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg></button>
          <button class="icon-btn" data-act="removeBlock" data-args='["${compKey}","${block.id}"]' title="Удалить"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
          <button class="icon-btn" data-act="toggleBlock" data-args='["${compKey}","${block.id}"]'>${collapseIcon(block.collapsed)}</button>
        </span>
      </div>
      <div class="block-body">
        ${items}
        <div class="item-add-row">
          <button class="add-item-btn" data-act="addItem" data-args='["${compKey}","${block.id}","news"]'>Новость +</button>
          <button class="add-item-btn" data-act="addItem" data-args='["${compKey}","${block.id}","metric"]'>Метрика +</button>
        </div>
        <input type="text" class="comment-input" placeholder="Комментарий" value="${escAttr(block.comment || '')}" data-act="updateBlockField" data-args='["${compKey}","${block.id}","comment","$value"]'>
      </div>
    </div>`;
}

// ============================================================
//   EDITOR — COMPANIES
// ============================================================
export function companyEditorHTML(compState) {
  const meta     = getCompMeta(compState.key);
  const blocks   = compState.blocks.map(b => blockEditorHTML(compState.key, b)).join("");
  const addItems = BLOCK_TYPES.map(t =>
    `<div class="add-menu-item" data-act="addBlock" data-args='["${compState.key}","${t.key}"]'>${t.label}</div>`
  ).join("");
  return `
    <div class="company-section ${compState.collapsed ? 'collapsed' : ''}">
      <div class="company-head" data-act="toggleCompany" data-args='["${compState.key}"]'>
        <span class="company-dot" style="background:${meta.color}"></span>
        <span class="company-name">${escText(meta.name)}</span>
        <span class="company-actions">
          <button type="button" class="company-json-btn" data-act="importCompanyJSON" data-args='["${compState.key}"]' title="Импорт JSON в ${escAttr(meta.name)}">Импорт</button>
          <button type="button" class="company-json-btn" data-act="exportCompanyJSON" data-args='["${compState.key}"]' title="Экспорт JSON из ${escAttr(meta.name)}">Экспорт</button>
        </span>
        <span class="company-chevron">${collapseIcon(compState.collapsed)}</span>
      </div>
      <div class="company-body">
        ${blocks}
        <div class="add-block-wrap">
          <div class="add-block-trigger" data-act="toggleAddMenu" data-args='["${compState.key}"]'>Новый блок <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></div>
          <div class="add-block-menu" data-addmenu="${compState.key}">${addItems}</div>
        </div>
      </div>
    </div>`;
}

export function renderEditor() {
  const el = document.getElementById("editor");
  if (!el) return;
  el.innerHTML = digestCoverEditorHTML() + letterEditorHTML() + state.companies.map(c => companyEditorHTML(c)).join("");
  initTextareas();
  el.querySelectorAll("input, textarea, select, button").forEach(control => {
    control.disabled = !!g.revisionPreview;
  });
}
