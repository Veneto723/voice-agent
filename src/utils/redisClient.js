// src/utils/redisClient.js
import Redis from 'ioredis';

export const redis = new Redis({
  host: '127.0.0.1',
  port: 6379,
  maxRetriesPerRequest: null,
  db: 1
});

export const sub = new Redis({
  host: "127.0.0.1",
  port: 6379,
  db: 1
});