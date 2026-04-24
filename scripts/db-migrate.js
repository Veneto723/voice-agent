import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { query } from "../src/db.js";

async function main() {
  const migrationPath = resolve("migrations/db.sql");
  const sql = await readFile(migrationPath, "utf8");
  await query(sql);
  console.log("DB migrate ok:", migrationPath);
}

main().catch((e) => {
  console.error("DB migrate failed:", e);
  process.exitCode = 1;
});

