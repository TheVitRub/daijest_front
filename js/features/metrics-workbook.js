// XLSX format shared by the downloadable template and the importer.
export const METRIC_HEADERS = ['Значение', 'Подпись', 'Динамика', 'Оценка'];
export const METRIC_RATINGS = {
  'Рост — хорошо': 'up',
  'Рост — плохо': 'up-bad',
  'Снижение — хорошо': 'down-good',
  'Снижение — плохо': 'down',
  'Нейтрально': 'none',
};
export const MAX_METRIC_ROWS = 500;

export async function buildMetricsTemplate(XLSX, JSZip, title = '') {
  const book = createMetricsWorkbook(XLSX, title);
  const zip = await JSZip.loadAsync(XLSX.write(book, { type: 'array', bookType: 'xlsx' }));
  const path = 'xl/worksheets/sheet1.xml';
  const xml = await zip.file(path).async('string');
  const choices = Object.keys(METRIC_RATINGS).join(',');
  const validation = `<dataValidations count="1"><dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Выберите оценку" error="Используйте вариант из списка" sqref="D4:D503"><formula1>"${choices}"</formula1></dataValidation></dataValidations>`;
  // SpreadsheetML requires mergeCells BEFORE dataValidations, and ignoredErrors AFTER.
  const anchor = xml.includes('</mergeCells>') ? '</mergeCells>' : '</sheetData>';
  zip.file(path, xml.replace(anchor, anchor + validation));
  return zip.generateAsync({ type: 'uint8array' });
}

export function createMetricsWorkbook(XLSX, title = '') {
  const book = XLSX.utils.book_new();
  const rows = [['Заголовок метрик'], [title], METRIC_HEADERS];
  // Text cells preserve commas, units and leading zeroes as entered.
  for (let i = 0; i < MAX_METRIC_ROWS; i++) rows.push(['', '', '', '']);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
  ];
  sheet.A2.z = '@';
  for (let r = 3; r < rows.length; r++) {
    for (let c = 0; c < 4; c++) sheet[XLSX.utils.encode_cell({ r, c })].z = '@';
  }
  sheet['!cols'] = [{ wch: 26 }, { wch: 42 }, { wch: 22 }, { wch: 26 }];
  XLSX.utils.book_append_sheet(book, sheet, 'Метрики');
  const help = XLSX.utils.aoa_to_sheet([
    ['Как заполнить шаблон'],
    ['Напишите заголовок во второй строке, под надписью «Заголовок метрик». Можно оставить пустым.'],
    ['Названия столбцов в строке 3 не меняйте. Сами метрики заполняйте начиная со строки 4.'],
    ['Одна строка — одна плитка. Значение и подпись обязательны. Пустые строки пропускаются.'],
    ['Выберите оценку из списка. Пустая оценка означает «Нейтрально».'],
    ['Для точного вида вводите значения текстом: 150,8 млн ₽, 0012, +12%.'],
    ['Формулы: пересчитайте и сохраните файл в Excel перед загрузкой.'],
    ['При добавлении заголовок текущего блока сохраняется; при замене берётся из второй строки.'],
    ['Примеры (не импортируются):'], METRIC_HEADERS,
    ['150,8 млн ₽', 'Выручка', '+12%', 'Рост — хорошо'],
    ['42 млн ₽', 'Расходы', '−5%', 'Снижение — хорошо'],
    ['320', 'Сотрудников', '', 'Нейтрально'],
  ]);
  help['!cols'] = [{ wch: 100 }, { wch: 35 }, { wch: 22 }, { wch: 26 }];
  XLSX.utils.book_append_sheet(book, help, 'Инструкция');
  return book;
}

export function parseMetricsWorkbook(XLSX, book) {
  const sheet = book.Sheets['Метрики'];
  if (!sheet) throw new Error('Не найден лист «Метрики». Скачайте шаблон и заполните его.');
  const text = (r, c) => {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
    if (!cell) return '';
    if (cell.t === 'e' || (cell.f && cell.v == null)) {
      throw new Error(`Строка ${r + 1}: ошибка или непересчитанная формула. Пересчитайте файл в Excel и сохраните.`);
    }
    return String(XLSX.utils.format_cell(cell) ?? '').trim();
  };
  const legacy = text(0, 0) === 'Заголовок блока';
  if ((!legacy && text(0, 0) !== 'Заголовок метрик') || METRIC_HEADERS.some((h, c) => text(2, c) !== h)) {
    throw new Error('Структура таблицы изменена. Используйте заголовки и порядок столбцов из шаблона.');
  }
  const title = legacy ? text(0, 1) : text(1, 0);
  if (title.length > 120) throw new Error('Заголовок метрик должен быть не длиннее 120 символов.');
  const end = XLSX.utils.decode_range(sheet['!ref'] || 'A1').e.r;
  if (end > 10000) throw new Error('Слишком большая таблица. Оставьте только строки с метриками.');
  const tiles = [];
  for (let r = 3; r <= end; r++) {
    const [value, label, delta, rating] = METRIC_HEADERS.map((_, c) => text(r, c));
    if (![value, label, delta, rating].some(Boolean)) continue;
    if (!value || !label) throw new Error(`Строка ${r + 1}: заполните значение и подпись.`);
    const direction = rating ? METRIC_RATINGS[rating] : 'none';
    if (!Object.hasOwn(METRIC_RATINGS, rating) && rating) {
      throw new Error(`Строка ${r + 1}: неизвестная оценка «${rating}». Выберите вариант из списка.`);
    }
    tiles.push({ value, label, delta, direction });
    if (tiles.length > MAX_METRIC_ROWS) throw new Error(`Можно загрузить не более ${MAX_METRIC_ROWS} метрик за раз.`);
  }
  if (!tiles.length) throw new Error('В файле нет метрик. Заполните строки на листе «Метрики».');
  return { title, tiles };
}
