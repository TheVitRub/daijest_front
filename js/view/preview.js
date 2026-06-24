// ============================================================
//   PREVIEW VIEW — digest pages HTML
// ============================================================
import { escAttr, escText } from "../dom/escape.js";
import { getCompMeta, getBlockLabel } from "../config.js";
import { state, getTiles } from "../state/state.js";

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

export function metricGridHTML(tiles) {
  if (!tiles.length) return "";
  const cols = tiles.length === 1 ? 'cols-1' : tiles.length === 3 ? 'cols-3' : '';
  return `
    <div class="kpi-grid ${cols}">
      ${tiles.map(t => `
        <div class="kpi-tile">
          <div class="value">${escText(t.value || "")}</div>
          <div class="label">${escText(t.label || "")}</div>
          ${t.delta ? `<div class="delta ${t.direction || 'up'}">${escText(t.delta)}</div>` : ""}
        </div>`).join("")}
    </div>`;
}

export function newsItemHTML(it) {
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
  if (photos.length && it.photoLayout === 'side') {
    return `
      <div class="news-with-photo">
        <div class="news-side-text">${textBlock}</div>
        ${photoGrid.replace('class="pt-photos', 'class="pt-photos side-photos')}
      </div>`;
  }
  return `
    <div class="news-block">
      <div class="ach-item">
        <div class="ach-content">${textBlock}</div>
      </div>${photoGrid}
    </div>`;
}

export function pageBlock(compKey, block) {
  const meta      = getCompMeta(compKey);
  const label     = getBlockLabel(block.type);
  const shortName = meta.name.split("(")[0].trim();
  const itemsHTML = block.items.map(it => {
    if (it.kind === 'metric') {
      return metricGridHTML(getTiles(it));
    }
    return newsItemHTML(it);
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

export function renderPreview() {
  const pv = document.getElementById("preview");
  if (!pv) return;
  const hasContent = state.companies.some(c => c.blocks.length > 0);
  if (!hasContent) {
    pv.innerHTML = `<div class="empty-state"><img src="logos/kao.svg" class="empty-kao"><div>здесь пока пусто</div></div>`;
    return;
  }
  let html = pageCover() + pageLetter();
  for (const comp of state.companies) {
    if (!comp.blocks.length) continue;
    html += pageCompanyDivider(comp.key);
    for (const block of comp.blocks) html += pageBlock(comp.key, block);
  }
  pv.innerHTML = html;
}
