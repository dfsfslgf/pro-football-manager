import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { ensurePlayerMasterSeed } from '../src/models/seedData.js';

/**
 * schema.sql 을 적용하고 선수 마스터 시드를 삽입. (npm run db:init)
 * @returns {Promise<void>}
 */
async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pro_football_manager',
    multipleStatements: true,
  });
  await connection.query(readFileSync(fileURLToPath(new URL('../src/models/schema.sql', import.meta.url)), 'utf8'));
  const seeded = await ensurePlayerMasterSeed(connection);
  console.log(`스키마 적용 완료. 선수 마스터 시드: ${seeded}명 삽입`);
  await connection.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
