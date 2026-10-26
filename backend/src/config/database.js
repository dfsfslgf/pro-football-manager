import 'dotenv/config';
import mysql from 'mysql2/promise';

/**
 * MySQL 커넥션 풀.
 * @type {import('mysql2/promise').Pool}
 */
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD ?? 'test123!',
  database: process.env.DB_NAME || 'pro_football_manager',
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  supportBigNumbers: true,
  bigNumberStrings: false,
});

/**
 * 풀에서 커넥션을 하나 획득해 ping 으로 DB 연결 상태를 검증.
 * @returns {Promise<boolean>} 연결에 성공하면 true (실패 시 예외 전파)
 */
export async function testConnection() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    return true;
  } finally {
    conn.release();
  }
}

export default pool;
