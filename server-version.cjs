const fs = require('fs');
const path = require('path');

function readVersion() {
  try {
    const v = fs.readFileSync(path.join(__dirname, 'VERSION'), 'utf8').trim();
    if (v) return v;
  } catch (_e) {
    // ignore
  }
  try {
    return require('./package.json').version || '0.0.0';
  } catch (_e) {
    return '0.0.0';
  }
}

module.exports = { readVersion };