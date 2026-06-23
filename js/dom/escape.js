// ============================================================
//   HTML escaping
// ============================================================
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// Escapes the five HTML-significant characters. Safe for both text content and
// (single- or double-quoted) attribute values.
export function escapeHtml(s) {
  return (s == null ? "" : String(s)).replace(/[&<>"']/g, (c) => ESC[c]);
}

// Kept as named aliases so existing call sites read naturally.
export const escAttr = escapeHtml;
export const escText = escapeHtml;
