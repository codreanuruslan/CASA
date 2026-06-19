---
title: Operations
---

# Operations

## Health check

```http
GET /api/health
```

This confirms the Express route is alive. It does not prove that RPC, STON.fi, PostgreSQL, or Telegram are healthy.

## Deployment checklist

Before deploying:

```bash
npm install
node --check casa-token/app.js
node --check casa-token/bot.js
node --check casa-token/botStore.js
```

After deploying:

```text
GET https://www.casafond.com/api/health
GET https://www.casafond.com/api/dapp/config
GET https://www.casafond.com/tonconnect-site-manifest.json
GET https://www.casafond.com/tonconnect-miniapp-manifest.json
GET https://www.casafond.com/api/telegram/status?secret=TELEGRAM_ADMIN_SECRET
```

The manifest responses must not contain `localhost`.

Expected site manifest:

```json
{
  "url": "https://www.casafond.com",
  "name": "CasaFond Site",
  "iconUrl": "https://www.casafond.com/img/casa-icon-180.png"
}
```

## Telegram webhook

The bot configures its webhook automatically when:

- `TELEGRAM_BOT_TOKEN` is set.
- `TELEGRAM_BOT_POLLING=false`.
- `PUBLIC_URL` is a public HTTPS URL.

Manual webhook registration:

```http
POST /api/telegram/set-webhook?secret=TELEGRAM_ADMIN_SECRET
```

Status endpoint:

```http
GET /api/telegram/status?secret=TELEGRAM_ADMIN_SECRET
```

Important status fields:

| Field | Meaning |
| --- | --- |
| `expectedWebhookUrl` | URL this app wants Telegram to use |
| `actualWebhookUrl` | URL currently registered in Telegram |
| `pendingUpdateCount` | Updates waiting in Telegram queue |
| `lastErrorMessage` | Telegram delivery error, if any |
| `activeAlerts` | Number of stored price alerts |

`expectedWebhookUrl` and `actualWebhookUrl` should match.

## Bot database

Set `DATABASE_URL` to persist Telegram bot alerts and referrals across restarts.

The app creates these tables automatically:

```sql
CREATE TABLE IF NOT EXISTS bot_price_alerts (
  chat_id BIGINT PRIMARY KEY,
  price DOUBLE PRECISION NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bot_referrals (
  referred_chat_id BIGINT PRIMARY KEY,
  referrer_chat_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Use `DATABASE_SSL=true` for managed providers that require TLS. Use `DATABASE_SSL=false` for local PostgreSQL without TLS.

## Static cache

| Files | Cache-Control |
| --- | --- |
| `vendor/*`, `wallets-v2.json`, `wallets-mini.json` | 1 year, immutable |
| `.js`, `.css` | 7 days |
| Other static assets | 1 hour |
| HTML routes | no-cache/no-store |

When changing JS or CSS, update the query version in HTML or clear CDN cache.

## Monitoring

At minimum, monitor:

1. `/api/health`.
2. `/api/price` and stale price flags.
3. `/api/swap/config` and `configured`.
4. Public TON Connect manifests.
5. Telegram webhook status.
6. PostgreSQL availability if `DATABASE_URL` is configured.
7. A quote request for GRAMM to CASA without submitting a transaction.

## Docusaurus deployment

```bash
cd docs-site
npm run build
```

The static output is `docs-site/build`. It can be served by static hosting or a CDN. If hosting under a subpath, update `url` and `baseUrl` in `docusaurus.config.js`.
