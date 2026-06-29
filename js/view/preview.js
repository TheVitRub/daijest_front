// ============================================================
//   PREVIEW VIEW — digest pages HTML
// ============================================================
import { escAttr, escText } from "../dom/escape.js";
import { getCompMeta, getBlockLabel } from "../config.js";
import { state, getTiles } from "../state/state.js";
import { g } from "../store.js";

export function pageCover() {
  if (!state.digestCover) return "";
  return `<div class="page cover"><img src="${state.digestCover}" alt=""></div>`;
}

export function pageLetter() {
  const l = state.letter;
  const paras = (l.paragraphs || "").split("\n").filter(p => p.trim()).map(p => `<p>${escText(p)}</p>`).join("");
  const bgStyle = l.cover ? ` style="background-image:url('${l.cover}');background-size:cover;background-position:center;"` : '';
  return `
    <div class="page letter"${bgStyle}>
      <div class="quote-mark">&bdquo;</div>
      <div class="letter-body-card">
        <h2>${escText(l.title)}</h2>
        ${paras}
        <div class="signature">${escText(l.signature)}</div>
      </div>
    </div>`;
}

export function pageCompanyDivider(compKey) {
  const meta = getCompMeta(compKey);
  return `
    <div class="page divider theme-${meta.theme}">
      <img src="logos/logo-${meta.key}.svg" class="divider-logo" alt="${escAttr(meta.name)}">
    </div>`;
}

export function metricGridHTML(tiles, refId) {
  if (!tiles.length) return "";
  const cols = tiles.length === 1 ? 'cols-1' : tiles.length === 3 ? 'cols-3' : '';
  const ref = refId ? ` data-item-ref="${refId}"` : '';
  return `
    <div class="kpi-grid ${cols}"${ref}>
      ${tiles.map(t => `
        <div class="kpi-tile">
          <div class="value">${escText(t.value || "")}</div>
          <div class="label">${escText(t.label || "")}</div>
          ${t.delta ? `<div class="delta ${t.direction || 'up'}">${escText(t.delta)}</div>` : ""}
        </div>`).join("")}
    </div>`;
}

export function newsItemHTML(it, refId) {
  const photos = it.photos || [];
  const textBlock = `
    ${it.title ? `<h4>${escText(it.title)}</h4>` : ""}
    ${it.text  ? `<p>${escText(it.text).replace(/\n/g, '<br>')}</p>`   : ""}`;
  const photoSlice = photos.slice(0, 4);
  const photoCount = photoSlice.length;
  const photoRatioVals = photoSlice.map(p => {
    const r = typeof p === 'string' ? (it.photoRatio || '4/3') : (p.ratio || '4/3');
    const [rw, rh] = r.split('/').map(Number);
    return { r, val: rw / rh };
  });
  const gridCols = photoCount > 1
    ? ` style="grid-template-columns:${photoRatioVals.map(x => x.val.toFixed(3)+'fr').join(' ')}"`
    : '';
  const photoGrid = photos.length ? `
    <div class="pt-photos n${photoCount}"${gridCols}>
      ${photoSlice.map((p, i) => {
        const src = typeof p === 'string' ? p : p.src;
        return `<div class="pt-img" style="aspect-ratio:${photoRatioVals[i].r}"><img src="${escAttr(src)}" alt=""></div>`;
      }).join("")}
    </div>` : "";
  const metricHTML = (it.tiles && it.tiles.length) ? metricGridHTML(it.tiles) : '';
  const ref = refId ? ` data-item-ref="${refId}"` : '';
  if (photos.length && it.photoLayout === 'side') {
    return `
      <div${metricHTML ? ' class="news-item-wrap"' : ''}${ref}>
        <div class="news-with-photo">
          <div class="news-side-text"><div class="news-side-inner">${textBlock}</div></div>
          ${photoGrid.replace('class="pt-photos', 'class="pt-photos side-photos')}
        </div>${metricHTML}
      </div>`;
  }
  if (photos.length && it.photoLayout === 'top') {
    return `
      <div class="news-block"${ref}>
        ${photoGrid}
        <div class="ach-item">
          <div class="ach-content">${textBlock}</div>
        </div>
        ${metricHTML}
      </div>`;
  }
  return `
    <div class="news-block"${ref}>
      <div class="ach-item">
        <div class="ach-content">${textBlock}</div>
      </div>${photoGrid}${metricHTML}
    </div>`;
}

export function pageBlock(compKey, block) {
  const meta      = getCompMeta(compKey);
  const label     = getBlockLabel(block.type);
  const shortName = meta.name.split("(")[0].trim();
  const itemsHTML = block.items.map((it, idx) => {
    const refId = `${block.id}-${idx}`;
    if (it.kind === 'metric') {
      return metricGridHTML(getTiles(it), refId);
    }
    return newsItemHTML(it, refId);
  }).join('');

  const footer = block.comment ? `<div class="footer-note">ⓘ ${escText(block.comment)}</div>` : "";
  return `
    <div class="page content theme-${meta.theme}">
      <div class="header">
        <h2>${escText(label)}</h2>
        <img src="logos/logo-${meta.key}.svg" class="company-logo" alt="${escAttr(meta.name)}">
      </div>
      <div class="ach-items">${itemsHTML}</div>
      ${footer}
    </div>`;
}

