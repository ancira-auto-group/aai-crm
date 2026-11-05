import { HttpError } from './http.js';

export const EXTENSION_VERSION_HEADER = 'x-aai-extension-version';

function parse(version) {
  const parts = String(version || '').split('.').map(Number);
  return parts.length === 3 && parts.every(Number.isInteger) ? parts : null;
}

/** -1, 0 or 1, like a sort comparator; null if either side isn't MAJOR.MINOR.PATCH */
export function compareVersions(a, b) {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) {
    return null;
  }
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) {
      return pa[i] < pb[i] ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Reject requests from extension builds older than MIN_EXTENSION_VERSION (if set).
 * Requests without the header (the admin page, scripts) are not affected.
 */
export function checkExtensionVersion(request) {
  const minimum = process.env.MIN_EXTENSION_VERSION;
  const version = request.headers.get(EXTENSION_VERSION_HEADER);
  if (!minimum || !version) {
    return;
  }
  if (compareVersions(version, minimum) === -1) {
    throw new HttpError(
      426,
      `This version of the extension (${version}) is out of date. Please update to ${minimum} or later.`,
      'update_required'
    );
  }
}
