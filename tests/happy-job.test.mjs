import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { location: { pathname: '/' } };
globalThis.document = {
  baseURI: 'http://localhost/digest-builder.html',
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
};
globalThis.alert = () => {};
const { state, captureState, loadState, addBlock, addItem, removeItem, updateItemField,
  updateHappyJobRow, addHappyJobRow, removeHappyJobRow } = await import('../js/state/state.js');
const { HAPPY_JOB_TYPE, HAPPY_JOB_SUMMARY, HAPPY_JOB_TABLE, createHappyJobItems } = await import('../js/state/happy-job.js');
const { COMPANIES } = await import('../js/config.js');
const { g } = await import('../js/store.js');
const { blockEditorHTML, setActiveHappyJobRow, confirmRemoveHappyJobRow, loadItemPhotos } = await import('../js/view/editor.js');
const { pageBlock, buildPageDescriptors, buildPageList } = await import('../js/view/preview.js');
const { cloneBlocksWithFreshIds } = await import('../js/features/import-export.js');
const { onItemDragStart, onItemDrop } = await import('../js/dnd.js');
const { rememberSnapshot, undoAction, redoAction } = await import('../js/state/history.js');

function fixture() {
  Object.assign(g, { booting: true, authToken: '', currentDigestId: '', revisionPreview: null, confirmDialog: null });
  state.digestCover = '';
  state.companies = COMPANIES.map(meta => ({ key: meta.key, blocks: [], collapsed: false }));
  addBlock('volkov_k', HAPPY_JOB_TYPE);
  const block = state.companies[1].blocks[0];
  return { block, summary: block.items[0], table: block.items[1] };
}

test('ordinary companies can create multiple independent Happy Job pages with exactly two fixed sections', () => {
  fixture();
  for (const comp of state.companies) {
    if (COMPANIES.find(meta => meta.key === comp.key).singlePage) continue;
    addBlock(comp.key, HAPPY_JOB_TYPE);
    addBlock(comp.key, HAPPY_JOB_TYPE);
    const [a, b] = comp.blocks.slice(-2);
    assert.notEqual(a.id, b.id);
    assert.deepEqual(a.items.map(item => item.kind), [HAPPY_JOB_SUMMARY, HAPPY_JOB_TABLE]);
    a.items[1].rows[0].suggestion = 'Only this page';
    assert.equal(b.items[1].rows[0].suggestion, '');
    assert.match(pageBlock(comp.key, a), new RegExp(`theme-${COMPANIES.find(meta => meta.key === comp.key).theme}`));
    assert.match(pageBlock(comp.key, a), new RegExp(`logos/logo-${comp.key}\\.svg`));
  }
  const ids = buildPageDescriptors().filter(page => page.kind === 'block').map(page => page.blockId);
  assert.equal(ids.length, COMPANIES.filter(meta => !meta.singlePage).length * 2 + 1);
  assert.equal(new Set(ids).size, ids.length);
});

test('fixed sections cannot be removed, extended, retyped or dragged like ordinary items', () => {
  const { block } = fixture();
  const original = captureState();
  addItem('volkov_k', block.id, 'news');
  removeItem('volkov_k', block.id, 0);
  updateItemField('volkov_k', block.id, 1, 'kind', 'news');
  let prevented = false;
  onItemDragStart({ preventDefault: () => { prevented = true; } }, 'volkov_k', block.id, 0);
  assert.equal(prevented, true);
  onItemDrop({ stopPropagation() {} }, 'volkov_k', block.id, 1);
  assert.equal(captureState(), original);
  const html = blockEditorHTML('volkov_k', block);
  assert.equal((html.match(/class="item-block happy-job-editor-section"/g) || []).length, 2);
  assert.doesNotMatch(html, /confirmRemoveItem|data-act="addItem"|onItemDragStart|loadItemQr/);
  assert.match(html, /confirmRemoveBlock/);
  assert.match(html, /Заголовок страницы Happy Job/);
});

test('editing paired rows, switching tabs, deleting every row and adding again preserves table media', () => {
  const { block, table } = fixture();
  const photos = table.photos;
  for (let i = 0; i < 6; i++) addHappyJobRow('volkov_k', block.id);
  assert.equal(table.rows.length, 7);
  updateHappyJobRow('volkov_k', block.id, 2, 'suggestion', 'Suggestion 3');
  updateHappyJobRow('volkov_k', block.id, 2, 'action', 'Action 3');
  setActiveHappyJobRow('volkov_k', block.id, 2);
  assert.equal(table.activeRowIdx, 2);
  assert.match(blockEditorHTML('volkov_k', block), /Suggestion 3/);
  removeHappyJobRow('volkov_k', block.id, 0);
  assert.equal(table.activeRowIdx, 1);
  assert.deepEqual(table.rows[1], { suggestion: 'Suggestion 3', action: 'Action 3' });
  while (table.rows.length) removeHappyJobRow('volkov_k', block.id, 0);
  assert.equal(table.activeRowIdx, 0);
  assert.match(blockEditorHTML('volkov_k', block), /Добавьте строку/);
  assert.match(pageBlock('volkov_k', block, false), /<tbody><\/tbody>/);
  addHappyJobRow('volkov_k', block.id);
  assert.equal(table.rows.length, 1);
  assert.equal(table.photos, photos);
});

