// ============================================================
//   MEDIA EXPORT — PNG / PDF (logic unchanged from monolith)
// ============================================================
import { state } from "../state/state.js";
import { confirmClearCurrentProject } from "./projects.js";
import { buildPageList, renderExportPageHTML, renderPreview } from "../view/preview.js";

function setEditorLocked(locked) {
  document.querySelectorAll('#editor input, #editor textarea, #editor select, #editor button')
    .forEach(el => el.disabled = locked);
}

export async function exportPDF() {
  if (!state.companies.some(c => c.blocks.length)) { alert("Сначала добавь хотя бы один блок."); return; }
  const pageList = buildPageList();
  if (!pageList.length) return;

  const jspdfNS = window.jspdf;
  if (!jspdfNS || !jspdfNS.jsPDF) { alert('Библиотека jsPDF не загружена.'); return; }
  const { jsPDF } = jspdfNS;

  const btn = document.querySelector('button.export-pdf');
  const titleEl = btn ? btn.querySelector('.ec-title') : null;
  const restore = titleEl ? titleEl.textContent : '';
  if (btn) btn.disabled = true;
  setEditorLocked(true);

  try {
    // Render ONE page at a time into the preview, snapshot it, discard, repeat.
    // This keeps peak memory at ~1 page even for very long digests. The capture
    // core (pageToDataUrl @ scale 3) is unchanged, so PDF and PNG stay identical.
    let doc = null;
    for (let i = 0; i < pageList.length; i++) {
      if (titleEl) titleEl.textContent = `Генерация ${i + 1} / ${pageList.length}`;
      await renderExportPageHTML(pageList[i]);
      const page = document.querySelector('#preview .page');
      if (!page) continue;
      const w = Math.round(page.offsetWidth);
      const h = Math.round(page.scrollHeight);
      const orientation = w >= h ? 'l' : 'p';
      const dataUrl = await pageToDataUrl(page, 3);
      if (!doc) {
        doc = new jsPDF({ unit: 'px', format: [w, h], orientation, compress: true });
      } else {
        doc.addPage([w, h], orientation);
      }
      doc.addImage(dataUrl, 'PNG', 0, 0, w, h);
    }
    if (doc) doc.save('digest.pdf');
  } catch (e) {
    console.error('PDF export error:', e);
    alert('Ошибка при генерации PDF. Проверь консоль.');
  } finally {
    if (titleEl) titleEl.textContent = restore || 'Скачать PDF';
    if (btn) btn.disabled = false;
    setEditorLocked(false);
    renderPreview(); // restore the paginated on-screen view
  }
}


const exportSvgDataUrlCache = new Map();
// In an ES module document.currentScript is null. The old base was app.js's
// directory (the web root); logos/*.svg resolve against the document root the
// same way the preview <img> tags do, so use the document base URL.
const exportAssetBaseUrl = new URL(".", document.baseURI).href;

export function isSvgImageSrc(src) {
  return /\.svg(?:[?#].*)?$/i.test(src || "");
}

export async function svgImageToDataUrl(src) {
  const url = new URL(src, exportAssetBaseUrl);
  const cacheKey = url.href;
  if (exportSvgDataUrlCache.has(cacheKey)) return exportSvgDataUrlCache.get(cacheKey);

  const response = await fetch(url.href, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Cannot load ${url.pathname}: ${response.status}`);
  const svgText = await response.text();
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  exportSvgDataUrlCache.set(cacheKey, dataUrl);
  return dataUrl;
}

export async function inlineSvgImagesForExport(root) {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(images.map(async img => {
    const src = img.getAttribute("src") || img.currentSrc || img.src || "";
    if (!isSvgImageSrc(src)) return;

    try {
      img.setAttribute("src", await svgImageToDataUrl(src));
    } catch (err) {
      console.warn("SVG image was not inlined for export:", src, err);
    }
  }));
}

// html2canvas does not support CSS `aspect-ratio` (cell sizing) or `object-fit`
// (image cropping), so photo cells render mis-sized and stretched. The clone is
// laid out by the real browser first, so we read each cell's true geometry and
// bake it into explicit px sizes + a background-image (cover), which html2canvas
// DOES render correctly. Measure everything before mutating to avoid reflow.
function bakePhotoCellsForExport(root) {
  root.querySelectorAll('.pt-photos').forEach(grid => {
    const cells = Array.from(grid.querySelectorAll('.pt-img'));
    if (!cells.length) return;
    const boxes = cells.map(c => c.getBoundingClientRect());
    grid.style.gridTemplateColumns = boxes.map(b => b.width + 'px').join(' ');
    grid.style.alignItems = 'start';
    cells.forEach((cell, i) => {
      const img = cell.querySelector('img');
      cell.style.width = boxes[i].width + 'px';
      cell.style.height = boxes[i].height + 'px';
      cell.style.aspectRatio = 'auto';
      if (img && img.src) {
        cell.style.backgroundImage = `url("${img.src}")`;
        cell.style.backgroundSize = 'cover';
        cell.style.backgroundPosition = 'center';
        cell.style.backgroundRepeat = 'no-repeat';
        img.remove();
      }
    });
  });
}

export async function pageToDataUrl(page, scale) {
  const w = page.offsetWidth;
  const h = page.scrollHeight;

  const clone = page.cloneNode(true);
  clone.style.cssText = `position:fixed;top:-99999px;left:0;width:${w}px;margin:0;box-sizing:border-box;`;
  await inlineSvgImagesForExport(clone);

  document.body.appendChild(clone);

  // The clone sits offscreen (top:-99999px); network images marked
  // loading="lazy" would never load there and the wait below would hang. Force
  // them eager so each truly loads before we snapshot.
  clone.querySelectorAll('img[loading]').forEach(img => img.removeAttribute('loading'));

  await Promise.all(Array.from(clone.querySelectorAll('img')).map(img =>
    new Promise(res => { if (img.complete) res(); else { img.onload = res; img.onerror = res; } })
  ));

  bakePhotoCellsForExport(clone);

  try {
    const canvas = await html2canvas(clone, {
      scale,
      useCORS: false,
      backgroundColor: null,
      logging: false,
      width: w,
      height: h
    });
    return canvas.toDataURL('image/png');
  } finally {
    document.body.removeChild(clone);
  }
}

export async function exportPNG() {
  if (!state.companies.some(c => c.blocks.length)) { alert("Сначала добавь хотя бы один блок."); return; }
  const pageList = buildPageList();
  if (!pageList.length) return;

  const btn = document.querySelector('.export-png');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Генерация...'; }
  setEditorLocked(true);

  try {
    // One page in the DOM at a time (see exportPDF) — bounded peak memory.
    const zip = new JSZip();
    for (let i = 0; i < pageList.length; i++) {
      if (btn) btn.textContent = `⏳ ${i + 1} / ${pageList.length}`;
      await renderExportPageHTML(pageList[i]);
      const page = document.querySelector('#preview .page');
      if (!page) continue;
      const dataUrl = await pageToDataUrl(page, 3);
      zip.file(`page-${String(i + 1).padStart(2, '0')}.png`, dataUrl.split(',')[1], { base64: true });
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'digest' + '-pages.zip';
    a.click();
  } catch(e) {
    console.error('PNG export error:', e);
    alert('Ошибка при генерации PNG. Проверь консоль.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🖼 Скачать PNG'; }
    setEditorLocked(false);
    renderPreview(); // restore the paginated on-screen view
  }
}

export function clearAll() {
  confirmClearCurrentProject();
}
