// ============================================================
//   API — authenticated JSON requests
// ============================================================
import { API_BASE } from "./config.js";
import { g } from "./store.js";

export async function apiRequest(path, options = {}) {
  const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
  if (g.authToken) headers.Authorization = "Bearer " + g.authToken;
  const res = await fetch(API_BASE + path, Object.assign({}, options, { headers }));
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
  return data;
}
