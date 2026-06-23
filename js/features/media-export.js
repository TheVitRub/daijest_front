// ============================================================
//   MEDIA EXPORT — PNG / PDF (logic unchanged from monolith)
// ============================================================
import { state } from "../state/state.js";
import { confirmClearCurrentProject } from "./projects.js";

export async function exportPDF() {
  if (!state.companies.some(c => c.blocks.length)) { alert("Сначала добавь хотя бы один блок."); return; }
  const pages = Array.from(document.querySelectorAll('#preview .page'));
  if (!pages.length) return;

  const jspdfNS = window.jspdf;
  if (!jspdfNS || !jspdfNS.jsPDF) { alert('Библиотека jsPDF не загружена.'); return; }
  const { jsPDF } = jspdfNS;

  const btn = document.querySelector('button.export-pdf');
  const titleEl = btn ? btn.querySelector('.ec-title') : null;
  const restore = titleEl ? titleEl.textContent : '';
  if (btn) btn.disabled = true;

  try {
    // Reuse the exact PNG export pipeline (pageToDataUrl @ scale 3) so PDF and
    // PNG render through one engine and look identical. Each digest page keeps
    // its own pixel size as a separate PDF page.
    let doc = null;
    for (let i = 0; i < pages.length; i++) {
      if (titleEl) titleEl.textContent = `Генерация ${i + 1} / ${pages.length}`;
      const page = pages[i];
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
    doc.save('digest.pdf');
  } catch (e) {
    console.error('PDF export error:', e);
    alert('Ошибка при генерации PDF. Проверь консоль.');
  } finally {
    if (titleEl) titleEl.textContent = restore || 'Скачать PDF';
    if (btn) btn.disabled = false;
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

export async function pageToDataUrl(page, scale) {
  const w = page.offsetWidth;
  const h = page.scrollHeight;

  const clone = page.cloneNode(true);
  clone.style.cssText = `position:fixed;top:-99999px;left:0;width:${w}px;margin:0;box-sizing:border-box;`;
  await inlineSvgImagesForExport(clone);

  document.body.appendChild(clone);

  await Promise.all(Array.from(clone.querySelectorAll('img')).map(img =>
    new Promise(res => { if (img.complete) res(); else { img.onload = res; img.onerror = res; } })
  ));

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
  const pages = Array.from(document.querySelectorAll('#preview .page'));
  if (!pages.length) return;

  const btn = document.querySelector('.export-png');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Генерация...'; }

  try {
    const zip = new JSZip();
    for (let i = 0; i < pages.length; i++) {
      if (btn) btn.textContent = `⏳ ${i + 1} / ${pages.length}`;
      const dataUrl = await pageToDataUrl(pages[i], 3);
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
  }
}

export function clearAll() {
  confirmClearCurrentProject();
}
