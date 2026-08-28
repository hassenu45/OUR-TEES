import { createClient } from '@libsql/client';
import { join } from 'path';
import { cwd } from 'process';

const dbPath = join(cwd(), 'prisma', 'dev.db');
console.log('DB path:', dbPath);

const client = createClient({ url: 'file:' + dbPath });

const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
console.log('Tables:', JSON.stringify(tables.rows));

const count = await client.execute("SELECT count(*) as c FROM sqlite_master WHERE type='table'");
console.log('Table count:', count.rows[0].c);
