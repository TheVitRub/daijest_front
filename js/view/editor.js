// ============================================================
//   EDITOR VIEW — editor pane HTML + image handling
// ============================================================
import { g } from "../store.js";
import { escAttr, escText } from "../dom/escape.js";
import { collapseIcon, ITEM_DRAG_HANDLE, itemDragAttrs, dragHandle } from "../dom/icons.js";
import { getCompMeta, getBlockLabel, BLOCK_TYPES, imageSrc, photoSrc } from "../config.js";
import { state, getBlock, getTiles } from "../state/state.js";
import { render } from "../render.js";
import { saveRemoteNow } from "../features/projects.js";
import { findPageIndexForBlock, findPageIndexForKind, renderPreview } from "./preview.js";
import { uploadMedia } from "../api.js";

export function autoGrow(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
const COLLAPSED_H = 56;
function updateCollapsibleFade(el) {
  el.closest('.collapsible-wrap')?.classList.toggle('has-text', el.scrollHeight > COLLAPSED_H);
}
export function initTextareas() {
  document.getElementById('editor').querySelectorAll('textarea').forEach(ta => {
    if ('collapsible' in ta.dataset && ta !== document.activeElement) {
      updateCollapsibleFade(ta);
      return;
    }
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
// Downscale + re-encode an uploaded photo to a JPEG Blob before upload, so the
// server stores a reasonably sized image (not a multi-MB original). 3600px on
// the long side matches a full-width photo at the 3x export scale (page is
// 1180px), so wide/cover photos stay crisp instead of being upscaled. Photos
// now live as files (not in the JSON), so the larger size only costs disk.
// Always yields JPEG so the backend's image whitelist accepts it.
export function downscaleToBlob(file, maxDim = 3600, quality = 0.92) {
  return new Promise(async (resolve) => {
    try {
      const dataUrl = await readFileAsDataURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", quality);
        } catch (_) {
          resolve(file);
        }
      };
      img.onerror = () => resolve(file);
      img.src = dataUrl;
    } catch (_) {
      resolve(file);
    }
  });
}
export async function loadItemPhotos(compKey, blockId, idx, files) {
  if (!files || !files.length) return;
  const b = getBlock(compKey, blockId);
  if (!b || !b.items[idx]) return;
  if (!b.items[idx].photos) b.items[idx].photos = [];
  const ratio = _ratioCtx.ratio || b.items[idx].photoRatio || '4/3';
  const photos = b.items[idx].photos;
  let uploadedAny = false;
  for (const f of Array.from(files)) {
    // Optimistic placeholder so the slot fills with a spinner while uploading.
    const ph = { uploading: true, ratio };
    photos.push(ph);
    render();
    try {
      const blob = await downscaleToBlob(f);
      ph.mediaId = await uploadMedia(blob, f.name || 'photo.jpg');
      delete ph.uploading;
      uploadedAny = true;
    } catch (err) {
      console.error('photo upload failed:', err);
      // Keep state clean: drop the failed placeholder so no broken ref persists.
      const i = photos.indexOf(ph);
      if (i >= 0) photos.splice(i, 1);
      alert('Не удалось загрузить фото. Попробуйте ещё раз.');
    }
    render();
  }
  // State now holds only mediaId refs (tiny) — save immediately so a quick
  // refresh doesn't lose the just-added photos.
  if (uploadedAny) saveRemoteNow();
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
  const coverSrc = imageSrc(state.digestCover);
  const imgHTML = coverSrc
    ? `<div class="media-row">
         <div class="media-thumb">
           <img src="${escAttr(coverSrc)}">
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
  try {
    const file = files[0];
    const blob = await downscaleToBlob(file);
    state.digestCover = { mediaId: await uploadMedia(blob, file.name || 'cover.jpg') };
    render();
    saveRemoteNow();
  } catch (err) {
    console.error('cover upload failed:', err);
    alert('РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РѕР±Р»РѕР¶РєСѓ. РџРѕРїСЂРѕР±СѓР№С‚Рµ РµС‰С‘ СЂР°Р·.');
  }
}
export function removeDigestCover() {
  state.digestCover = "";
  render();
}

export function letterEditorHTML() {
  const l = state.letter;
  const coverSrc = imageSrc(l.cover);
  const coverHTML = coverSrc
    ? `<div class="media-row">
         <div class="media-thumb">
           <img src="${escAttr(coverSrc)}">
           <button class="media-del" data-act="removeLetterCover">✕</button>
         </div>
       </div>`
    : `<button class="media-add-btn" data-act="clickInput" data-args='["letterCoverInput"]'>Добавить обложку +</button>`;
  return `
    <div class="letter-section ${l.collapsed ? 'collapsed' : ''}">
      <div class="letter-head" data-act="toggleLetterSection">
        <span class="letter-title">Обращение редакции</span>
        <span class="letter-head-actions">
          <button class="item-del-btn" data-act="scrollToPreviewLetter" title="Перейти в превью"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>
          ${collapseIcon(l.collapsed)}
        </span>
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
  try {
    const file = files[0];
    const blob = await downscaleToBlob(file);
    state.letter.cover = { mediaId: await uploadMedia(blob, file.name || 'cover.jpg') };
    render();
    saveRemoteNow();
  } catch (err) {
    console.error('letter cover upload failed:', err);
    alert('РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РѕР±Р»РѕР¶РєСѓ. РџРѕРїСЂРѕР±СѓР№С‚Рµ РµС‰С‘ СЂР°Р·.');
  }
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
      if (p && p.uploading) {
        return `<div class="media-thumb media-thumb-loading"><div class="media-spinner"></div></div>`;
      }
      const src = photoSrc(p);
      return `<div class="media-thumb">
        <img src="${escAttr(src)}" loading="lazy" alt="">
        <button class="media-del" data-act="removeItemPhoto" data-args='["${compKey}","${blockId}",${idx},${pi}]'>✕</button>
      </div>`;
    }).join("");
    return `
      <div class="item-block" ${itemDragAttrs(compKey, blockId, idx)}>
        <div class="item-del-row">
          ${ITEM_DRAG_HANDLE}
          <span class="metric-label-tag">Новость</span>
          <button class="item-del-btn" data-act="scrollToPreviewItem" data-args='["${blockId}",${idx}]' title="Перейти в превью"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>
          <button class="item-del-btn" data-act="removeItem" data-args='["${compKey}","${blockId}",${idx}]'>✕</button>
        </div>
        <input type="text" placeholder="Заголовок новости" maxlength="600" value="${escAttr(item.title || '')}" data-act="updateItemField" data-args='["${compKey}","${blockId}",${idx},"title","$value"]' data-counter="cc_t_${blockId}_${idx}" data-max="600">
        <div class="char-counter" id="cc_t_${blockId}_${idx}">${(item.title||'').length}/600</div>
        <div class="collapsible-wrap"><textarea placeholder="Текст новости" maxlength="600" data-act="updateItemField" data-args='["${compKey}","${blockId}",${idx},"text","$value"]' data-counter="cc_p_${blockId}_${idx}" data-max="600" data-collapsible>${escText(item.text || '')}</textarea></div>
        <div class="char-counter" id="cc_p_${blockId}_${idx}">${(item.text||'').length}/600</div>
        ${photos ? `<div class="media-row">${photos}</div>` : ""}
        <div class="media-layout-row">
          <button class="media-add-btn" data-act="showRatioModal" data-args='["${compKey}","${blockId}",${idx}]'>Медиа +</button>
          <div class="layout-toggle">
            <button class="layout-btn" title="Сверху" data-act="updateItemField" data-args='["${compKey}","${blockId}",${idx},"photoLayout","top"]'><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg></button>
            <button class="layout-btn" title="Снизу" data-act="updateItemField" data-args='["${compKey}","${blockId}",${idx},"photoLayout","bottom"]'><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg></button>
            <button class="layout-btn" title="Сбоку" data-act="updateItemField" data-args='["${compKey}","${blockId}",${idx},"photoLayout","side"]'><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>
          </div>
        </div>
        <input type="file" id="mi_${blockId}_${idx}" accept="image/*" multiple style="display:none" data-act="loadItemPhotos" data-args='["${compKey}","${blockId}",${idx},"$files"]'>
        ${(item.tiles && item.tiles.length)
          ? `<div class="news-metric-wrap">
              <div class="item-del-row news-metric-head">
                <span class="metric-label-tag">Метрика</span>
                <button class="item-del-btn metric-collapse-btn" data-act="toggleNewsMetricCollapse" data-args='["${compKey}","${blockId}",${idx}]' title="${item.metricCollapsed ? 'Развернуть' : 'Свернуть'}">${collapseIcon(item.metricCollapsed)}</button>
                <button class="item-del-btn" data-act="clearNewsMetric" data-args='["${compKey}","${blockId}",${idx}]' title="Удалить метрику">✕</button>
              </div>
              ${item.metricCollapsed ? '' : `<div class="news-metric-body">${tileTabsHTML(compKey, blockId, idx, item)}</div>`}
            </div>`
          : `<button class="add-item-btn" data-act="addMetricTile" data-args='["${compKey}","${blockId}",${idx}]'>Метрика +</button>`
        }
      </div>`;
  }
  if (item.kind === "tops") {
    const columns = (item.columns && item.columns.length) ? item.columns : [{ title: "", rows: [] }];
    const active = Math.min(item.activeColIdx || 0, columns.length - 1);
    const col = columns[active] || { title: "", rows: [] };
    const canAdd = columns.length < 3;
    const canRemove = columns.length > 1;
    const rowsHTML = (col.rows || []).map((row, ri) => {
      const rkVal = (row.rank ?? '').toString().trim() || String(ri + 1);
      return `
      <div class="tops-edit-row">
        <input type="text" class="tops-edit-rank" inputmode="numeric" maxlength="3" value="${escAttr(rkVal)}" data-act="updateTopRow" data-args='["${compKey}","${blockId}",${idx},${active},${ri},"rank","$value"]' aria-label="Номер">
        <input type="text" class="tops-edit-nameinput" placeholder="Название" value="${escAttr(row.name || '')}" data-act="updateTopRow" data-args='["${compKey}","${blockId}",${idx},${active},${ri},"name","$value"]'>
        <input type="text" class="tops-edit-value" placeholder="Значение" value="${escAttr(row.value || '')}" data-act="updateTopRow" data-args='["${compKey}","${blockId}",${idx},${active},${ri},"value","$value"]'>
        <button class="tops-edit-del" data-act="removeTopRow" data-args='["${compKey}","${blockId}",${idx},${active},${ri}]' title="Удалить строку">✕</button>
      </div>`;
    }).join('');
    return `
      <div class="item-block item-block-tops" ${itemDragAttrs(compKey, blockId, idx)}>
        <div class="item-del-row">
          ${ITEM_DRAG_HANDLE}
          <span class="metric-label-tag">Топ</span>
          <button class="item-del-btn" data-act="scrollToPreviewItem" data-args='["${blockId}",${idx}]' title="Перейти в превью"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>
          <button class="item-del-btn" data-act="removeItem" data-args='["${compKey}","${blockId}",${idx}]'>✕</button>
        </div>
        <div class="tile-tabs">
          ${columns.map((_, ci) => `<button class="tile-tab-btn${ci === active ? ' active' : ''}" data-act="setActiveTopCol" data-args='["${compKey}","${blockId}",${idx},${ci}]' title="Колонка ${ci + 1}">${ci + 1}</button>`).join('')}
          ${canAdd ? `<button class="tile-tab-btn tile-tab-add" data-act="addTopColumn" data-args='["${compKey}","${blockId}",${idx}]' title="Добавить колонку">+</button>` : ''}
        </div>
        <input type="text" placeholder="Заголовок колонки" maxlength="120" value="${escAttr(col.title || '')}" data-act="updateTopColTitle" data-args='["${compKey}","${blockId}",${idx},${active},"$value"]'>
        <div class="tops-edit-rows">${rowsHTML}</div>
        <div class="tops-edit-actions">
          <button class="add-item-btn" data-act="addTopRow" data-args='["${compKey}","${blockId}",${idx},${active}]'>Строка +</button>
          ${canRemove ? `<button class="add-item-btn tops-del-col" data-act="removeTopColumn" data-args='["${compKey}","${blockId}",${idx},${active}]' title="Удалить эту колонку">Удалить колонку</button>` : ''}
        </div>
      </div>`;
  }
  return `
    <div class="item-block item-block-metric ${item.collapsed ? 'metric-collapsed' : ''}" ${itemDragAttrs(compKey, blockId, idx)}>
      <div class="item-del-row">
        ${ITEM_DRAG_HANDLE}
        <span class="metric-label-tag">Метрика</span>
        <button class="item-del-btn" data-act="scrollToPreviewItem" data-args='["${blockId}",${idx}]' title="Перейти в превью"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>
        <button class="item-del-btn metric-collapse-btn" data-act="toggleMetricCollapse" data-args='["${compKey}","${blockId}",${idx}]' title="${item.collapsed ? 'Развернуть' : 'Свернуть'}">${collapseIcon(item.collapsed)}</button>
        <button class="item-del-btn" data-act="removeItem" data-args='["${compKey}","${blockId}",${idx}]'>✕</button>
      </div>
      ${item.collapsed ? '' : tileTabsHTML(compKey, blockId, idx, item)}
    </div>`;
}
export function setActiveTile(compKey, blockId, itemIdx, tileIdx) {
  const b = getBlock(compKey, blockId);
  if (!b || !b.items[itemIdx]) return;
  b.items[itemIdx].activeTileIdx = tileIdx;
  const editorEl = document.getElementById("editor");
  const savedScroll = editorEl ? editorEl.scrollTop : 0;
  renderEditor();
  if (editorEl) editorEl.scrollTop = savedScroll;
}
export function setActiveTopCol(compKey, blockId, itemIdx, colIdx) {
  const b = getBlock(compKey, blockId);
  if (!b || !b.items[itemIdx]) return;
  b.items[itemIdx].activeColIdx = colIdx;
  const editorEl = document.getElementById("editor");
  const savedScroll = editorEl ? editorEl.scrollTop : 0;
  renderEditor();
  if (editorEl) editorEl.scrollTop = savedScroll;
}