test('all editable headings, values, multiline pairs and more than four photos survive JSON and company copies', () => {
  const { block, summary, table } = fixture();
  Object.assign(summary, { title: 'Новый заголовок', result: 'Опрос марта: 43,1%', ideas: 'Идей: 271', text: 'Первый абзац\nВторой абзац' });
  Object.assign(table, {
    title: 'Изменения', suggestionTitle: 'Предложение', actionTitle: 'Результат', caption: 'Наш канал',
    rows: [{ suggestion: '<script> & "\nвторая строка', action: 'Первый результат\n• второй' }],
    photos: Array.from({ length: 6 }, (_, i) => ({ mediaId: `photo-${i}`, ratio: i === 2 ? '1/1' : '4/3' })),
  });
  const snapshot = captureState();
  state.companies = [];
  loadState(JSON.parse(snapshot));
  assert.equal(captureState(), snapshot);
  const copy = cloneBlocksWithFreshIds([block])[0];
  assert.notEqual(copy.id, block.id);
  assert.deepEqual(copy.items, block.items);
  copy.items[1].rows[0].action = 'Copy only';
  assert.notEqual(copy.items[1].rows[0].action, table.rows[0].action);
  const html = pageBlock('volkov_k', block, false);
  assert.match(html, /&lt;script&gt; &amp; &quot;<br>вторая строка/);
  assert.doesNotMatch(html, /<script>/);
  assert.equal((html.match(/<tbody><tr><td>/g) || []).length, 1);
  assert.equal((html.match(/loading="lazy"/g) || []).length, 6);
  assert.match(html, /Новый заголовок|Предложение|Результат/);
  const pages = buildPageList();
  assert.equal(pages.length, 3);
  assert.equal(pages[2], html);
});

test('loads restore missing or reordered fixed sections, retain intentional empty tables and leave old pages unchanged', () => {
  fixture();
  const [summary, table] = createHappyJobItems();
  table.rows = [];
  summary.result = 'Preserved';
  const legacy = { id: 'old', type: 'people', items: [{ kind: 'news', title: 'Existing news' }] };
  loadState({ companies: [{ key: 'volkov_k', blocks: [legacy,
    { id: 'reordered', type: HAPPY_JOB_TYPE, items: [table, summary] },
    { id: 'missing', type: HAPPY_JOB_TYPE, items: [summary] },
  ] }] });
  assert.equal(state.companies[0].blocks[0], legacy);
  const [, reordered, missing] = state.companies[0].blocks;
  assert.deepEqual(reordered.items.map(item => item.kind), [HAPPY_JOB_SUMMARY, HAPPY_JOB_TABLE]);
  assert.equal(reordered.items[0].result, 'Preserved');
  assert.deepEqual(reordered.items[1].rows, []);
  assert.equal(missing.items[1].rows.length, 1);
});

test('revision preview blocks table edits, tab changes, deletion and photo uploads', async () => {
  const { block } = fixture();
  const original = captureState();
  g.revisionPreview = { version: 1 };
  addHappyJobRow('volkov_k', block.id);
  removeHappyJobRow('volkov_k', block.id, 0);
  updateHappyJobRow('volkov_k', block.id, 0, 'action', 'Changed');
  updateItemField('volkov_k', block.id, 0, 'title', 'Changed');
  setActiveHappyJobRow('volkov_k', block.id, 0);
  confirmRemoveHappyJobRow('volkov_k', block.id, 0);
  await loadItemPhotos('volkov_k', block.id, 1, [new File(['x'], 'x.png', { type: 'image/png' })]);
  assert.equal(g.confirmDialog, null);
  assert.equal(captureState(), original);
  g.revisionPreview = null;
});

test('undo and redo restore the complete table including row count and attachments', () => {
  const { block, table } = fixture();
  table.photos = [{ mediaId: 'shared-photo', ratio: '1/1' }];
  const before = captureState();
  rememberSnapshot(before);
  addHappyJobRow('volkov_k', block.id);
  table.rows[1].action = 'New result';
  const after = captureState();
  rememberSnapshot(after);
  undoAction();
  assert.equal(captureState(), before);
  redoAction();
  assert.equal(captureState(), after);
});

test('PNG attachments use the normal photo list and upload losslessly; late uploads ignore switched projects', async t => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const { block, table } = fixture();
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]);
  const file = new File([bytes], 'qr.png', { type: 'image/png' });
  let uploaded;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/media');
    uploaded = options.body.get('file');
    return new Response(JSON.stringify({ id: 'qr-photo' }));
  };
  await loadItemPhotos('volkov_k', block.id, 1, [file]);
  assert.deepEqual(new Uint8Array(await uploaded.arrayBuffer()), bytes);
  assert.deepEqual(table.photos, [{ mediaId: 'qr-photo', ratio: '4/3' }]);
  assert.equal(table.qr, undefined);
  let complete;
  globalThis.fetch = () => new Promise(resolve => { complete = resolve; });
  const pending = loadItemPhotos('volkov_k', block.id, 1, [file]);
  g.currentDigestId = 'other-project';
  complete(new Response(JSON.stringify({ id: 'late-photo' })));
  await pending;
  assert.deepEqual(table.photos, [{ mediaId: 'qr-photo', ratio: '4/3' }]);
});
