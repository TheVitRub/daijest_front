import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { location: { pathname: '/' } };
globalThis.document = {
  baseURI: 'http://localhost/digest-builder.html',
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
};
globalThis.alert = () => {};

const { state, getComp, addBlock, addItem, removeBlock, updateBlockField, updateItemField,
  captureState, loadState, resetStateToInitial } = await import('../js/state/state.js');
const { AMP_DEFAULT_TITLE } = await import('../js/state/amp.js');
const { g } = await import('../js/store.js');
const { companyEditorHTML, itemEditorHTML, blockEditorHTML } = await import('../js/view/editor.js');
const { pageBlock, buildPageDescriptors, buildPageList } = await import('../js/view/preview.js');
const { applyCompanyImport } = await import('../js/features/import-export.js');
const { rememberSnapshot, undoAction, redoAction } = await import('../js/state/history.js');

function fixture() {
  Object.assign(g, { booting: true, authToken: '', currentDigestId: '', revisionPreview: null });
  resetStateToInitial();
  const company = getComp('amp');
  assert.match(companyEditorHTML(company), /Создать страницу АМП/);
  addBlock('amp', 'amp');
  return { company, block: company.blocks[0] };
}

test('AMP creates only one editable page, allows all ordinary items and can be recreated after deletion', () => {
  const { company, block } = fixture();
  assert.equal(block.type, 'amp');
  assert.equal(block.title, AMP_DEFAULT_TITLE);
  for (const type of ['amp', 'main', 'happy_job']) addBlock('amp', type);
  assert.equal(company.blocks.length, 1);
  addItem('amp', block.id, 'news');
  addItem('amp', block.id, 'metric');
  addItem('amp', block.id, 'tops');
  assert.deepEqual(block.items.map(item => item.kind), ['news', 'news', 'metric', 'tops']);
  const html = companyEditorHTML(company);
  assert.doesNotMatch(html, /Создать страницу|Добавить страницу|data-act="toggleAddMenu"/);
  assert.match(html, /data-act="addItem"/);
  assert.match(html, /Заголовок страницы/);
  assert.match(html, /Подзаголовок/);
  assert.match(html, /data-act="importCompanyJSON"/);
  removeBlock('amp', block.id);
  assert.equal(company.blocks.length, 0);
  addBlock('amp', 'amp');
  assert.equal(company.blocks.length, 1);
  assert.notEqual(company.blocks[0].id, block.id);
});

test('AMP news title and body have no character limits, while ordinary news retains 600', () => {
  const { block } = fixture();
  const title = 'Большой заголовок '.repeat(100);
  const text = 'Подробная новость '.repeat(350) + '\nКонец длинного текста';
  updateItemField('amp', block.id, 0, 'title', title);
  updateItemField('amp', block.id, 0, 'text', text);
  assert.equal(block.items[0].title, title);
  assert.equal(block.items[0].text, text);
  const html = itemEditorHTML('amp', block.id, block.items[0], 0);
  assert.doesNotMatch(html, /maxlength|data-max|data-counter|char-counter/);
  assert.match(html, /Конец длинного текста/);
  const ordinary = itemEditorHTML('volkov_kr', block.id, block.items[0], 0);
  assert.match(ordinary, /maxlength="600"/);
  assert.match(ordinary, /data-max="600"/);
});

test('AMP headings, multiline subtitle and long news render safely on one page without a divider', () => {
  const { block } = fixture();
  updateBlockField('amp', block.id, 'title', 'АМП: <итоги> "квартала"');
  updateBlockField('amp', block.id, 'subtitle', 'Первая строка\nВторая строка <script>');
  updateItemField('amp', block.id, 0, 'text', 'Полный текст '.repeat(100) + 'ПОСЛЕДНЯЯ СТРОКА');
  const html = pageBlock('amp', block);
  assert.match(html, /theme-amp amp-page/);
  assert.match(html, /logos\/logo-amp\.svg/);
  assert.match(html, /АМП: &lt;итоги&gt; &quot;квартала&quot;/);
  assert.match(html, /Первая строка<br>Вторая строка &lt;script&gt;/);
  assert.match(html, /ПОСЛЕДНЯЯ СТРОКА/);
  assert.doesNotMatch(html, /<script>/);
  assert.deepEqual(buildPageDescriptors().filter(page => page.compKey === 'amp').map(page => page.kind), ['block']);
  assert.equal(buildPageList().length, 2); // The digest's letter and AMP page.
  assert.match(buildPageList()[1], /ПОСЛЕДНЯЯ СТРОКА/);
  const editor = blockEditorHTML('amp', block);
  assert.match(editor, /value="АМП: &lt;итоги&gt; &quot;квартала&quot;"/);
  assert.doesNotMatch(editor, /data-draghandle="\.block-card"/);
});

