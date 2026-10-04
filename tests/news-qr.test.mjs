import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { location: { pathname: '/' } };
globalThis.document = { getElementById: () => null };
globalThis.Image = class { async decode() {} };
const alerts = [];
globalThis.alert = message => alerts.push(message);

const { state, captureState, loadState, updateItemField } = await import('../js/state/state.js');
const { g } = await import('../js/store.js');
const { newsItemHTML } = await import('../js/view/preview.js');
const { itemEditorHTML, loadItemQr, removeItemQr } = await import('../js/view/editor.js');
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const pngFile = () => new File([pngBytes], 'qr.png', { type: 'image/png' });
function fixture(layout = 'side') {
  const item = {
    kind: 'news', title: 'Новость', text: 'Текст', photoLayout: layout,
    photos: [{ mediaId: 'photo-a', ratio: '4/3' }, { mediaId: 'photo-b', ratio: '1/1' }],
    tiles: [{ value: '10', label: 'Продажи', direction: 'up' }],
  };
  const block = { id: 'qr-test', type: 'main', items: [item] };
  state.companies = [{ key: 'volkov_z', blocks: [block] }];
  Object.assign(g, { booting: true, authToken: '', currentDigestId: '', revisionPreview: null });
  alerts.length = 0;
  return { item, block };
}
const editorHTML = item => itemEditorHTML('volkov_z', 'qr-test', item, 0);
const loadQR = files => loadItemQr('volkov_z', 'qr-test', 0, files);
const successfulUpload = () => new Response(JSON.stringify({ id: 'qr-a' }), {
  headers: { 'Content-Type': 'application/json' },
});

test('QR overrides top/side layouts, with photos and metrics below the two cards', () => {
  for (const layout of ['top', 'side', 'bottom']) {
    const { item } = fixture(layout);
    item.qr = { mediaId: 'qr-a' };
    const html = newsItemHTML(item, 'qr-test-0');
    assert.match(html, /data-item-ref="qr-test-0"/);
    assert.match(html, /class="news-qr-card"/);
    assert.match(html, /src="\/api\/media\/qr-a"/);
    assert(html.indexOf('news-qr-card') < html.indexOf('pt-photos'));
    assert(html.indexOf('pt-photos') < html.indexOf('kpi-grid'));
    assert.doesNotMatch(html, /news-with-photo|side-photos/);
    assert.doesNotMatch(editorHTML(item), /class="layout-toggle"/);
    assert.match(editorHTML(item), /Заменить QR/);
  }
});

test('news without QR keeps its previous layout and shows the attachment control', () => {
  const { item } = fixture();
  assert.match(newsItemHTML(item), /news-with-photo/);
  assert.doesNotMatch(newsItemHTML(item), /news-qr-card/);
  assert.match(editorHTML(item), /Прикрепить QR/);
  assert.match(editorHTML(item), /class="layout-toggle"/);
});

test('removing QR leaves photos below, restores controls and preserves media/metrics', () => {
  const { item } = fixture('top');
  item.qr = { mediaId: 'qr-a' };
  const photos = item.photos;
  const tiles = item.tiles;
  updateItemField('volkov_z', 'qr-test', 0, 'photoLayout', 'side');
  assert.equal(item.photoLayout, 'top');
  removeItemQr('volkov_z', 'qr-test', 0);
  assert.equal(item.qr, undefined);
  assert.equal(item.photoLayout, 'bottom');
  assert.equal(item.photos, photos);
  assert.equal(item.tiles, tiles);
  assert.match(editorHTML(item), /class="layout-toggle"/);
  const html = newsItemHTML(item);
  assert(html.indexOf('ach-item') < html.indexOf('pt-photos'));
  updateItemField('volkov_z', 'qr-test', 0, 'photoLayout', 'side');
  assert.equal(item.photoLayout, 'side');
});

test('QR survives a document JSON round trip', () => {
  const { item } = fixture();
  item.qr = { mediaId: 'qr-a' };
  const snapshot = captureState();
  state.companies = [];
  loadState(JSON.parse(snapshot));
  assert.deepEqual(state.companies[0].blocks[0].items[0].qr, { mediaId: 'qr-a' });
  assert.match(newsItemHTML(state.companies[0].blocks[0].items[0]), /news-qr-card/);
});

test('upload sends PNG bytes unchanged and attaches one QR outside the photo list', async () => {
  const { item } = fixture();
  let uploaded;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/media');
    uploaded = options.body.get('file');
    return successfulUpload();
  };
  const input = { value: 'previous-file' };
  await loadItemQr('volkov_z', 'qr-test', 0, [pngFile()], input);
  assert.equal(input.value, '');
  assert.equal(uploaded.type, 'image/png');
  assert.deepEqual(new Uint8Array(await uploaded.arrayBuffer()), pngBytes);
  assert.deepEqual(item.qr, { mediaId: 'qr-a' });
  assert.equal(item.photos.length, 2);
  assert.equal(item.photoLayout, 'bottom');
  assert.equal(alerts.length, 0);
});

test('failed replacement and invalid input preserve the existing QR and layout', async t => {
  const logged = t.mock.method(console, 'error', () => {});
  const { item } = fixture('bottom');
  item.qr = { mediaId: 'old-qr' };
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Upload failed' }), { status: 500 });
  await loadQR([pngFile()]);
  assert.deepEqual(item.qr, { mediaId: 'old-qr' });
  assert.equal(item.photoLayout, 'bottom');
  let calls = 0;
  globalThis.fetch = async () => { calls++; return successfulUpload(); };
  await loadQR([new File(['not a PNG'], 'fake.png', { type: 'image/png' })]);
  assert.equal(calls, 0);
  assert.equal(alerts.length, 2);
  assert.equal(logged.mock.callCount(), 2);
  assert.match(editorHTML(item), /Заменить QR/);
});

test('upload follows the original item after reorder and ignores deleted or switched targets', async () => {
  for (const action of ['reorder', 'delete', 'switch', 'revision']) {
    const { item, block } = fixture();
    let resolveUpload;
    let notifyStarted;
    const started = new Promise(resolve => { notifyStarted = resolve; });
    globalThis.fetch = () => {
      notifyStarted();
      return new Promise(resolve => { resolveUpload = resolve; });
    };
    const pending = loadQR([pngFile()]);
    await started;
    const other = { kind: 'news', title: 'Other', photos: [] };
    if (action === 'reorder') block.items.unshift(other);
    if (action === 'delete') block.items.splice(0, 1, other);
    if (action === 'switch') g.currentDigestId = 'another-project';
    if (action === 'revision') g.revisionPreview = { version: 1 };
    resolveUpload(successfulUpload());
    await pending;
    assert.equal(other.qr, undefined);
    assert.equal(Boolean(item.qr), action === 'reorder');
  }
});
