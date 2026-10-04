import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { location: { pathname: '/' } };
globalThis.document = {
  baseURI: 'http://localhost/digest-builder.html',
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
};
globalThis.alert = () => {};

const { COMPANIES, BLOCK_TYPES } = await import('../js/config.js');
const { state, loadState, captureState, resetStateToInitial, getComp, addBlock, addItem } = await import('../js/state/state.js');
const { g } = await import('../js/store.js');
const { companyEditorHTML } = await import('../js/view/editor.js');
const { pageBlock, buildPageDescriptors, buildPageList } = await import('../js/view/preview.js');
const { applyCompanyImport } = await import('../js/features/import-export.js');

test('older projects gain missing companies without losing content, saved order or collapsed flags', () => {
  const oldCompanies = COMPANIES.filter(company => !['volkov_kr', 'amp'].includes(company.key)).reverse()
    .map((company, i) => ({ key: company.key, collapsed: i !== 0, blocks: [{
      id: `old-${i}`, type: 'main', items: [{ kind: 'news', title: company.name, text: 'Сохранённый текст', photos: [] }],
    }] }));
  const input = { companies: oldCompanies };
  const original = JSON.stringify(input);
  loadState(input);
  assert.equal(JSON.stringify(input), original);
  assert.deepEqual(state.companies.slice(0, oldCompanies.length), oldCompanies);
  assert.deepEqual(getComp('volkov_kr'), { key: 'volkov_kr', collapsed: true, blocks: [] });
  assert.deepEqual(getComp('amp'), { key: 'amp', collapsed: true, blocks: [] });
  const migrated = captureState();
  loadState(JSON.parse(migrated));
  assert.equal(captureState(), migrated);
  assert.equal(state.companies.filter(company => company.key === 'volkov_kr').length, 1);
  loadState({ companies: [{ key: 'retail', blocks: [], collapsed: false }] });
  assert.equal(state.companies[0].key, 'retail');
  assert.deepEqual(new Set(state.companies.map(company => company.key)), new Set(COMPANIES.map(company => company.key)));
});

test('Krasnoyarsk supports all page types, news, tops, metrics, company import and project roundtrip', () => {
  Object.assign(g, { booting: true, authToken: '', currentDigestId: '', revisionPreview: null });
  resetStateToInitial();
  const company = getComp('volkov_kr');
  assert.ok(company);
  for (const type of BLOCK_TYPES) addBlock(company.key, type.key);
  const ordinary = company.blocks[0];
  ordinary.items[0].title = 'Новость Красноярска';
  addItem(company.key, ordinary.id, 'tops');
  addItem(company.key, ordinary.id, 'metric');
  assert.deepEqual(ordinary.items.map(item => item.kind), ['news', 'tops', 'metric']);
  assert.deepEqual(company.blocks.find(block => block.type === 'happy_job').items.map(item => item.kind),
    ['happy_job_summary', 'happy_job_table']);
  const html = companyEditorHTML(company);
  assert.match(html, /Волков \(Красноярск\)/);
  assert.match(html, /data-act="importCompanyJSON"/);
  assert.match(html, /data-act="exportCompanyJSON"/);
  for (const block of company.blocks) assert.match(pageBlock(company.key, block), /logos\/logo-volkov_kr\.svg/);
  assert.equal(buildPageDescriptors().filter(page => page.compKey === company.key).length, BLOCK_TYPES.length + 1);
  assert.equal(buildPageList().length, BLOCK_TYPES.length + 2);

  g.companyImportTargetKey = company.key;
  g.pendingCompanyImport = { blocks: [ordinary] };
  applyCompanyImport('append');
  const copy = company.blocks.at(-1);
  assert.notEqual(copy.id, ordinary.id);
  assert.deepEqual(copy.items, ordinary.items);
  assert.notEqual(copy.items, ordinary.items);
  const snapshot = captureState();
  resetStateToInitial();
  loadState(JSON.parse(snapshot));
  assert.equal(captureState(), snapshot);
  assert.ok(state.companies.filter(comp => comp.key !== company.key).every(comp => comp.blocks.length === 0));
});
