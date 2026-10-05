// ============================================================
//   EDITOR VIEW — editor pane HTML + image handling
// ============================================================
import { g } from "../store.js";
import { escAttr, escText } from "../dom/escape.js";
import { collapseIcon, ITEM_DRAG_HANDLE, itemDragAttrs, dragHandle } from "../dom/icons.js";
import { getCompMeta, getBlockLabel, BLOCK_TYPES, LETTER_PLACEHOLDERS, imageSrc, photoSrc } from "../config.js";
import { state, getBlock, getTiles, removeHappyJobRow } from "../state/state.js";
import { HAPPY_JOB_TYPE, HAPPY_JOB_SUMMARY, HAPPY_JOB_TABLE } from "../state/happy-job.js";
import { AMP_COMPANY_KEY, AMP_TYPE } from "../state/amp.js";
import { render } from "../render.js";
import { saveRemoteNow, openConfirmDialog } from "../features/projects.js";
import { shouldSkipContentDeleteConfirm } from "../features/delete-preference.js";
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
function mediaActionsHTML(value, name, deleteButton) {
  return `<div class="media-thumb-actions">
    <button type="button" class="media-del media-download" data-act="downloadImage" data-args='${escAttr(JSON.stringify([value, name, '$this']))}' title="Скачать изображение" aria-label="Скачать изображение"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4"/></svg></button>
    ${deleteButton}
  </div>`;
}
// Toggle a company's "add block" menu (DOM-only).
export function toggleAddMenu(compKey) {
  const menu = document.querySelector(`[data-addmenu="${compKey}"]`);
  if (menu) menu.classList.toggle("open");
}
// Toggle a block's "add item" menu (DOM-only).
export function toggleItemAddMenu(blockId) {
  const menu = document.querySelector(`[data-itemaddmenu="${blockId}"]`);
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
  if (!files || !files.length || g.revisionPreview) return;
  const b = getBlock(compKey, blockId);
  if (!b || !b.items[idx]) return;
  const item = b.items[idx];
  const projectId = g.currentDigestId;
  const isCurrent = () => !g.revisionPreview && g.currentDigestId === projectId &&
    getBlock(compKey, blockId) === b && b.items.includes(item);
  if (!item.photos) item.photos = [];
  const ratio = _ratioCtx.ratio || item.photoRatio || '4/3';
  const photos = item.photos;
  let uploadedAny = false;
  for (const f of Array.from(files)) {
    if (!isCurrent()) break;
    // Optimistic placeholder so the slot fills with a spinner while uploading.
    const ph = { uploading: true, ratio };
    const discard = () => { const i = photos.indexOf(ph); if (i >= 0) photos.splice(i, 1); };
    photos.push(ph);
    render();
    try {
      // Table attachments include QR images through the ordinary photo input.
      // Preserve PNG edges instead of introducing JPEG compression artifacts.
      const blob = item.kind === HAPPY_JOB_TABLE && f.type === 'image/png'
        ? f : await downscaleToBlob(f);
      if (!isCurrent()) { discard(); break; }
      ph.mediaId = await uploadMedia(blob, f.name || 'photo.jpg');
      if (!isCurrent()) { discard(); break; }
      delete ph.uploading;
      uploadedAny = true;
    } catch (err) {
      console.error('photo upload failed:', err);
      // Keep state clean: drop the failed placeholder so no broken ref persists.
      discard();
      if (isCurrent()) alert('Не удалось загрузить фото. Попробуйте ещё раз.');
    }
    if (isCurrent()) render();
  }
  // State now holds only mediaId refs (tiny) — save immediately so a quick
  // refresh doesn't lose the just-added photos.
  if (uploadedAny && isCurrent()) saveRemoteNow();
}
export function removeItemPhoto(compKey, blockId, itemIdx, photoIdx) {
  const b = getBlock(compKey, blockId);
  if (!b || !b.items[itemIdx] || g.revisionPreview) return;
  b.items[itemIdx].photos.splice(photoIdx, 1);
  render();
}

