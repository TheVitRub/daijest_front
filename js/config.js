// ============================================================
//   CONFIG — constants and static lookups
// ============================================================
export const STORAGE_KEY = "digest-builder-draft-v2";
export const AUTH_TOKEN_KEY = "digest-builder-auth-token-v1";
export const CURRENT_DIGEST_KEY = "digest-builder-current-digest-v1";
export const AUTOSAVE_ENABLED_KEY = "digest-builder-autosave-enabled-v1";
export const PUBLIC_BASE_PATH =
  window.DJST_PUBLIC_BASE_PATH ||
  (window.location.pathname === "/daijest" || window.location.pathname.startsWith("/daijest/")
    ? "/daijest"
    : "");
export const API_BASE = window.DJST_API_BASE || `${PUBLIC_BASE_PATH}/api`;
export const AUTOSAVE_DELAY_MS = 5000;
export const HISTORY_LIMIT = 60;
export const ADMIN_USERS_PAGE_SIZE = 50;

export const COMPANIES = [
  { key: "volkov_z",  name: "Волков (Заринск)",         theme: "volkov",  color: "#f4a93d" },
  { key: "volkov_k",  name: "Волков (Кемерово)",         theme: "kalina",  color: "#d63031" },
  { key: "broiler",   name: "Кузбасский Бройлер (КУБ)", theme: "broiler", color: "#6fa86b" },
  { key: "retail",    name: "Розничная сеть (ФРС)",      theme: "tochka",  color: "#E51C4C" },
  { key: "vg",        name: "Волков групп",              theme: "zarinsk", color: "#c0392b" }
];

export const BLOCK_TYPES = [
  { key: "main",         label: "О главном" },
  { key: "products",     label: "Продукты" },
  { key: "people",       label: "О людях" },
  { key: "publicity",    label: "Публичность" },
  { key: "achievements", label: "Есть чем гордиться" }
];

export function getCompMeta(key) { return COMPANIES.find(c => c.key === key) || COMPANIES[0]; }
export function getBlockLabel(key) { return (BLOCK_TYPES.find(t => t.key === key) || {}).label || key; }

// Build the URL the browser uses to load a stored image by its media id.
export function mediaUrl(id) { return `${API_BASE}/media/${id}`; }

// Resolve any image reference to a browser-loadable src. New media-backed
// fields use { mediaId }; old saved projects may still contain direct strings.
export function imageSrc(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value.mediaId) return mediaUrl(value.mediaId);
  if (value.src) return imageSrc(value.src);
  return "";
}

// Resolve a photo entry to a displayable src. New entries are { mediaId, ratio };
// legacy shapes (plain data-URL string or { src }) are still tolerated.
export function photoSrc(p) {
  return imageSrc(p);
}
