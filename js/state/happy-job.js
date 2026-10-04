// Happy Job pages always contain these two sections, in this order.
export const HAPPY_JOB_TYPE = 'happy_job';
export const HAPPY_JOB_SUMMARY = 'happy_job_summary';
export const HAPPY_JOB_TABLE = 'happy_job_table';

export function createHappyJobRow() {
  return { suggestion: '', action: '' };
}

export function createHappyJobItems() {
  return [
    {
      kind: HAPPY_JOB_SUMMARY, title: 'Happy Job - голос сотрудников',
      result: '', ideas: '', text: '', collapsed: false,
    },
    {
      kind: HAPPY_JOB_TABLE, title: '',
      suggestionTitle: 'Вы подсказали:', actionTitle: 'Мы сделали:',
      rows: [createHappyJobRow()], activeRowIdx: 0,
      photos: [], photoRatio: '4/3', caption: '', collapsed: false,
    },
  ];
}

// Used on every load/import, including undo and saved revisions. Empty rows
// are intentional; a missing section is restored without losing the other.
export function normalizeHappyJobBlock(block) {
  if (block?.type !== HAPPY_JOB_TYPE) return block;
  const existing = Array.isArray(block.items) ? block.items : [];
  const items = createHappyJobItems().map(defaults => ({
    ...defaults, ...existing.find(item => item?.kind === defaults.kind), kind: defaults.kind,
  }));
  for (const item of items) {
    const fields = item.kind === HAPPY_JOB_SUMMARY
      ? ['title', 'result', 'ideas', 'text']
      : ['title', 'suggestionTitle', 'actionTitle', 'caption'];
    for (const field of fields) {
      if (typeof item[field] !== 'string') item[field] = '';
    }
  }
  const table = items[1];
  table.rows = Array.isArray(table.rows)
    ? table.rows.filter(row => row && typeof row === 'object').map(row => ({
      suggestion: typeof row.suggestion === 'string' ? row.suggestion : '',
      action: typeof row.action === 'string' ? row.action : '',
    }))
    : [createHappyJobRow()];
  table.photos = Array.isArray(table.photos) ? table.photos.filter(photo => !photo?.uploading) : [];
  table.activeRowIdx = Math.max(0, Math.min(
    Number.isInteger(table.activeRowIdx) ? table.activeRowIdx : 0, table.rows.length - 1,
  ));
  return { ...block, items };
}