// Pending uploads stay outside the saved document. Keep the item identity so
// moving/deleting a news item or switching projects cannot attach its QR elsewhere.
const qrUploads = new WeakMap();
export async function loadItemQr(compKey, blockId, idx, files, input) {
  const file = files?.[0];
  if (input) input.value = '';
  const block = getBlock(compKey, blockId);
  const item = block?.items[idx];
  if (!file || item?.kind !== 'news' || g.revisionPreview || qrUploads.has(item)) return;
  const projectId = g.currentDigestId;
  const request = {};
  qrUploads.set(item, request);
  const isCurrent = () => qrUploads.get(item) === request &&
    g.currentDigestId === projectId && !g.revisionPreview &&
    getBlock(compKey, blockId) === block && block.items.includes(item);
  renderEditor();
  try {
    const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!pngSignature.every((byte, i) => signature[i] === byte)) {
      throw new Error('Выберите PNG-картинку с QR-кодом.');
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
    } catch (_) {
      throw new Error('Не удалось прочитать PNG-картинку. Выберите другой файл.');
    } finally {
      URL.revokeObjectURL(url);
    }
    if (!isCurrent()) return;
    // Upload the original PNG: JPEG conversion would blur the QR's edges.
    const mediaId = await uploadMedia(file, file.name || 'qr.png');
    if (!isCurrent()) return;
    item.qr = { mediaId };
    item.photoLayout = 'bottom';
    qrUploads.delete(item);
    render();
    saveRemoteNow();
  } catch (err) {
    console.error('QR upload failed:', err);
    if (isCurrent()) alert(err.message || 'Не удалось загрузить QR. Попробуйте ещё раз.');
  } finally {
    if (qrUploads.get(item) === request) {
      const refresh = isCurrent();
      qrUploads.delete(item);
      if (refresh) renderEditor();
    }
  }
}
export function removeItemQr(compKey, blockId, idx) {
  const item = getBlock(compKey, blockId)?.items[idx];
  if (item?.kind !== 'news' || g.revisionPreview) return;
  qrUploads.delete(item);
  delete item.qr;
  item.photoLayout = 'bottom';
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
           ${mediaActionsHTML(state.digestCover, 'digest-cover', '<button class="media-del" data-act="removeDigestCover" title="Удалить обложку">✕</button>')}
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
           ${mediaActionsHTML(l.cover, 'letter-cover', '<button class="media-del" data-act="removeLetterCover" title="Удалить обложку">✕</button>')}
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
      <div class="letter-body letter-editor-body">
        <div class="letter-field">
          <input type="text" maxlength="200" placeholder="${escAttr(LETTER_PLACEHOLDERS.title)}" aria-label="Заголовок обращения редакции" value="${escAttr(l.title)}" data-act="updateLetterField" data-args='["title","$value"]' data-counter="cc_ltitle" data-max="200">
          <div class="char-counter" id="cc_ltitle">${(l.title||'').length}/200</div>
        </div>
        <div class="letter-field">
          <textarea maxlength="600" placeholder="${escAttr(LETTER_PLACEHOLDERS.paragraphs)}" aria-label="Текст обращения редакции" data-act="updateLetterField" data-args='["paragraphs","$value"]' data-counter="cc_lpara" data-max="600" style="min-height:90px">${escText(l.paragraphs)}</textarea>
          <div class="char-counter" id="cc_lpara">${(l.paragraphs||'').length}/600</div>
        </div>
        <input type="text" placeholder="${escAttr(LETTER_PLACEHOLDERS.signature)}" aria-label="Подпись обращения редакции" value="${escAttr(l.signature)}" data-act="updateLetterField" data-args='["signature","$value"]'>
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
function itemTitleInputHTML(compKey, blockId, item, idx, colIdx = null) {
  const isTop = item.kind === 'tops';
  const title = (isTop ? item.columns?.[colIdx]?.title : item.title) || '';
  if (item.collapsed && !title.trim()) return '';
  const placeholder = isTop ? 'Заголовок колонки' : item.kind === 'news' ? 'Заголовок новости' : 'Заголовок (опц.)';
  const max = item.kind === 'news' ? 600 : 120;
  const unlimited = item.kind === 'news' && compKey === AMP_COMPANY_KEY;
  const args = isTop
    ? [compKey, blockId, idx, colIdx, '$value']
    : [compKey, blockId, idx, 'title', '$value'];
  const counter = item.kind === 'news' && !unlimited ? ` data-counter="cc_t_${blockId}_${idx}" data-max="600"` : '';
  return `<input type="text" class="item-title-input" placeholder="${placeholder}" aria-label="${placeholder}"${unlimited ? '' : ` maxlength="${max}"`} value="${escAttr(title)}"
    data-act="${isTop ? 'updateTopColTitle' : 'updateItemField'}" data-args='${escAttr(JSON.stringify(args))}'${counter}
    data-focusout="finishItemTitleEdit" data-fargs='${escAttr(JSON.stringify([compKey, blockId, idx, '$this']))}'>`;
}

export function finishItemTitleEdit(compKey, blockId, idx, input) {
  const item = getBlock(compKey, blockId)?.items[idx];
  // Typing updates state without rebuilding the editor, so an emptied title
  // remains editable until blur. Remove only this field to preserve focus
  // and pending clicks on the rest of the card.
  if (item?.collapsed && !input.value.trim()) input.remove();
}

export function itemEditorHTML(compKey, blockId, item, idx) {
  if (item.kind === "news") {
    const unlimited = compKey === AMP_COMPANY_KEY;
    const qrSrc = imageSrc(item.qr);
    const qrUploading = qrUploads.has(item);
    const photos = (item.photos || []).map((p, pi) => {
      if (p && p.uploading) {
        return `<div class="media-thumb media-thumb-loading"><div class="media-spinner"></div></div>`;
      }
      const src = photoSrc(p);
      return `<div class="media-thumb">
        <img src="${escAttr(src)}" loading="lazy" alt="">
        ${mediaActionsHTML(p, `photo-${pi + 1}`, `<button class="media-del" data-act="removeItemPhoto" data-args='["${compKey}","${blockId}",${idx},${pi}]' title="Удалить фото">✕</button>`)}
      </div>`;
    }).join("");
    return `
      <div class="item-block" ${itemDragAttrs(compKey, blockId, idx)}>
        <div class="item-del-row">
          ${ITEM_DRAG_HANDLE}
          <span class="metric-label-tag">Новость</span>
          <button class="item-del-btn" data-act="scrollToPreviewItem" data-args='["${blockId}",${idx}]' title="Перейти в превью"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>
          <button type="button" class="item-del-btn metric-collapse-btn" data-act="toggleNewsCollapse" data-args='["${compKey}","${blockId}",${idx}]' aria-expanded="${!item.collapsed}" title="${item.collapsed ? 'Развернуть' : 'Свернуть'}">${collapseIcon(item.collapsed)}</button>
          <button class="item-del-btn" data-act="confirmRemoveItem" data-args='["${compKey}","${blockId}",${idx}]'>✕</button>
        </div>
        ${itemTitleInputHTML(compKey, blockId, item, idx)}
        ${item.collapsed ? '' : `
        ${unlimited ? '' : `<div class="char-counter" id="cc_t_${blockId}_${idx}">${(item.title||'').length}/600</div>`}
        <div class="collapsible-wrap"><textarea placeholder="Текст новости"${unlimited ? '' : ' maxlength="600"'} data-act="updateItemField" data-args='["${compKey}","${blockId}",${idx},"text","$value"]'${unlimited ? '' : ` data-counter="cc_p_${blockId}_${idx}" data-max="600"`} data-collapsible>${escText(item.text || '')}</textarea></div>
        ${unlimited ? '' : `<div class="char-counter" id="cc_p_${blockId}_${idx}">${(item.text||'').length}/600</div>`}
        ${photos || qrSrc ? `<div class="media-row">${photos}
        ${qrSrc ? `
          <div class="media-thumb news-qr-thumb">
            <img src="${escAttr(qrSrc)}" alt="Прикреплённый QR-код">
            ${mediaActionsHTML(item.qr, 'qr-code', `<button type="button" class="media-del" data-act="removeItemQr" data-args='["${compKey}","${blockId}",${idx}]' title="Удалить QR" aria-label="Удалить QR"${qrUploading ? ' disabled' : ''}>✕</button>`)}
          </div>
        ` : ""}
        </div>` : ""}
        <div class="media-layout-row news-media-actions${photos && !qrSrc ? ' has-photo-layout' : ''}">
          <button class="media-add-btn" data-act="showRatioModal" data-args='["${compKey}","${blockId}",${idx}]'>Прикрепить медиа</button>
          <button type="button" class="${photos && !qrSrc ? 'layout-btn news-qr-button' : 'media-add-btn'}" title="${qrUploading ? 'Загрузка QR…' : qrSrc ? 'Заменить QR' : 'Прикрепить QR'}" aria-label="${qrUploading ? 'Загрузка QR…' : qrSrc ? 'Заменить QR' : 'Прикрепить QR'}" data-act="clickInput" data-args='["qi_${blockId}_${idx}"]'${qrUploading ? ' disabled aria-busy="true"' : ''}>${photos && !qrSrc ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><path d="M15 15h3v3h3m-6 3v-3m6-3v-3M3 12h3m6-9v3m0 6h3m-3 3v3"/></svg>' : qrUploading ? 'Загрузка QR…' : qrSrc ? 'Заменить QR' : 'Прикрепить QR'}</button>
${photos && !qrSrc ? `          <div class="layout-toggle">
            <button class="layout-btn" title="Сверху" data-act="updateItemField" data-args='["${compKey}","${blockId}",${idx},"photoLayout","top"]'><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg></button>
            <button class="layout-btn" title="Снизу" data-act="updateItemField" data-args='["${compKey}","${blockId}",${idx},"photoLayout","bottom"]'><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg></button>
            <button class="layout-btn" title="Сбоку" data-act="updateItemField" data-args='["${compKey}","${blockId}",${idx},"photoLayout","side"]'><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>
          </div>` : ""}
        </div>
        <input type="file" id="mi_${blockId}_${idx}" accept="image/*" multiple style="display:none" data-act="loadItemPhotos" data-args='["${compKey}","${blockId}",${idx},"$files"]'>
        <input type="file" id="qi_${blockId}_${idx}" accept="image/png,.png" style="display:none" data-act="loadItemQr" data-args='["${compKey}","${blockId}",${idx},"$files","$this"]'>
        ${(item.tiles && item.tiles.length)
          ? `<div class="news-metric-wrap">
              <div class="item-del-row news-metric-head">
                <span class="metric-label-tag">Метрика</span>
                <button class="item-del-btn metric-collapse-btn" data-act="toggleNewsMetricCollapse" data-args='["${compKey}","${blockId}",${idx}]' title="${item.metricCollapsed ? 'Развернуть' : 'Свернуть'}">${collapseIcon(item.metricCollapsed)}</button>
                <button class="item-del-btn" data-act="clearNewsMetric" data-args='["${compKey}","${blockId}",${idx}]' title="Удалить метрику">✕</button>
              </div>
              ${item.metricCollapsed ? '' : `<div class="news-metric-body">
                ${tileTabsHTML(compKey, blockId, idx, item)}
                <div class="metric-excel-actions">
                  <button type="button" class="company-json-btn" data-act="downloadMetricsTemplate" data-args='${escAttr(JSON.stringify([compKey, blockId, idx]))}'>Скачать шаблон</button>
                  <button type="button" class="company-json-btn" data-act="uploadMetricsExcel" data-args='${escAttr(JSON.stringify([compKey, blockId, idx]))}'>Загрузить метрики</button>
                </div>
              </div>`}
            </div>`
          : `<button class="add-item-btn" data-act="addMetricTile" data-args='["${compKey}","${blockId}",${idx}]'>Добавить метрики</button>`
        }
        `}
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
    const photos = (item.photos || []).map((p, pi) => {
      if (p && p.uploading) {
        return `<div class="media-thumb media-thumb-loading"><div class="media-spinner"></div></div>`;
      }
      return `<div class="media-thumb">
        <img src="${escAttr(photoSrc(p))}" loading="lazy" alt="">
        ${mediaActionsHTML(p, `photo-${pi + 1}`, `<button class="media-del" data-act="removeItemPhoto" data-args='["${compKey}","${blockId}",${idx},${pi}]' title="Удалить фото">✕</button>`)}
      </div>`;
    }).join("");
    return `
      <div class="item-block item-block-tops" ${itemDragAttrs(compKey, blockId, idx)}>
        <div class="item-del-row">
          ${ITEM_DRAG_HANDLE}
          <span class="metric-label-tag">Топ</span>
          <button class="item-del-btn" data-act="scrollToPreviewItem" data-args='["${blockId}",${idx}]' title="Перейти в превью"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>
          <button type="button" class="item-del-btn metric-collapse-btn" data-act="toggleTopsCollapse" data-args='["${compKey}","${blockId}",${idx}]' aria-expanded="${!item.collapsed}" title="${item.collapsed ? 'Развернуть' : 'Свернуть'}">${collapseIcon(item.collapsed)}</button>
          <button class="item-del-btn" data-act="confirmRemoveItem" data-args='["${compKey}","${blockId}",${idx}]'>✕</button>
        </div>
        ${itemTitleInputHTML(compKey, blockId, item, idx, active)}
        ${item.collapsed ? '' : `
        <div class="tile-tabs">
          ${columns.map((_, ci) => `<button class="tile-tab-btn${ci === active ? ' active' : ''}" data-act="setActiveTopCol" data-args='["${compKey}","${blockId}",${idx},${ci}]' title="Колонка ${ci + 1}">${ci + 1}</button>`).join('')}
          ${canAdd ? `<button class="tile-tab-btn tile-tab-add" data-act="addTopColumn" data-args='["${compKey}","${blockId}",${idx}]' title="Добавить колонку">+</button>` : ''}
        </div>
        <div class="tops-edit-rows">${rowsHTML}</div>
        ${photos ? `<div class="media-row">${photos}</div>` : ""}
        <div class="tops-edit-actions tops-primary-actions">
          <button class="add-item-btn" data-act="addTopRow" data-args='["${compKey}","${blockId}",${idx},${active}]'>Добавить строку</button>
          <button class="media-add-btn" data-act="showRatioModal" data-args='["${compKey}","${blockId}",${idx}]'>Прикрепить медиа</button>
        </div>
        ${canRemove ? `<div class="tops-edit-actions"><button class="add-item-btn tops-del-col" data-act="removeTopColumn" data-args='["${compKey}","${blockId}",${idx},${active}]' title="Удалить эту колонку">Удалить колонку</button></div>` : ''}
        <input type="file" id="mi_${blockId}_${idx}" accept="image/*" multiple style="display:none" data-act="loadItemPhotos" data-args='["${compKey}","${blockId}",${idx},"$files"]'>
        `}
      </div>`;
  }
  return `
    <div class="item-block item-block-metric ${item.collapsed ? 'metric-collapsed' : ''}" ${itemDragAttrs(compKey, blockId, idx)}>
      <div class="item-del-row">
        ${ITEM_DRAG_HANDLE}
        <span class="metric-label-tag">Метрика</span>
        <button class="item-del-btn" data-act="scrollToPreviewItem" data-args='["${blockId}",${idx}]' title="Перейти в превью"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>
        <button class="item-del-btn metric-collapse-btn" data-act="toggleMetricCollapse" data-args='["${compKey}","${blockId}",${idx}]' title="${item.collapsed ? 'Развернуть' : 'Свернуть'}">${collapseIcon(item.collapsed)}</button>
        <button class="item-del-btn" data-act="confirmRemoveItem" data-args='["${compKey}","${blockId}",${idx}]'>✕</button>
      </div>
      ${itemTitleInputHTML(compKey, blockId, item, idx)}
      ${item.collapsed ? '' : `
      ${tileTabsHTML(compKey, blockId, idx, item)}
      <div class="metric-excel-actions">
        <button type="button" class="company-json-btn" data-act="downloadMetricsTemplate" data-args='${escAttr(JSON.stringify([compKey, blockId, idx]))}'>Скачать шаблон</button>
        <button type="button" class="company-json-btn" data-act="uploadMetricsExcel" data-args='${escAttr(JSON.stringify([compKey, blockId, idx]))}'>Загрузить метрики</button>
      </div>`}
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
export function scrollToPreviewBlock(blockId) {
  const pageIdx = findPageIndexForBlock(blockId);
  if (pageIdx < 0) return;
  if (pageIdx !== g.previewPage) {
    g.previewPage = pageIdx;
    renderPreview();
  }
  requestAnimationFrame(() => {
    document.querySelector('#preview .page')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  const item = b?.items[idx];
  if (!item?.tiles?.length || g.revisionPreview) return;
  const projectId = g.currentDigestId;
  const remove = () => {
    if (g.currentDigestId !== projectId || g.revisionPreview || getBlock(compKey, blockId) !== b || !b.items.includes(item)) return;
    item.tiles = [];
    render();
  };
  if (shouldSkipContentDeleteConfirm()) { remove(); return; }
  openConfirmDialog({
    title: 'Удалить метрики из новости?',
    message: 'Все метрики этой новости будут удалены. Восстановление возможно только через отмену изменений или сохранённую версию, пока они доступны.',
    confirmText: 'Удалить',
    danger: true,
    contentDeletion: true,
    skipContentDeletion: false,
    onConfirm: remove,
  });
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
export function toggleNewsCollapse(compKey, blockId, idx) {
  const item = getBlock(compKey, blockId)?.items[idx];
  if (!item || item.kind !== 'news' || g.revisionPreview) return;
  toggleMetricCollapse(compKey, blockId, idx);
}
export function toggleTopsCollapse(compKey, blockId, idx) {
  const item = getBlock(compKey, blockId)?.items[idx];
  if (!item || item.kind !== 'tops' || g.revisionPreview) return;
  toggleMetricCollapse(compKey, blockId, idx);
}
export function toggleBlockItemsCollapse(compKey, blockId) {
  const block = getBlock(compKey, blockId);
  if (!block || g.revisionPreview) return;
  if (!block.items.length) return;
  const collapsed = block.items.some(item => !item.collapsed);
  block.items.forEach(item => { item.collapsed = collapsed; });
  const editorEl = document.getElementById('editor');
  const savedScroll = editorEl?.scrollTop || 0;
  renderEditor();
  if (editorEl) editorEl.scrollTop = savedScroll;
}

// Happy Job has two fixed cards; only table rows can be added or removed.
export function setActiveHappyJobRow(compKey, blockId, rowIdx) {
  const block = getBlock(compKey, blockId);
  const table = block?.items.find(item => item.kind === HAPPY_JOB_TABLE);
  if (block?.type !== HAPPY_JOB_TYPE || !table?.rows[rowIdx] || g.revisionPreview) return;
  table.activeRowIdx = rowIdx;
  const editorEl = document.getElementById('editor');
  const savedScroll = editorEl?.scrollTop || 0;
  renderEditor();
  if (editorEl) editorEl.scrollTop = savedScroll;
}

export function toggleHappyJobCollapse(compKey, blockId, idx) {
  const block = getBlock(compKey, blockId);
  if (block?.type !== HAPPY_JOB_TYPE || !block.items[idx] || g.revisionPreview) return;
  toggleMetricCollapse(compKey, blockId, idx);
}

export function confirmRemoveHappyJobRow(compKey, blockId, rowIdx) {
  const block = getBlock(compKey, blockId);
  const table = block?.items.find(item => item.kind === HAPPY_JOB_TABLE);
  const row = table?.rows[rowIdx];
  if (block?.type !== HAPPY_JOB_TYPE || !row || g.revisionPreview) return;
  const projectId = g.currentDigestId;
  const remove = () => {
    if (g.currentDigestId !== projectId || g.revisionPreview || getBlock(compKey, blockId) !== block) return;
    const currentIndex = table.rows.indexOf(row);
    if (currentIndex >= 0) removeHappyJobRow(compKey, blockId, currentIndex);
  };
  if (shouldSkipContentDeleteConfirm()) { remove(); return; }
  openConfirmDialog({
    title: `Удалить строку ${rowIdx + 1}?`,
    message: 'Оба текста этой строки будут удалены. Фотографии таблицы сохранятся.',
    confirmText: 'Удалить', danger: true, contentDeletion: true,
    skipContentDeletion: false, onConfirm: remove,
  });
}

export function happyJobItemEditorHTML(compKey, blockId, item, idx) {
  const isSummary = item.kind === HAPPY_JOB_SUMMARY;
  const fieldArgs = field => escAttr(JSON.stringify([compKey, blockId, idx, field, '$value']));
  const input = (field, placeholder) => `<input type="text" value="${escAttr(item[field] || '')}" placeholder="${escAttr(placeholder)}" aria-label="${escAttr(placeholder)}" data-act="updateItemField" data-args='${fieldArgs(field)}'>`;
  const textarea = (field, placeholder) => `<div class="collapsible-wrap"><textarea placeholder="${escAttr(placeholder)}" aria-label="${escAttr(placeholder)}" data-act="updateItemField" data-args='${fieldArgs(field)}' data-collapsible>${escText(item[field] || '')}</textarea></div>`;
  const header = `<div class="item-del-row happy-job-section-head">
    <input type="text" class="happy-job-section-title" value="${escAttr(item.title || '')}" placeholder="${isSummary ? 'Голос сотрудников' : 'Вы подсказали — мы сделали'}" aria-label="${isSummary ? 'Заголовок страницы Happy Job' : 'Заголовок таблицы (необязательно)'}" data-act="updateItemField" data-args='${fieldArgs('title')}'>
    <button type="button" class="item-del-btn" data-act="scrollToPreviewItem" data-args='${escAttr(JSON.stringify([blockId, idx]))}' title="Перейти в превью" aria-label="Перейти в превью"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>
    <button type="button" class="item-del-btn" data-act="toggleHappyJobCollapse" data-args='${escAttr(JSON.stringify([compKey, blockId, idx]))}' aria-expanded="${!item.collapsed}" title="${item.collapsed ? 'Развернуть' : 'Свернуть'}" aria-label="${item.collapsed ? 'Развернуть блок' : 'Свернуть блок'}">${collapseIcon(item.collapsed)}</button>
  </div>`;
  if (item.collapsed) return `<div class="item-block happy-job-editor-section">${header}</div>`;
  if (isSummary) return `<div class="item-block happy-job-editor-section">${header}
    ${input('result', 'Результат опроса')}
    ${input('ideas', 'Идей для улучшений')}
    ${textarea('text', 'Комментарий к результатам опроса')}
  </div>`;

  const rows = item.rows || [];
  const active = Math.max(0, Math.min(item.activeRowIdx || 0, rows.length - 1));
  const row = rows[active];
  const rowField = (field, placeholder) => `<div class="collapsible-wrap"><textarea placeholder="${escAttr(placeholder)}" aria-label="${escAttr(placeholder)}" data-act="updateHappyJobRow" data-args='${escAttr(JSON.stringify([compKey, blockId, active, field, '$value']))}' data-collapsible>${escText(row[field] || '')}</textarea></div>`;
  const photos = (item.photos || []).map((photo, pi) => photo?.uploading
    ? '<div class="media-thumb media-thumb-loading"><div class="media-spinner"></div></div>'
    : `<div class="media-thumb"><img src="${escAttr(photoSrc(photo))}" loading="lazy" alt="Фото таблицы ${pi + 1}">
      ${mediaActionsHTML(photo, `happy-job-photo-${pi + 1}`, `<button type="button" class="media-del" data-act="removeItemPhoto" data-args='${escAttr(JSON.stringify([compKey, blockId, idx, pi]))}' title="Удалить фото" aria-label="Удалить фото ${pi + 1}">✕</button>`)}
    </div>`).join('');
  return `<div class="item-block happy-job-editor-section">${header}
    <div class="row2 happy-job-column-titles">${input('suggestionTitle', 'Заголовок левой колонки')}${input('actionTitle', 'Заголовок правой колонки')}</div>
    <div class="tile-tabs happy-job-row-tabs" aria-label="Строки таблицы">
      ${rows.map((_, ri) => `<button type="button" class="tile-tab-btn${ri === active ? ' active' : ''}" data-act="setActiveHappyJobRow" data-args='${escAttr(JSON.stringify([compKey, blockId, ri]))}' aria-pressed="${ri === active}" title="Строка ${ri + 1}">${ri + 1}</button>`).join('')}
      <button type="button" class="tile-tab-btn tile-tab-add" data-act="addHappyJobRow" data-args='${escAttr(JSON.stringify([compKey, blockId]))}' title="Добавить строку" aria-label="Добавить строку">+</button>
    </div>
    ${row ? `${rowField('suggestion', 'Вы подсказали')}${rowField('action', 'Мы сделали')}`
      : '<div class="happy-job-empty-rows">Добавьте строку кнопкой «+».</div>'}
    ${photos ? `<div class="media-row">${photos}</div>` : ''}
    <div class="media-layout-row happy-job-table-actions">
      <button type="button" class="media-add-btn" data-act="showRatioModal" data-args='${escAttr(JSON.stringify([compKey, blockId, idx]))}'>Прикрепить медиа</button>
      ${row && rows.length > 1 ? `<button type="button" class="ui-button ui-button--md ui-button--danger happy-job-remove-row" data-act="confirmRemoveHappyJobRow" data-args='${escAttr(JSON.stringify([compKey, blockId, active]))}'>Удалить строку ${active + 1}</button>` : ''}
    </div>
    <input type="file" id="mi_${blockId}_${idx}" accept="image/*" multiple style="display:none" data-act="loadItemPhotos" data-args='${escAttr(JSON.stringify([compKey, blockId, idx, '$files']))}'>
    ${textarea('caption', 'Подпись под фотографиями')}
  </div>`;
}

export function blockEditorHTML(compKey, block) {
  const meta  = getCompMeta(compKey);
  const label = getBlockLabel(block.type);
  const isHappyJob = block.type === HAPPY_JOB_TYPE;
  const isAmp = compKey === AMP_COMPANY_KEY;
  const items = block.items.map((it, i) => isHappyJob
    ? happyJobItemEditorHTML(compKey, block.id, it, i)
    : itemEditorHTML(compKey, block.id, it, i)).join("");
  const itemsExpanded = block.items.some(item => !item.collapsed);
  const itemsToggleLabel = isHappyJob
    ? (itemsExpanded ? 'Свернуть оба блока' : 'Развернуть оба блока')
    : (itemsExpanded ? 'Свернуть все новости' : 'Развернуть все новости');
  return `
    <div class="block-card ${block.collapsed ? 'collapsed' : ''}" data-id="${block.id}"
         draggable="false"
         data-dragstart="onDragStart" data-dragend="onDragEnd" data-dragover="onDragOver" data-drop="onDrop"
         data-dargs='["${compKey}","${block.id}"]'>
      <div class="block-head">
        ${isAmp ? '' : dragHandle('.block-card')}
        <span class="block-badge" style="background:${meta.color}">${label}</span>
        <span class="block-actions">
            ${block.items.length ? `<button type="button" class="icon-btn" data-act="toggleBlockItemsCollapse" data-args='["${compKey}","${block.id}"]' title="${itemsToggleLabel}" aria-label="${itemsToggleLabel}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${itemsExpanded ? '<polyline points="6 11 12 5 18 11"/><polyline points="6 19 12 13 18 19"/>' : '<polyline points="6 5 12 11 18 5"/><polyline points="6 13 12 19 18 13"/>'}</svg></button>` : ''}
          <button type="button" class="icon-btn" data-act="scrollToPreviewBlock" data-args='["${block.id}"]' title="??????? ? ??????" aria-label="??????? ? ??????"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>
          <button class="icon-btn" data-act="confirmRemoveBlock" data-args='["${compKey}","${block.id}"]' title="Удалить"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
          <button class="icon-btn" data-act="toggleBlock" data-args='["${compKey}","${block.id}"]'>${collapseIcon(block.collapsed)}</button>
        </span>
      </div>
      <div class="block-body">
        ${isAmp ? `<div class="page-heading-editor">
          <label>Заголовок страницы
            <input type="text" placeholder="Заголовок страницы" value="${escAttr(block.title || '')}" data-act="updateBlockField" data-args='["${compKey}","${block.id}","title","$value"]'>
          </label>
          <label>Подзаголовок
            <textarea placeholder="Подзаголовок" rows="2" data-act="updateBlockField" data-args='["${compKey}","${block.id}","subtitle","$value"]'>${escText(block.subtitle || '')}</textarea>
          </label>
        </div>` : ''}
        ${items}
        ${isHappyJob ? '' : `<div class="add-block-wrap">
          <button type="button" class="add-block-trigger" data-act="toggleItemAddMenu" data-args='["${block.id}"]'><span>Добавить блок</span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>
          <div class="add-block-menu item-add-menu" data-itemaddmenu="${block.id}">
            <div class="add-menu-item" data-act="addItem" data-args='["${compKey}","${block.id}","news"]'>Новость</div>
            <div class="add-menu-item" data-act="addItem" data-args='["${compKey}","${block.id}","metric"]'>Метрики</div>
            <div class="add-menu-item" data-act="addItem" data-args='["${compKey}","${block.id}","tops"]'>Топ</div>
          </div>
        </div>
        <input type="text" class="comment-input" placeholder="Комментарий" value="${escAttr(block.comment || '')}" data-act="updateBlockField" data-args='["${compKey}","${block.id}","comment","$value"]'>`}
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
        ${meta.singlePage ? (compState.blocks.length ? '' : `<div class="add-block-wrap">
          <button type="button" class="add-block-trigger" data-act="addBlock" data-args='["${compState.key}","${AMP_TYPE}"]'>Создать страницу АМП</button>
        </div>`) : `<div class="add-block-wrap">
          <button type="button" class="add-block-trigger" data-act="toggleAddMenu" data-args='["${compState.key}"]'><span>Добавить страницу</span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>
          <div class="add-block-menu" data-addmenu="${compState.key}">${addItems}</div>
        </div>`}
      </div>
    </div>`;
}

export function renderEditor() {
  const el = document.getElementById("editor");
  if (!el) return;
  el.innerHTML = digestCoverEditorHTML() + letterEditorHTML() + state.companies.map(c => companyEditorHTML(c)).join("");
  initTextareas();
  if (g.revisionPreview) {
    el.querySelectorAll("input, textarea, select, button").forEach(control => {
      control.disabled = true;
    });
  }
}
