import pg from "pg";

const { Pool } = pg;

let _pool;

export function getPool() {
  if (_pool) return _pool;

  const DB_URL = process.env.DB_URL;
  if (!DB_URL) {
    throw new Error("Missing DATABASE_URL");
  }

  _pool = new Pool({ DB_URL });

  return _pool;
}

export async function query(text, params) {
  const pool = getPool();
  return await pool.query(text, params);
}