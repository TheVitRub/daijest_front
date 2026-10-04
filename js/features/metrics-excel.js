import { g } from '../store.js';
import { state, getBlock, getTiles, captureState, projectTitle } from '../state/state.js';
import { apiRequest } from '../api.js';
import { render, afterStateChanged } from '../render.js';
import { saveLocalDraft } from '../storage.js';
import { openConfirmDialog } from './projects.js';
import { buildMetricsTemplate, parseMetricsWorkbook } from './metrics-workbook.js';

let libraryPromise;
function loadExcel() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!libraryPromise) libraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('../vendor/xlsx.full.min.js', import.meta.url).href;
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => {
      script.remove();
      libraryPromise = null;
      reject(new Error('Не удалось загрузить модуль Excel. Попробуйте ещё раз.'));
    };
    document.head.appendChild(script);
  });
  return libraryPromise;
}

export async function downloadMetricsTemplate(compKey, blockId, idx) {
  const item = getBlock(compKey, blockId)?.items[idx];
  const title = item?.kind === 'metric' ? item.title || '' : '';
  try {
    const XLSX = await loadExcel();
    const bytes = await buildMetricsTemplate(XLSX, window.JSZip, title);
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Шаблон метрик.xlsx';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) { alert(err.message || 'Не удалось скачать шаблон.'); }
}

export function uploadMetricsExcel(compKey, blockId, idx) {
  if (g.revisionPreview) return;
  const item = getBlock(compKey, blockId)?.items[idx];
  if (!item || !['metric', 'news'].includes(item.kind)) return;
  const target = { compKey, blockId, item, projectId: g.currentDigestId, token: g.authToken };
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx';
  input.addEventListener('change', () => {
    if (input.files[0]) readMetricsFile(input.files[0], target);
  }, { once: true });
  input.click();
}

function checkTarget(target) {
  if (g.revisionPreview || g.currentDigestId !== target.projectId || g.authToken !== target.token ||
      !getBlock(target.compKey, target.blockId)?.items.includes(target.item)) {
    throw new Error('Проект или блок изменился. Загрузите файл заново в нужный блок.');
  }
}

async function readMetricsFile(file, target) {
  try {
    if (!/\.xlsx$/i.test(file.name)) throw new Error('Выберите файл Excel в формате .xlsx.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Файл должен быть не больше 5 МБ.');
    const XLSX = await loadExcel();
    const buffer = await file.arrayBuffer();
    const signature = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
    if (signature[0] !== 80 || signature[1] !== 75) throw new Error('Это не файл .xlsx. Сохраните таблицу в формате Excel.');
    let book;
    try { book = XLSX.read(buffer, { type: 'array', cellStyles: false, cellHTML: false }); }
    catch (_) { throw new Error('Не удалось прочитать Excel. Проверьте файл и снимите защиту паролем.'); }
    const imported = parseMetricsWorkbook(XLSX, book);
    checkTarget(target);
    openConfirmDialog({
      title: `Найдено метрик: ${imported.tiles.length}`,
      message: target.item.kind === 'news'
        ? 'Добавить — сохранить текущие метрики и добавить новые. Заменить — загрузить метрики из файла. Заголовок, текст и фотографии новости сохранятся. Перед заменой сохраним резервную версию.'
        : 'Добавить — сохранить текущие плитки и заголовок. Заменить — загрузить плитки и заголовок из файла. Перед заменой сохраним резервную версию.',
      metricPreview: imported,
      actions: [
        { text: 'Добавить', className: 'primary-action', onConfirm: () => applyMetrics(target, imported, false) },
        { text: 'Заменить', className: 'danger-action', onConfirm: () => applyMetrics(target, imported, true) },
      ],
    });
  } catch (err) { alert(err.message || 'Не удалось загрузить метрики.'); }
}

async function applyMetrics(target, imported, replace) {
  try {
    checkTarget(target);
    if (replace) {
      if (!g.authToken || !g.currentDigestId) throw new Error('Для резервной версии сначала сохраните проект и войдите в аккаунт.');
      if (g.savingRemote) throw new Error('Дождитесь завершения сохранения и загрузите файл снова.');
      const snapshot = captureState();
      await apiRequest('/digests/' + target.projectId + '/autosave', {
        method: 'PUT',
        body: JSON.stringify({ title: projectTitle(), state, action: 'backup before metrics import' }),
      });
      checkTarget(target);
      if (captureState() !== snapshot) throw new Error('Во время сохранения данные изменились. Повторите импорт.');
    }
    const item = target.item;
    const previous = replace ? [] : item.kind === 'news' ? item.tiles || [] : getTiles(item);
    item.tiles = [...previous, ...imported.tiles.map(tile => ({ ...tile }))];
    item.activeTileIdx = previous.length;
    if (replace && item.kind === 'metric') item.title = imported.title;
    render(false);
    saveLocalDraft();
    afterStateChanged('metrics excel import');
  } catch (err) { alert('Метрики не импортированы. ' + (err.message || 'Не удалось сохранить резервную версию.')); }
}
