import { API_BASE, imageSrc } from '../config.js';
import { g } from '../store.js';

export async function downloadImage(value, name = 'image', button) {
  const src = imageSrc(value);
  if (!src || button?.dataset.downloading) return;
  if (button) {
    button.dataset.downloading = 'true';
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
  }
  try {
    const url = new URL(src, document.baseURI);
    const api = new URL(API_BASE + '/media/', document.baseURI);
    const headers = {};
    if (g.authToken && url.origin === api.origin && url.pathname.startsWith(api.pathname)) {
      headers.Authorization = 'Bearer ' + g.authToken;
    }
    const response = await fetch(url.href, { headers });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const blob = await response.blob();
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
      'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif' }[blob.type.split(';')[0]];
    if (!extension) throw new Error('Не удалось определить формат изображения.');
    const objectURL = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectURL;
    link.download = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') + '.' + extension;
    document.body.appendChild(link);
    try { link.click(); } finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
    }
  } catch (err) {
    console.error('Image download failed:', err);
    alert('Не удалось скачать изображение. Попробуйте ещё раз.');
  } finally {
    if (button) {
      delete button.dataset.downloading;
      button.disabled = !!g.revisionPreview;
      button.removeAttribute('aria-busy');
    }
  }
}
