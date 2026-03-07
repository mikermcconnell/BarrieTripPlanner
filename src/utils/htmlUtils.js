/**
 * Escape text so it can be safely embedded into HTML templates.
 * This is only for text nodes/attribute fragments, not full HTML sanitization.
 *
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
export const escapeHtml = (value) => {
  const text = value == null ? '' : String(value);

  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};
