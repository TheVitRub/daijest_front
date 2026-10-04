// This preference lasts only while the current page is loaded.
let skip = false;

export function shouldSkipContentDeleteConfirm() {
  return skip;
}

export function rememberContentDeletePreference() {
  skip = true;
}

export function resetContentDeletePreference() {
  skip = false;
}