test('AMP append and replace imports preserve contents while keeping exactly one page', () => {
  const { company, block } = fixture();
  block.title = 'Текущий квартал'; block.subtitle = 'Существующий подзаголовок';
  block.items[0].text = 'Исходная новость'; block.comment = 'Первый комментарий';
  const imported = {
    id: 'incoming', type: 'amp', title: 'Импортированный заголовок', subtitle: 'Другой подзаголовок',
    comment: 'Второй комментарий',
    items: [{ kind: 'news', title: 'Импорт', text: 'Длинный текст '.repeat(200), photos: [{ mediaId: 'photo', ratio: '4/3' }] },
      { kind: 'metric', tiles: [{ value: '120', label: 'Заказов' }] }],
  };
  const original = JSON.stringify(imported);
  const runImport = mode => {
    g.companyImportTargetKey = 'amp'; g.pendingCompanyImport = { blocks: [imported] }; applyCompanyImport(mode);
  };
  runImport('append');
  assert.equal(company.blocks.length, 1);
  const appended = company.blocks[0];
  assert.equal(appended.id, block.id);
  assert.equal(appended.title, 'Текущий квартал');
  assert.equal(appended.subtitle, 'Существующий подзаголовок');
  assert.equal(appended.items.length, 3);
  assert.equal(appended.comment, 'Первый комментарий\nВторой комментарий');
  assert.deepEqual(appended.items[1], imported.items[0]);
  assert.equal(JSON.stringify(imported), original);
  runImport('replace');
  assert.equal(company.blocks.length, 1);
  assert.equal(company.blocks[0].title, imported.title);
  assert.equal(company.blocks[0].subtitle, imported.subtitle);
  assert.deepEqual(company.blocks[0].items, imported.items);
  assert.notEqual(company.blocks[0].id, imported.id);
});

test('AMP consolidates saved pages without dropping items, and saved JSON loads identically', () => {
  fixture();
  const input = { companies: [{ key: 'amp', collapsed: false, blocks: [
    { id: 'amp-first', type: 'amp', title: '', subtitle: '', comment: 'Один', items: [{ kind: 'news', text: 'Первая' }] },
    { id: 'amp-second', type: 'amp', title: 'Второй', comment: 'Два', items: [{ kind: 'news', text: 'Вторая' }] },
  ] }] };
  const original = JSON.stringify(input);
  loadState(input);
  assert.equal(JSON.stringify(input), original);
  assert.equal(getComp('amp').blocks.length, 1);
  assert.equal(getComp('amp').blocks[0].title, '');
  assert.deepEqual(getComp('amp').blocks[0].items.map(item => item.text), ['Первая', 'Вторая']);
  assert.equal(getComp('amp').blocks[0].comment, 'Один\nДва');
  const snapshot = captureState();
  resetStateToInitial(); loadState(JSON.parse(snapshot));
  assert.equal(captureState(), snapshot);
});

test('AMP headings and unlimited news survive undo/redo and revision mode cannot change the heading', () => {
  const { block } = fixture();
  const before = captureState(); rememberSnapshot(before);
  updateBlockField('amp', block.id, 'title', 'АМП: третий квартал');
  updateBlockField('amp', block.id, 'subtitle', 'Команда продолжает работу');
  updateItemField('amp', block.id, 0, 'text', 'Новость '.repeat(500));
  const after = captureState(); rememberSnapshot(after);
  undoAction(); assert.equal(captureState(), before);
  redoAction(); assert.equal(captureState(), after);
  g.revisionPreview = { version: 1 };
  updateBlockField('amp', block.id, 'title', 'Нельзя менять');
  addBlock('amp', 'amp');
  assert.equal(captureState(), after);
  g.revisionPreview = null;
});
