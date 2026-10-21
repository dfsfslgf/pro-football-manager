import express from 'express';
import { fileURLToPath } from 'node:url';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import pool, { testConnection } from './config/database.js';
import { ensurePlayerMasterSeed } from './models/seedData.js';

/**
 * Express 앱을 구성합니다.
 * @returns {import('express').Express}
 */
export function createApp() {
  const app = express();
  app.use(express.json({ limit: '200kb' }));
  app.use('/api', routes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = createApp();

/**
 * DB 연결을 확인하고 선수 마스터 시드를 보장한 뒤 HTTP 서버를 시작합니다.
 * @returns {Promise<void>}
 */
export async function start() {
  const port = Number(process.env.PORT || 4000);
  try {
    await testConnection();
    console.log('[DB] MySQL 연결 성공');
    const seeded = await ensurePlayerMasterSeed(pool);
    if (seeded > 0) console.log(`[DB] player_master 시드 데이터 ${seeded}명 삽입`);
  } catch (err) {
    console.error('[DB] 초기화 실패:', err.message);
    console.error('     schema.sql 을 적용했는지 확인하세요. (npm run db:init)');
    process.exit(1);
  }
  app.listen(port, () => console.log(`[Server] http://localhost:${port}`));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}

export default app;
