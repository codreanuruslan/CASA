# CASA Token

CASA Token is a Node.js/Express web app for the CASA landing page, token API, TON Connect manifests, swap quote flow, and Telegram bot integration.

## Features

- CASA landing page with token information, tokenomics, roadmap, FAQ, and community links.
- Express API for price, stats, contract metadata, swap quotes, and dApp configuration.
- TON Connect manifest endpoints for the main site and Telegram Mini App.
- Telegram bot powered by Telegraf with `/start`, `/buy`, `/price`, `/stats`, and `/contract`.
- Webhook-first Telegram bot setup for production deployments.

## Project Structure

```text
.
|-- casa-token/
|   |-- app.js              # Express app and route wiring
|   |-- server.js           # HTTP server entry point
|   |-- bot.js              # Telegram bot integration
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

## Local Development

Install dependencies from the app folder:

```bash
cd casa-token
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
```

Then install and start:

```bash
cd casa-token
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

## Useful Endpoints

```text
GET /api/price
GET /api/stats
GET /api/contract
GET /api/dapp/config
GET /tonconnect-site-manifest.json
GET /tonconnect-miniapp-manifest.json
GET /miniapp
```

## Security Notes

- Keep `.env` out of Git.
- Rotate `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and `TELEGRAM_ADMIN_SECRET` if they were ever exposed.
- Use HTTPS in production. Telegram webhooks and TON Connect wallet manifests should not point to localhost.
- Restrict access to admin endpoints with `TELEGRAM_ADMIN_SECRET`.

## License

Private project. Add a license file before publishing as open source.
