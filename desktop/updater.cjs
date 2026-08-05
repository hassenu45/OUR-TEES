const crypto = require('crypto');
const fs = require('fs');

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_TOTAL_SIZE = 300 * 1024 * 1024;

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function diffManifests(localManifest, remoteManifest) {
  const remoteMap = new Map(
    (remoteManifest.files || []).map((f) => [f.path, f])
  );
  const localMap = new Map(
    (localManifest && localManifest.files ? localManifest.files : []).map((f) => [f.path, f])
  );
  const changed = [];
  for (const f of remoteMap.values()) {
    const old = localMap.get(f.path);
    if (!old || old.sha256 !== f.sha256) changed.push(f);
  }
  const removed = [];
  for (const p of localMap.keys()) if (!remoteMap.has(p)) removed.push(p);
  return { changed, removed };
}

module.exports = { hashFile, diffManifests, MAX_FILE_SIZE, MAX_TOTAL_SIZE };