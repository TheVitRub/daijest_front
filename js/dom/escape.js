// ============================================================
//   HTML escaping
// ============================================================
// NOTE: kept as-is from the monolith for Phase 2 (behaviour-preserving).
// Full escaping (& < > " ') lands in Phase 4.
export function escAttr(s) { return (s || "").replace(/"/g, "&quot;"); }
export function escText(s) { return (s || "").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
