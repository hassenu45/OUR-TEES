const path = require('path');
const fs = require('fs');

const SAFE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function isSafeUploadName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 120 && SAFE_NAME_RE.test(name);
}

function resolveUploadPath(uploadsDir, name) {
  if (!isSafeUploadName(name)) return null;
  const base = path.resolve(uploadsDir);
  const full = path.resolve(base, name);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

function deleteUploadedFile(uploadsDir, name) {
  const full = resolveUploadPath(uploadsDir, name);
  if (!full) return { deleted: false, reason: 'invalid-name' };
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return { deleted: false, reason: 'not-found' };
  fs.unlinkSync(full);
  return { deleted: true };
}

module.exports = { isSafeUploadName, resolveUploadPath, deleteUploadedFile };