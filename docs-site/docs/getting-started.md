---
title: Getting Started
sidebar_position: 2
---

# Getting Started

## Requirements

- Node.js 18 or newer.
- npm.
- A public HTTPS domain for production Telegram webhooks and TON Connect manifests.
- PostgreSQL for persistent Telegram bot alerts and referrals. This is optional for local development.

## Install

From the app folder:

```bash
cd casa-token
npm install
```

For root-level deployments:

```bash
npm install
```

## Configure

Create a local environment file:

```bash
cd casa-token
cp .env.example .env
```

Minimum local setup:

```env
PORT=3000
NODE_ENV=development
PUBLIC_URL=http://localhost:3000
TELEGRAM_BOT_POLLING=true
```

Minimum production setup:

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

## Run locally

```bash
cd casa-token
npm run dev
```

Open:

```text
http://localhost:3000
```

If `DATABASE_URL` is not set, the Telegram bot uses memory fallback storage. Alerts and referrals reset on restart in that mode.

## Run in production

Application-folder deployment:

```bash
cd casa-token
npm install
npm start
```

Root-level deployment:

```bash
npm install
npm start
```

Expected logs:

```text
Bot store connected to PostgreSQL.
Telegram webhook configured: https://www.casafond.com/telegram/webhook/...
```

## Docusaurus

```bash
cd docs-site
npm install
npm start
```

Production build:

```bash
npm run build
npm run serve
```

Offline static serving after a build:

```bash
npm run offline
```

Open:

```text
http://127.0.0.1:4173
```

Do not open `build/index.html` with `file://`; Docusaurus routing expects HTTP.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | HTTP server port | `3000` |
| `NODE_ENV` | Runtime mode | `development` |
| `PUBLIC_URL` | Public canonical origin for manifests, webhook URLs, and Mini App links | request origin or localhost |
| `SOCIAL_X_URL` | X community link | `https://x.com/casafond` |
| `CONTRACT_ADDRESS` | CASA contract address returned by API | built-in CASA address |
| `CASA_JETTON_ADDRESS` | CASA jetton address used for DEX and balance flows | built-in CASA address |
| `DEX_PROVIDER` | Quote provider, usually `stonfi` or `demo` | `stonfi` |
| `TON_RPC_ENDPOINT` | TON/GRAMM JSON-RPC endpoint | `https://toncenter.com/api/v2/jsonRPC` |
| `TELEGRAM_BOT_TOKEN` | BotFather token | none |
| `TELEGRAM_BOT_POLLING` | `true` for local polling, `false` for production webhook | `false` |
| `TELEGRAM_WEBHOOK_SECRET` | Secret webhook path suffix | `telegram-webhook` fallback |
| `TELEGRAM_ADMIN_SECRET` | Admin endpoint secret | none |
| `DATABASE_URL` | PostgreSQL connection string for bot alerts/referrals | memory fallback |
| `DATABASE_SSL` | Force PostgreSQL TLS on/off | auto in production |

:::tip
For production, `PUBLIC_URL` must be a public HTTPS origin. `localhost` will break Telegram Wallet manifest loading and mobile TON Connect.
:::
