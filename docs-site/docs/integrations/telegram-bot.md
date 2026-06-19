---
title: Telegram Bot
---

# Telegram Bot

The CASA Telegram bot is implemented in `casa-token/bot.js`. Persistent bot state is handled by `casa-token/botStore.js`.

## Features

- Main menu with inline buttons for buy, price, stats, chart, top holders, contract, balance, alerts, whale alerts, news, referrals, site link, and help.
- Telegram Mini App purchase button.
- Price, stats, chart, top holders, whale alerts, news, and contract commands.
- Price alerts with periodic checks.
- CASA balance lookup by TON wallet address.
- Referral links.
- Webhook-first production setup.
- PostgreSQL persistence for alerts, referrals, subscriptions, and whale deduplication.

## Commands

```text
/start              Open the main menu
/menu               Open the main menu
/buy                Open the CASA Mini App purchase flow
/price              Show current CASA price
/stats              Show token statistics
/chart              Show CASA price chart
/top                Show top CASA holders
/whale              Subscribe to large CASA transfer alerts
/news               Subscribe to CASA news broadcasts
/contract           Show CASA contract metadata and Tonviewer link
/alert 0.05 above   Notify when CASA rises above $0.05
/alert 0.03 below   Notify when CASA falls below $0.03
/alerts             Show the active price alert
/cancelalert        Cancel the active price alert
/balance UQ...      Show CASA balance for a TON wallet address
/referral           Generate a personal referral link
```

The bot also publishes this command list to Telegram via `setMyCommands` during startup. If command setup fails, the bot still runs and logs `Telegram command setup failed`.

## Webhook mode

Production should use webhook mode:

```env
NODE_ENV=production
PUBLIC_URL=https://www.casafond.com
TELEGRAM_BOT_POLLING=false
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_WEBHOOK_SECRET=your-long-random-webhook-secret
TELEGRAM_ADMIN_SECRET=your-admin-secret
```

The app registers the webhook automatically during startup when `PUBLIC_URL` is HTTPS.

Manual registration:

```http
POST /api/telegram/set-webhook?secret=TELEGRAM_ADMIN_SECRET
```

Status:

```http
GET /api/telegram/status?secret=TELEGRAM_ADMIN_SECRET
```

## Local polling mode

For local development without a public HTTPS tunnel:

```env
TELEGRAM_BOT_POLLING=true
PUBLIC_URL=http://localhost:3000
```

Polling and webhook mode should not run for the same bot token at the same time.

## Persistent storage

Set `DATABASE_URL` to store alerts and referrals in PostgreSQL:

```env
DATABASE_URL=postgres://user:password@host:5432/database
DATABASE_SSL=true
WHALE_THRESHOLD_USD=1000
```

The app creates:

```text
bot_price_alerts
bot_referrals
bot_subscriptions
bot_seen_whales
```

If `DATABASE_URL` is not set, `botStore.js` uses memory fallback. This keeps local development simple but state resets on restart.

## News broadcasts

Admins can send a Telegram news broadcast to `/news` subscribers:

```http
POST /api/telegram/broadcast-news?secret=TELEGRAM_ADMIN_SECRET
```

Body:

```json
{
  "title": "CASA update",
  "text": "Short announcement text",
  "url": "https://www.casafond.com"
}
```

## Whale alerts

The bot checks large CASA transfers every five minutes. The minimum USD value is configured by:

```env
WHALE_THRESHOLD_USD=1000
```

## Alert checking

The bot checks stored price alerts every five minutes. When the threshold is reached, the alert is deleted and the user receives a Telegram message.

Supported directions:

```text
above
below
```

## Referral behavior

Referral links use Telegram start payloads:

```text
https://t.me/casafond_bot?start=ref_<chatId>
```

Each referred chat is recorded only once. The referrer receives a notification when a new referral is created.
