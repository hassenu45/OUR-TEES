const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const UPDATES_DIR = path.join(__dirname, 'public', 'updates');
const MANIFEST_PATH = path.join(UPDATES_DIR, 'manifest.json');

function getHash(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function deploy() {
  console.log('🚀 جاري تجهيز التحديث...');
  if (!fs.existsSync(UPDATES_DIR)) fs.mkdirSync(UPDATES_DIR, { recursive: true });

  let manifest = { version: '1.0.0', files: {} };
  if (fs.existsSync(MANIFEST_PATH)) {
    try { manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); } catch(e){}
  }

  const parts = manifest.version.split('.').map(Number);
  parts[2] = (parts[2] || 0) + 1;
  manifest.version = parts.join('.');

  console.log(`📦 الإصدار الجديد: ${manifest.version}`);

  const files = fs.readdirSync(UPDATES_DIR);
  manifest.files = {};
  files.forEach(file => {
    if (file !== 'manifest.json') {
      const filePath = path.join(UPDATES_DIR, file);
      if (fs.statSync(filePath).isFile()) manifest.files[file] = getHash(filePath);
    }
  });

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log('✅ تم تحديث manifest.json');

  try {
    console.log('📤 جاري الرفع على Railway...');
    execSync('git add .');
    execSync(`git commit -m "Update app v${manifest.version}" --no-verify`);
    execSync('git push');
    console.log('🎉 تم الرفع بنجاح!');
  } catch (err) {
    console.error('❌ خطأ بالرفع:', err.message);
  }
}

deploy();