import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    tls: process.env.REDIS_URL?.startsWith("rediss://") ? {} : undefined,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 100, 3000),
    lazyConnect: true
});

redis.on("connect", () => console.log("✅ Redis connecté"));
redis.on("error", (err) => console.error("❌ Redis erreur:", err.message));

export default redis;