let client = null;
let connected = false;
try {
  const redis = require('redis');
  client = redis.createClient({ url: process.env.REDIS_URL });
  client.on('error', () => {});
  client.connect().then(() => { connected = true; }).catch(() => {});
} catch (e) {
  client = null;
}

const memory = new Map();

function now() { return Date.now(); }

async function get(key) {
  if (client && connected) {
    try {
      const v = await client.get(key);
      return v ? JSON.parse(v) : null;
    } catch (e) {
      /* ignore */
    }
  }
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expire < now()) {
    memory.delete(key);
    return null;
  }
  return entry.value;
}

async function set(key, value, ttl) {
  const str = JSON.stringify(value);
  if (client && connected) {
    try {
      await client.setEx(key, ttl, str);
      return;
    } catch (e) {
      /* ignore */
    }
  }
  memory.set(key, { value, expire: now() + ttl * 1000 });
}

module.exports = { get, set };
