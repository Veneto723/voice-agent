// src/utils/redisClient.js
import Redis from "ioredis";

const REDIS_URL = (process.env.REDIS_URL || "redis://127.0.0.1:6379/1").trim();

function createRedisClient(name) {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  client.on("connect", () => console.log(`[redis:${name}] connect`));
  client.on("ready", () => console.log(`[redis:${name}] ready`));
  client.on("error", (e) => console.error(`[redis:${name}] error`, e?.message || e));
  client.on("close", () => console.log(`[redis:${name}] close`));
  client.on("reconnecting", () => console.log(`[redis:${name}] reconnecting`));

  return client;
}

export const redis = createRedisClient("pub");
export const sub = createRedisClient("sub");