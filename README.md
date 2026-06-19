# CASA Token

CASA Token is a Node.js/Express web app for the CASA landing page, token API, TON Connect manifests, swap quote flow, and Telegram bot integration.

## Features

- CASA landing page with token information, tokenomics, roadmap, FAQ, and community links.
- Express API for price, stats, contract metadata, swap quotes, and dApp configuration.
- TON Connect manifest endpoints for the main site and Telegram Mini App.
- Telegram bot powered by Telegraf with menu buttons, `/start`, `/menu`, `/buy`, `/price`, `/stats`, `/chart`, `/top`, `/whale`, `/news`, `/contract`, `/alert`, `/alerts`, `/cancelalert`, `/balance`, and `/referral`.
- Webhook-first Telegram bot setup for production deployments.
- Optional PostgreSQL persistence for Telegram bot price alerts, referrals, subscriptions, and whale deduplication.

## Project Structure

```text
.
|-- casa-token/
|   |-- app.js              # Express app and route wiring
|   |-- server.js           # HTTP server entry point
|   |-- bot.js              # Telegram bot integration
|   |-- botStore.js         # PostgreSQL/memory store for bot alerts and referrals
|   |-- priceEngine.js      # Price update engine
|   |-- routes/             # API and page routes
|   |-- views/              # HTML pages
|   `-- public/             # CSS, JS, images, wallet lists
|-- api/                    # API entry files for alternate deployments
|-- src/                    # TypeScript source, if used by root build
`-- package.json
```

## Requirements

- Node.js 18 or newer
- npm
- Public HTTPS domain for production Telegram webhook and TON Connect wallet manifest loading
- PostgreSQL database, optional but recommended for production bot alerts/referrals

## Local Development

Install dependencies from the app folder:

```bash
cd casa-token
npm install
```

If you run the app from the repository root, install root dependencies too:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Local development can run without `DATABASE_URL`. In that mode the Telegram bot uses in-memory storage and alert/referral state resets on restart.

## Environment Variables

Use `casa-token/.env.example` as the template. Never commit real tokens, secrets, or private deployment values.

```env
PORT=3000
NODE_ENV=development
PUBLIC_URL=http://localhost:3000
SOCIAL_X_URL=https://x.com/casafond

INITIAL_PRICE=0.001247
PRICE_VOLATILITY=0.0003
PRICE_UPDATE_INTERVAL=5000
CONTRACT_ADDRESS=EQBWK_VVEBJWiIQIIXOckUVw0HdF24buJiNiiR0dUHEe2xs4
CASA_JETTON_ADDRESS=EQBWK_VVEBJWiIQIIXOckUVw0HdF24buJiNiiR0dUHEe2xs4

DEX_PROVIDER=stonfi
STONFI_ROUTER_ADDRESS=
DEDUST_FACTORY_ADDRESS=

TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_POLLING=false
TELEGRAM_WEBHOOK_SECRET=change-this-long-random-secret
TELEGRAM_ADMIN_SECRET=change-this-admin-secret

DATABASE_URL=
DATABASE_SSL=
WHALE_THRESHOLD_USD=1000
```

Variable notes:

```text
PUBLIC_URL             Public site origin. Must be HTTPS in production.
TELEGRAM_BOT_POLLING   Use true only for local development. Use false for production webhooks.
DATABASE_URL           PostgreSQL connection string for bot alerts/referrals.
DATABASE_SSL           Set false for local PostgreSQL without TLS. Production usually uses true or leave empty for auto.
WHALE_THRESHOLD_USD    Minimum USD value for Telegram whale alerts.
DEX_PROVIDER           stonfi or demo.
```

## Production Setup

For production, set at least:

```env
NODE_ENV=production
PUBLIC_URL=https://www.casafond.com
TELEGRAM_BOT_POLLING=false
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_WEBHOOK_SECRET=your-long-random-webhook-secret
TELEGRAM_ADMIN_SECRET=your-admin-secret
DATABASE_URL=postgres://user:password@host:5432/database
DATABASE_SSL=true
```

Then install and start:

```bash
cd casa-token
npm install
npm start
```

Root-level deployments can also use:

```bash
npm install
npm start
```

The app auto-configures the Telegram webhook on startup when:

- `TELEGRAM_BOT_TOKEN` is configured
- `TELEGRAM_BOT_POLLING=false`
- `PUBLIC_URL` is a public HTTPS URL

