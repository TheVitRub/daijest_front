export const AMP_COMPANY_KEY = 'amp';
export const AMP_TYPE = 'amp';
export const AMP_DEFAULT_TITLE = 'АМП: ИТОГИ КВАРТАЛА';

export function createAmpPage(id) {
  return {
    id, type: AMP_TYPE, title: AMP_DEFAULT_TITLE, subtitle: '', collapsed: false,
    items: [{ kind: 'news', title: '', text: '', photos: [], photoLayout: 'bottom', photoRatio: '4/3' }],
    comment: '',
  };
}

// Loading, undo and company imports all keep AMP on one page. Append merges
// content into the existing page, preserving its heading and every item.
export function normalizeAmpPages(blocks) {
  const pages = Array.isArray(blocks) ? blocks.filter(block => block && typeof block === 'object') : [];
  if (!pages.length) return [];
  const first = pages[0];
  return [{
    ...first,
    id: first.id || 'amp-page', type: AMP_TYPE,
    title: typeof first.title === 'string' ? first.title : AMP_DEFAULT_TITLE,
    subtitle: typeof first.subtitle === 'string' ? first.subtitle : '',
    items: pages.flatMap(page => Array.isArray(page.items) ? page.items : []),
    comment: pages.map(page => typeof page.comment === 'string' ? page.comment : '').filter(Boolean).join('\n'),
  }];
}
