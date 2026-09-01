const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const UPDATES_DIR = path.join(__dirname, 'public', 'updates');
const MANIFEST_PATH = path.join(UPDATES_DIR, 'manifest.json');
const DIST_DIR = path.join(__dirname, 'desktop', 'dist');

function getHash(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function findLatestInstaller() {
  // Look for .exe or .dmg files in dist directory
  const files = fs.readdirSync(DIST_DIR);
  const installerFiles = files.filter(f => f.endsWith('.exe') || f.endsWith('.dmg'));
  
  if (installerFiles.length === 0) return null;
  
  // Sort by version number in filename (e.g., AZMA-Settings-Setup-1.0.6.exe)
  const versionRegex = /(\d+\.\d+\.\d+)/;
  return installerFiles.sort((a, b) => {
    const av = a.match(versionRegex)?.[1] || '0.0.0';
    const bv = b.match(versionRegex)?.[1] || '0.0.0';
    return bv.localeCompare(av); // descending order
  })[0];
}

function deploy() {
  console.log('🚀 جاري تجهيز التحديث...');
  
  // Ensure directories exist
  if (!fs.existsSync(UPDATES_DIR)) fs.mkdirSync(UPDATES_DIR, { recursive: true });

  let manifest = { version: '1.0.0', files: {} };
  if (fs.existsSync(MANIFEST_PATH)) {
    try { manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); } catch(e){}
  }

  // Find and copy latest installer
  const latestInstaller = findLatestInstaller();
  if (latestInstaller) {
    const installerSrc = path.join(DIST_DIR, latestInstaller);
    const installerDest = path.join(UPDATES_DIR, latestInstaller);
    
    if (fs.existsSync(installerSrc)) {
      fs.copyFileSync(installerSrc, installerDest);
      console.log(`📦 gefunden Installer: ${latestInstaller}`);
    }
  }

  // Increment version
  const parts = manifest.version.split('.').map(Number);
  parts[2] = (parts[2] || 0) + 1;
  manifest.version = parts.join('.');

  console.log(`📦 الإصدار الجديد: ${manifest.version}`);

  // Build manifest files - include web files and installer
  manifest.files = {};
  
  // Add installer hash if exists
  if (latestInstaller && fs.existsSync(path.join(UPDATES_DIR, latestInstaller))) {
    const installerPath = path.join(UPDATES_DIR, latestInstaller);
    manifest.files[latestInstaller] = getHash(installerPath);
    manifest.installer = {
      filename: latestInstaller,
      url: `/updates/${latestInstaller}`,
      sha256: manifest.files[latestInstaller]
    };
  }

  // Add web files from updates directory (if any)
  const updatesFiles = fs.readdirSync(UPDATES_DIR);
  updatesFiles.forEach(file => {
    if (file !== 'manifest.json' && file !== latestInstaller) {
      const filePath = path.join(UPDATES_DIR, file);
      if (fs.statSync(filePath).isFile()) {
        manifest.files[file] = getHash(filePath);
      }
    }
  });

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log('✅ تم تحديث manifest.json');

  try {
    console.log('📤 جاري الرفع على Railway...');
    execSync('git add .');
    execSync(`git commit -m "Update app v${manifest.version}" --no-verify`);
    execSync('git push origin HEAD');
    console.log('🎉 تم الرفع بنجاح!');
  } catch (err) {
    console.error('❌ خطأ بالرفع:', err.message);
  }
}

deploy();