Expected startup log:

```text
Telegram webhook configured: https://www.casafond.com/telegram/webhook/...
```

Expected bot store log when PostgreSQL is configured:

```text
Bot store connected to PostgreSQL.
```

If `DATABASE_URL` is missing or unavailable, the app logs that it is using the memory fallback.

## Deployment Checklist

Before deploying:

```bash
npm install
node --check casa-token/app.js
node --check casa-token/bot.js
node --check casa-token/botStore.js
```

After deploying, verify public TON Connect manifests do not contain `localhost`:

```text
GET https://www.casafond.com/tonconnect-site-manifest.json
GET https://www.casafond.com/tonconnect-miniapp-manifest.json
```

Expected shape:

```json
{
  "url": "https://www.casafond.com",
  "name": "CasaFond Site",
  "iconUrl": "https://www.casafond.com/img/casa-icon-180.png"
}
```

## Telegram Bot Checks

Check bot and webhook status:

```text
GET https://www.casafond.com/api/telegram/status?secret=TELEGRAM_ADMIN_SECRET
```

Manually register the webhook if needed:

```text
POST https://www.casafond.com/api/telegram/set-webhook?secret=TELEGRAM_ADMIN_SECRET
```

The status response should show matching `expectedWebhookUrl` and `actualWebhookUrl`.

The status response also includes:

```text
pendingUpdateCount
lastErrorDate
lastErrorMessage
activeAlerts
```

Use these fields first when debugging Telegram delivery.

## Telegram Bot Commands

```text
/start              Open the main bot menu
/menu               Open the main bot menu
/buy                Open the CASA Mini App purchase flow
/price              Show current CASA price
/stats              Show token stats
/chart              Show CASA price chart
/top                Show top CASA holders
/whale              Subscribe to large CASA transfer alerts
/news               Subscribe to CASA news broadcasts
/contract           Show CASA contract metadata and Tonviewer link
/alert 0.05 above   Notify when CASA price rises above $0.05
/alert 0.03 below   Notify when CASA price falls below $0.03
/alerts             Show the active price alert
/cancelalert        Cancel the active price alert
/balance UQ...      Show CASA balance for a TON wallet address
/referral           Generate a personal referral link
```

Bot menu buttons mirror the same flows with quick actions for buy, price, stats, chart, top holders, contract, balance, alerts, whale alerts, news, referral sharing, site link, and help.

## Telegram Bot Database

Set `DATABASE_URL` to persist bot price alerts, referral records, subscriptions, and whale deduplication across restarts. The app creates these tables automatically on startup:

```text
bot_price_alerts
bot_referrals
bot_subscriptions
bot_seen_whales
```

If `DATABASE_URL` is not set, the bot uses an in-memory fallback for local development. In that mode alerts, referrals, subscriptions, and whale deduplication reset when the server restarts.

Tables created by the app:

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

CREATE TABLE IF NOT EXISTS bot_subscriptions (
  chat_id BIGINT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('whale', 'news')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, type)
);

CREATE TABLE IF NOT EXISTS bot_seen_whales (
  tx_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

For managed PostgreSQL providers that require TLS, use:

```env
DATABASE_SSL=true
```

For local PostgreSQL without TLS, use:

```env
DATABASE_SSL=false
```

## Useful Endpoints

```text
GET /api/price
GET /api/price/history
GET /api/stats
GET /api/token
GET /api/tokenomics
GET /api/contract
GET /api/dapp/config
GET /api/swap/tokens
GET /api/swap/config
GET /api/swap/quote
POST /api/swap/prepare
POST /api/telegram/broadcast-news?secret=TELEGRAM_ADMIN_SECRET
GET /tonconnect-site-manifest.json
GET /tonconnect-miniapp-manifest.json
GET /miniapp
```

## Security Notes

- Keep `.env` out of Git.
- Rotate `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and `TELEGRAM_ADMIN_SECRET` if they were ever exposed.
- Use HTTPS in production. Telegram webhooks and TON Connect wallet manifests should not point to localhost.
- Restrict access to admin endpoints with `TELEGRAM_ADMIN_SECRET`.
- Restrict database network access to the app host where possible.
- Do not expose `DATABASE_URL` in logs, frontend code, or GitHub issues.

## License

Private project. Add a license file before publishing as open source.
