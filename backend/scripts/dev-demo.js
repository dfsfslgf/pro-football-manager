import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * MySQL 설치 없이 바로 플레이할 수 있는 데모 모드. (npm run demo)
 * mysql-memory-server 로 임시 MySQL 을 띄우고 스키마/시드를 적용한 뒤 API 서버를 시작합니다.
 * 서버를 종료하면 데이터도 사라집니다. 최초 실행 시 MySQL 바이너리 다운로드로 시간이 걸릴 수 있습니다.
 * @returns {Promise<void>}
 */
async function main() {
  const { createDB } = await import('mysql-memory-server');
  console.log('[demo] 임시 MySQL 을 준비하는 중... (최초 실행 시 다운로드)');
  const db = await createDB({ logLevel: 'ERROR', version: '8.4.x' });

  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = String(db.port);
  process.env.DB_USER = db.username;
  process.env.DB_PASSWORD = '';
  process.env.DB_NAME = db.dbName;

  const mysql = (await import('mysql2/promise')).default;
  const connection = await mysql.createConnection({ host: '127.0.0.1', port: db.port, user: db.username, database: db.dbName, multipleStatements: true });
  await connection.query(readFileSync(fileURLToPath(new URL('../src/models/schema.sql', import.meta.url)), 'utf8'));
  await connection.end();

  const { start } = await import('../src/app.js');
  await start();

  const shutdown = async () => {
    await db.stop().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[demo] 실패:', err.message);
  process.exit(1);
});