function tileTabsHTML(compKey, blockId, idx, item) {
  const tiles = item.tiles || [];
  const active = Math.min(item.activeTileIdx || 0, tiles.length - 1);
  const tile = tiles[active];
  return `
    <div class="tile-tabs">
      ${tiles.map((_, ti) => `<button class="tile-tab-btn${ti === active ? ' active' : ''}" data-act="setActiveTile" data-args='["${compKey}","${blockId}",${idx},${ti}]'>${ti + 1}</button>`).join('')}
      <button class="tile-tab-btn tile-tab-add" data-act="addMetricTile" data-args='["${compKey}","${blockId}",${idx}]'>+</button>
    </div>
    ${tile ? `<div class="metric-tile-row">
      <div class="metric-tile-fields">
        <div class="row2">
          <input type="text" class="metric-value-input" placeholder="Значение (напр. 150,8М)" value="${escAttr(tile.value||'')}" data-act="updateMetricTile" data-args='["${compKey}","${blockId}",${idx},${active},"value","$value"]'>
          <input type="text" placeholder="Подпись" value="${escAttr(tile.label||'')}" data-act="updateMetricTile" data-args='["${compKey}","${blockId}",${idx},${active},"label","$value"]'>
        </div>
        <div class="row2" style="margin-top:6px;">
          <input type="text" placeholder="Динамика (опц.)" value="${escAttr(tile.delta||'')}" data-act="updateMetricTile" data-args='["${compKey}","${blockId}",${idx},${active},"delta","$value"]'>
          <select style="width:100%;min-width:0" data-act="updateMetricTile" data-args='["${compKey}","${blockId}",${idx},${active},"direction","$value"]'>
            <option value="up"        ${tile.direction==='up'        ?'selected':''}>🟢 рост</option>
            <option value="up-bad"   ${tile.direction==='up-bad'   ?'selected':''}>🔴 рост</option>
            <option value="down-good"${tile.direction==='down-good'?'selected':''}>🟢 падение</option>
            <option value="down"     ${tile.direction==='down'     ?'selected':''}>🔴 падение</option>
            <option value="none"     ${tile.direction==='none'     ?'selected':''}>⚪ нейтрально</option>
          </select>
        </div>
      </div>
      ${tiles.length > 1 ? `<button class="metric-tile-del" data-act="removeMetricTile" data-args='["${compKey}","${blockId}",${idx},${active}]' title="Удалить">✕</button>` : ''}
    </div>` : ''}`;
}

