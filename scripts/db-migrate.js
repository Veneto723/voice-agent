import dotenv from 'dotenv';
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getDbTargetForLogs, query } from "../src/db.js";

// Load environment variables from .env file
dotenv.config();

async function main() {
  console.log("DB env present:", {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    DB_URL: Boolean(process.env.DB_URL),
  });
  console.log("DB target:", getDbTargetForLogs());

  const migrationPath = resolve("migrations/db.sql");
  const sql = await readFile(migrationPath, "utf8");
  await query(sql);
  console.log("DB migrate ok:", migrationPath);
}

main().catch((e) => {
  console.error("DB migrate failed:", e);
  process.exitCode = 1;
});

