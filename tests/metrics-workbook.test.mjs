import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { buildMetricsTemplate, createMetricsWorkbook, parseMetricsWorkbook } from '../js/features/metrics-workbook.js';
const JSZip = createRequire(import.meta.url)('../jszip.min.js');

const context = vm.createContext({ console, TextDecoder, TextEncoder, ArrayBuffer, Uint8Array });
vm.runInContext(fs.readFileSync(new URL('../js/vendor/xlsx.full.min.js', import.meta.url), 'utf8'), context);
const XLSX = context.XLSX;
test('downloaded XLSX places dropdown validation after merged cells and preserves title', async () => {
  const bytes = await buildMetricsTemplate(XLSX, JSZip, 'Итоги сентября');
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert(xml.indexOf('</mergeCells>') < xml.indexOf('<dataValidations'));
  assert(xml.indexOf('</dataValidations>') < xml.indexOf('<ignoredErrors>'));
  const book = XLSX.read(bytes, { type: 'array' });
  assert.equal(book.Sheets['Метрики'].A2.v, 'Итоги сентября');
  assert.equal(book.Sheets['Метрики']['!merges'].length, 2);
});
function filled() {
  const book = createMetricsWorkbook(XLSX, 'Итоги');
  XLSX.utils.sheet_add_aoa(book.Sheets['Метрики'], [
    ['0012', 'Выручка', '+12%', 'Рост — хорошо'],
    [],
    ['42,5 млн ₽', 'Расходы', '−5%', 'Снижение — хорошо'],
    [0, 'Остаток', '', ''],
  ], { origin: 'A4' });
  return book;
}

test('real XLSX round trip preserves text, zeroes, ratings and skips blank rows', () => {
  const bytes = XLSX.write(filled(), { type: 'array', bookType: 'xlsx' });
  const result = parseMetricsWorkbook(XLSX, XLSX.read(bytes, { type: 'array' }));
  assert.equal(result.title, 'Итоги');
  assert.deepEqual(result.tiles, [
    { value: '0012', label: 'Выручка', delta: '+12%', direction: 'up' },
    { value: '42,5 млн ₽', label: 'Расходы', delta: '−5%', direction: 'down-good' },
    { value: '0', label: 'Остаток', delta: '', direction: 'none' },
  ]);
});
test('formatted percentage and cached formula result are imported as displayed text', () => {
  const book = filled();
  book.Sheets['Метрики'].A4 = { t: 'n', v: 0.125, z: '0.0%' };
  book.Sheets['Метрики'].C4 = { t: 'n', f: '1+1', v: 2 };
  const result = parseMetricsWorkbook(XLSX, book);
  assert.equal(result.tiles[0].value, '12.5%');
  assert.equal(result.tiles[0].delta, '2');
});
test('empty template does not import examples from the instruction sheet', () => {
  assert.throws(() => parseMetricsWorkbook(XLSX, createMetricsWorkbook(XLSX)), /нет метрик/);
});
test('title entered below its label survives XLSX round trip, including an empty title', () => {
  for (const title of ['Итоги сентября', '']) {
    const book = filled();
    assert.equal(book.Sheets['Метрики'].A1.v, 'Заголовок метрик');
    assert.equal(book.Sheets['Метрики'].B1, undefined);
    book.Sheets['Метрики'].A2 = { t: 's', v: title };
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
    assert.equal(parseMetricsWorkbook(XLSX, XLSX.read(bytes, { type: 'array' })).title, title);
  }
});
test('previously downloaded templates remain readable', () => {
  const book = filled();
  book.Sheets['Метрики'].A1 = { t: 's', v: 'Заголовок блока' };
  book.Sheets['Метрики'].B1 = { t: 's', v: 'Старый шаблон' };
  assert.equal(parseMetricsWorkbook(XLSX, book).title, 'Старый шаблон');
});
test('invalid rows, ratings, headers and uncached formulas reject the whole import', () => {
  for (const [address, cell, pattern] of [
    ['B4', { t: 's', v: '' }, /Строка 4/],
    ['D4', { t: 's', v: 'constructor' }, /неизвестная оценка/],
    ['A3', { t: 's', v: 'Other' }, /Структура/],
    ['A4', { t: 'n', f: '1+1' }, /формула/],
    ['A4', { t: 'e', v: 7 }, /ошибка/],
  ]) {
    const book = filled();
    book.Sheets['Метрики'][address] = cell;
    assert.throws(() => parseMetricsWorkbook(XLSX, book), pattern);
  }
});
