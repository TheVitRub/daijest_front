import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { location: { pathname: '/' } };
globalThis.document = { getElementById: () => null };
const { state } = await import('../js/state/state.js');
const { g } = await import('../js/store.js');
const { toggleBlockItemsCollapse, blockEditorHTML } = await import('../js/view/editor.js');
const { pageBlock } = await import('../js/view/preview.js');

function fixture() {
  const news = [{ kind: 'news', title: 'Первая', text: 'Текст' }, { kind: 'news', title: 'Вторая', collapsed: true }];
  const tops = { kind: 'tops', columns: [], collapsed: false };
  const metric = { kind: 'metric', tiles: [], collapsed: true };
  const block = { id: 'one', type: 'main', items: [...news, tops, metric] };
  const other = { id: 'two', type: 'people', items: [{ kind: 'news', title: 'Другая', collapsed: false }] };
  state.companies = [{ key: 'volkov_z', blocks: [block, other] }];
  g.revisionPreview = null;
  return { block, news, tops, metric, other };
}

test('news, tops and metrics collapse and expand together only in the selected block', () => {
  const { block, news, tops, metric, other } = fixture();
  const preview = pageBlock('volkov_z', block);
  assert.match(blockEditorHTML('volkov_z', block), /title="Свернуть все новости"/);
  toggleBlockItemsCollapse('volkov_z', 'one');
  assert(news.every(item => item.collapsed));
  assert.equal(tops.collapsed, true);
  assert.equal(metric.collapsed, true);
  assert.equal(other.items[0].collapsed, false);
  assert.equal(block.collapsed, undefined);
  assert.equal(pageBlock('volkov_z', block), preview);
  assert.match(blockEditorHTML('volkov_z', block), /title="Развернуть все новости"/);
  toggleBlockItemsCollapse('volkov_z', 'one');
  assert(block.items.every(item => item.collapsed === false));
  assert.equal(pageBlock('volkov_z', block), preview);
});

test('empty blocks hide the button and tolerate the action', () => {
  const { block } = fixture();
  block.items = [];
  assert.doesNotMatch(blockEditorHTML('volkov_z', block), /data-act="toggleBlockItemsCollapse"/);
  const snapshot = JSON.stringify(block);
  toggleBlockItemsCollapse('volkov_z', 'one');
  toggleBlockItemsCollapse('volkov_z', 'missing');
  assert.equal(JSON.stringify(block), snapshot);
});

test('revision preview cannot change news collapse state', () => {
  const { block } = fixture();
  g.revisionPreview = { version: 1 };
  const snapshot = JSON.stringify(block);
  toggleBlockItemsCollapse('volkov_z', 'one');
  assert.equal(JSON.stringify(block), snapshot);
  g.revisionPreview = null;
});

test('blocks containing only tops and metrics still have the toggle', () => {
  const { block } = fixture();
  block.items = block.items.filter(item => item.kind !== 'news');
  assert.match(blockEditorHTML('volkov_z', block), /data-act="toggleBlockItemsCollapse"/);
  toggleBlockItemsCollapse('volkov_z', 'one');
  assert(block.items.every(item => item.collapsed));
  toggleBlockItemsCollapse('volkov_z', 'one');
  assert(block.items.every(item => item.collapsed === false));
});