export function toggleNewsMetricCollapse(compKey, blockId, idx) {
  const b = getBlock(compKey, blockId);
  if (!b || !b.items[idx]) return;
  b.items[idx].metricCollapsed = !b.items[idx].metricCollapsed;
  const editorEl = document.getElementById("editor");
  const savedScroll = editorEl ? editorEl.scrollTop : 0;
  renderEditor();
  if (editorEl) editorEl.scrollTop = savedScroll;
}
export function scrollToPreviewItem(blockId, idx) {
  // With a paginated preview the target item may live on a page that isn't
  // currently shown — switch to its page first, then scroll it into view.
  const pageIdx = findPageIndexForBlock(blockId);
  if (pageIdx >= 0 && pageIdx !== g.previewPage) {
    g.previewPage = pageIdx;
    renderPreview();
  }
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-item-ref="${blockId}-${idx}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
export function scrollToPreviewLetter() {
  const pageIdx = findPageIndexForKind("letter");
  if (pageIdx >= 0 && pageIdx !== g.previewPage) {
    g.previewPage = pageIdx;
    renderPreview();
  }
  requestAnimationFrame(() => {
    const el = document.querySelector(".page.letter");
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
export function clearNewsMetric(compKey, blockId, idx) {
  const b = getBlock(compKey, blockId);
  if (!b || !b.items[idx]) return;
  b.items[idx].tiles = [];
  render();
}
export function toggleMetricCollapse(compKey, blockId, idx) {
  const b = getBlock(compKey, blockId);
  if (!b || !b.items[idx]) return;
  b.items[idx].collapsed = !b.items[idx].collapsed;
  const editorEl = document.getElementById("editor");
  const savedScroll = editorEl ? editorEl.scrollTop : 0;
  renderEditor();
  if (editorEl) editorEl.scrollTop = savedScroll;
}
export function blockEditorHTML(compKey, block) {
  const meta  = getCompMeta(compKey);
  const label = getBlockLabel(block.type);
  const items = block.items.map((it, i) => itemEditorHTML(compKey, block.id, it, i)).join("");
  return `
    <div class="block-card ${block.collapsed ? 'collapsed' : ''}" data-id="${block.id}"
         draggable="false"
         data-dragstart="onDragStart" data-dragend="onDragEnd" data-dragover="onDragOver" data-drop="onDrop"
         data-dargs='["${compKey}","${block.id}"]'>
      <div class="block-head">
        ${dragHandle('.block-card')}
        <span class="block-badge" style="background:${meta.color}">${label}</span>
        <span class="block-actions">
          <button class="icon-btn" data-act="moveBlock" data-args='["${compKey}","${block.id}",-1]' title="Вверх"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg></button>
          <button class="icon-btn" data-act="moveBlock" data-args='["${compKey}","${block.id}",1]'  title="Вниз"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg></button>
          <button class="icon-btn" data-act="confirmRemoveBlock" data-args='["${compKey}","${block.id}"]' title="Удалить"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
          <button class="icon-btn" data-act="toggleBlock" data-args='["${compKey}","${block.id}"]'>${collapseIcon(block.collapsed)}</button>
        </span>
      </div>
      <div class="block-body">
        ${items}
        <div class="item-add-row">
          <button class="add-item-btn" data-act="addItem" data-args='["${compKey}","${block.id}","news"]'>Новость +</button>
          <button class="add-item-btn" data-act="addItem" data-args='["${compKey}","${block.id}","metric"]'>Метрика +</button>
          <button class="add-item-btn" data-act="addItem" data-args='["${compKey}","${block.id}","tops"]'>Топ +</button>
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
          <button type="button" class="company-json-btn" data-act="importCompanyJSON" data-args='["${compState.key}"]' title="Загрузить JSON в ${escAttr(meta.name)}">Загрузить</button>
          <button type="button" class="company-json-btn" data-act="exportCompanyJSON" data-args='["${compState.key}"]' title="Скачать JSON из ${escAttr(meta.name)}">Скачать</button>
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
