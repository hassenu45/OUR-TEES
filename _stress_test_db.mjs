const Database = require('better-sqlite3');

console.log('=== Testing dev.db ===');
try {
  const db = new Database('dev.db');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log('Tables:', tables.map(t => t.name));
  const count = db.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table'").get();
  console.log('Table count:', count.c);
  
  for (const table of tables) {
    const rowCount = db.prepare(`SELECT count(*) as c FROM ${table.name}`).get();
    console.log(`Table "${table.name}": ${rowCount.c} rows`);
  }
  
  db.close();
  console.log('dev.db: OK');
} catch (e) {
  console.error('dev.db Error:', e.message);
}

console.log('\n=== Testing prisma/dev.db ===');
try {
  const db = new Database('prisma/dev.db');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log('Tables:', tables.map(t => t.name));
  const count = db.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table'").get();
  console.log('Table count:', count.c);
  
  for (const table of tables) {
    const rowCount = db.prepare(`SELECT count(*) as c FROM ${table.name}`).get();
    console.log(`Table "${table.name}": ${rowCount.c} rows`);
  }
  
  db.close();
  console.log('prisma/dev.db: OK');
} catch (e) {
  console.error('prisma/dev.db Error:', e.message);
}
