const memoryAlerts = new Map();
const memoryReferrals = new Map();
let pool = null;
let initPromise = null;
let usingDatabase = false;

function getDatabaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
}

function shouldUseSsl(databaseUrl) {
  if (process.env.DATABASE_SSL === 'false') return false;
  if (process.env.DATABASE_SSL === 'true') return true;
  return process.env.NODE_ENV === 'production' && !/localhost|127\.0\.0\.1/i.test(databaseUrl);
}

async function initBotStore() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const databaseUrl = getDatabaseUrl();
    if (!databaseUrl) {
      console.warn('Bot store uses memory fallback: DATABASE_URL is not configured.');
      return { type: 'memory' };
    }

    try {
      const { Pool } = require('pg');
      pool = new Pool({
        connectionString: databaseUrl,
        ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: false } : false
      });

      await pool.query(`
        CREATE TABLE IF NOT EXISTS bot_price_alerts (
          chat_id BIGINT PRIMARY KEY,
          price DOUBLE PRECISION NOT NULL,
          direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS bot_referrals (
          referred_chat_id BIGINT PRIMARY KEY,
          referrer_chat_id BIGINT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      usingDatabase = true;
      console.log('Bot store connected to PostgreSQL.');
      return { type: 'postgres' };
    } catch (error) {
      usingDatabase = false;
      pool = null;
      console.error('Bot store PostgreSQL init failed; using memory fallback.', error);
      return { type: 'memory' };
    }
  })();

  return initPromise;
}

async function getPriceAlert(chatId) {
  await initBotStore();
  const key = String(chatId);

  if (!usingDatabase) return memoryAlerts.get(key) || null;

  const result = await pool.query(
    'SELECT price, direction FROM bot_price_alerts WHERE chat_id = $1',
    [key]
  );
  const row = result.rows[0];
  return row ? { price: Number(row.price), direction: row.direction } : null;
}

async function setPriceAlert(chatId, alert) {
  await initBotStore();
  const key = String(chatId);
  const value = { price: Number(alert.price), direction: alert.direction };

  if (!usingDatabase) {
    memoryAlerts.set(key, value);
    return value;
  }

  await pool.query(
    `INSERT INTO bot_price_alerts (chat_id, price, direction, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (chat_id)
     DO UPDATE SET price = EXCLUDED.price, direction = EXCLUDED.direction, updated_at = now()`,
    [key, value.price, value.direction]
  );
  return value;
}

async function deletePriceAlert(chatId) {
  await initBotStore();
  const key = String(chatId);

  if (!usingDatabase) {
    memoryAlerts.delete(key);
    return;
  }

  await pool.query('DELETE FROM bot_price_alerts WHERE chat_id = $1', [key]);
}

async function listPriceAlerts() {
  await initBotStore();

  if (!usingDatabase) {
    return Array.from(memoryAlerts.entries()).map(([chatId, alert]) => ({
      chatId,
      price: alert.price,
      direction: alert.direction
    }));
  }

  const result = await pool.query(
    'SELECT chat_id, price, direction FROM bot_price_alerts ORDER BY updated_at ASC'
  );
  return result.rows.map(row => ({
    chatId: row.chat_id,
    price: Number(row.price),
    direction: row.direction
  }));
}

async function countPriceAlerts() {
  await initBotStore();

  if (!usingDatabase) return memoryAlerts.size;

  const result = await pool.query('SELECT COUNT(*)::int AS count FROM bot_price_alerts');
  return result.rows[0]?.count || 0;
}

async function recordReferral(referredChatId, referrerChatId) {
  await initBotStore();
  const referred = String(referredChatId);
  const referrer = String(referrerChatId);

  if (referred === referrer) return { created: false, count: await countReferrals(referrer) };

  if (!usingDatabase) {
    if (!memoryReferrals.has(referred)) {
      memoryReferrals.set(referred, referrer);
      return { created: true, count: await countReferrals(referrer) };
    }
    return { created: false, count: await countReferrals(referrer) };
  }

  const insert = await pool.query(
    `INSERT INTO bot_referrals (referred_chat_id, referrer_chat_id)
     VALUES ($1, $2)
     ON CONFLICT (referred_chat_id) DO NOTHING
     RETURNING referred_chat_id`,
    [referred, referrer]
  );

  return {
    created: insert.rowCount > 0,
    count: await countReferrals(referrer)
  };
}

async function countReferrals(referrerChatId) {
  await initBotStore();
  const referrer = String(referrerChatId);

  if (!usingDatabase) {
    let count = 0;
    for (const storedReferrer of memoryReferrals.values()) {
      if (storedReferrer === referrer) count += 1;
    }
    return count;
  }

  const result = await pool.query(
    'SELECT COUNT(*)::int AS count FROM bot_referrals WHERE referrer_chat_id = $1',
    [referrer]
  );
  return result.rows[0]?.count || 0;
}

module.exports = {
  initBotStore,
  getPriceAlert,
  setPriceAlert,
  deletePriceAlert,
  listPriceAlerts,
  countPriceAlerts,
  recordReferral,
  countReferrals
};