// ---- Pagination -----------------------------------------------------------
// The preview is paginated: only ONE digest page is rendered into the DOM at a
// time, so memory stays bounded regardless of how many pages (and multi-MB
// photos) the digest has. buildPageDescriptors() is the single source of truth
// for the page sequence; both the on-screen view and the exporter iterate it.
export function buildPageDescriptors() {
  const hasContent = state.companies.some(c => c.blocks.length > 0);
  if (!hasContent) return [];
  const pages = [];
  if (state.digestCover) pages.push({ kind: "cover" });
  pages.push({ kind: "letter" });
  for (const comp of state.companies) {
    if (!comp.blocks.length) continue;
    pages.push({ kind: "divider", compKey: comp.key });
    for (const block of comp.blocks) {
      pages.push({ kind: "block", compKey: comp.key, blockId: block.id, block });
    }
  }
  return pages;
}

export function pageDescriptorHTML(d) {
  switch (d.kind) {
    case "cover":   return pageCover();
    case "letter":  return pageLetter();
    case "divider": return pageCompanyDivider(d.compKey);
    case "block":   return pageBlock(d.compKey, d.block);
    default:        return "";
  }
}

// Ordered list of page HTML strings (used by the exporter, one per output page).
export function buildPageList() {
  return buildPageDescriptors().map(pageDescriptorHTML);
}

// Page index that contains a given block (for "go to preview"); -1 if not found.
export function findPageIndexForBlock(blockId) {
  return buildPageDescriptors().findIndex(d => d.kind === "block" && d.blockId === blockId);
}

function clampPreviewPage(total) {
  if (g.previewPage < 0 || !Number.isFinite(g.previewPage)) g.previewPage = 0;
  if (g.previewPage > total - 1) g.previewPage = total - 1;
  return g.previewPage;
}

function previewNavHTML(cur, total) {
  return `
    <div class="preview-nav">
      <button class="preview-nav-btn" data-act="previewPrev"${cur === 0 ? " disabled" : ""} title="Предыдущая страница">‹</button>
      <span class="preview-nav-counter">${cur + 1} / ${total}</span>
      <button class="preview-nav-btn" data-act="previewNext"${cur === total - 1 ? " disabled" : ""} title="Следующая страница">›</button>
    </div>`;
}

// Run after the current page is in the DOM: lay out aspect-ratio photo grids,
// then sync side-layout text heights (re-syncing once late-loading images land).
function syncCurrentPage(pv) {
  requestAnimationFrame(() => {
    syncSidePhotoHeights(pv);
    const imgs = Array.from(pv.querySelectorAll('.news-with-photo img'));
    if (!imgs.length) return;
    const pending = imgs.filter(img => !img.complete);
    if (!pending.length) return;
    let done = 0;
    const onDone = () => { if (++done === pending.length) syncSidePhotoHeights(pv); };
    pending.forEach(img => {
      img.addEventListener('load', onDone, { once: true });
      img.addEventListener('error', onDone, { once: true });
    });
  });
}

export function renderPreview() {
  const pv = document.getElementById("preview");
  if (!pv) return;
  const descs = buildPageDescriptors();
  if (!descs.length) {
    pv.innerHTML = `<div class="empty-state"><img src="logos/kao.svg" class="empty-kao"><div>здесь пока пусто</div></div>`;
    return;
  }
  const cur = clampPreviewPage(descs.length);
  pv.innerHTML = previewNavHTML(cur, descs.length) + pageDescriptorHTML(descs[cur]);
  // Use rAF so the browser has calculated layout for aspect-ratio containers
  // before we measure their height. Cached images are complete synchronously
  // but getBoundingClientRect still returns 0 before first paint.
  syncCurrentPage(pv);
}

function gotoPreviewPage(idx) {
  const total = buildPageDescriptors().length;
  if (!total) return;
  const next = Math.max(0, Math.min(idx, total - 1));
  if (next === g.previewPage) return;
  g.previewPage = next;
  renderPreview();
  const pv = document.getElementById("preview");
  if (pv) pv.scrollTop = 0;
}

export function previewPrev() { gotoPreviewPage(g.previewPage - 1); }
export function previewNext() { gotoPreviewPage(g.previewPage + 1); }

// Render a single page (no nav chrome) into the preview and resolve once layout
// has settled — used by the exporter to materialise one page at a time so peak
// memory stays at ~1 page. Does NOT touch the export rendering core.
export function renderExportPageHTML(html) {
  const pv = document.getElementById("preview");
  if (!pv) return Promise.resolve();
  pv.innerHTML = html;
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      syncSidePhotoHeights(pv);          // measure aspect-ratio grids, set side heights
      requestAnimationFrame(resolve);    // let the synced heights apply before capture
    });
  });
}

// Match each side-layout news text card to its photo grid height via a measure
// pass. (Doing this with CSS `align-items: stretch` on a grid whose children use
// `aspect-ratio` can trigger an infinite-layout loop / renderer crash in
// Chromium, so we keep align-items:start and set the height explicitly.)
export function syncSidePhotoHeights(root) {
  root.querySelectorAll('.news-with-photo').forEach(wrap => {
    const photos = wrap.querySelector('.side-photos');
    const text = wrap.querySelector('.news-side-text');
    if (!photos || !text) return;
    text.style.height = '';
    const h = photos.getBoundingClientRect().height;
    if (h > 0) text.style.height = h + 'px';
  });
}
