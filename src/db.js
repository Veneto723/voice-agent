import pg from "pg";

const { Pool } = pg;

let _pool;

export function getPool() {
  if (_pool) return _pool;

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    throw new Error("Missing DATABASE_URL");
  }

  _pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  return _pool;
}

export async function query(text, params) {
  const pool = getPool();
  return pool.query(text, params);
}