const Database = require('better-sqlite3');
const db = new Database('prisma/dev.db', { readonly: false });

// Update adminPassword in SiteSettings table
const stmt = db.prepare("UPDATE SiteSettings SET adminPassword = ? WHERE id = 1");
const result = stmt.run('2007127');
console.log(`Rows updated: ${result.changes}`);

db.close();