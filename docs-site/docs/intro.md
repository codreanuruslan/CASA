---
id: intro
title: CASA Token
slug: /
sidebar_position: 1
---

# CASA Token Documentation

CASA Token is a Node.js/Express application for the CASA public site, token API, TON Connect manifests, swap flow, and Telegram bot.

:::warning Financial risk
This documentation describes the software. It is not investment advice. Token price, liquidity, swap routes, and execution are not guaranteed.
:::

## What is covered

- Express app wiring in `casa-token/app.js`.
- REST API in `casa-token/routes/api.js`.
- Frontend behavior in `casa-token/public/js/main.js` and `miniapp.js`.
- TON Connect manifests and wallet connection flow.
- Telegram bot commands, webhook mode, price alerts, referrals, and PostgreSQL persistence.
- Production operations and troubleshooting.

## Main components

| Component | Purpose |
| --- | --- |
| `casa-token/app.js` | Express middleware, static files, manifests, REST API, Telegram bot attachment |
| `casa-token/routes/api.js` | Market data, token metadata, quote and swap endpoints |
| `casa-token/public/js/main.js` | Landing page interactivity and TON Connect orchestration |
| `casa-token/public/js/miniapp.js` | Telegram Mini App swap flow |
| `casa-token/views/index.html` | Main site markup |
| `casa-token/priceEngine.js` | Price history and periodic updates |
| `casa-token/bot.js` | Telegram bot commands and webhook endpoints |
| `casa-token/botStore.js` | PostgreSQL or memory storage for bot alerts and referrals |

## Quick links

- [Getting started](./getting-started)
- [Architecture](./architecture)
- [REST API](./api/overview)
- [TON Connect](./integrations/ton-connect)
- [Telegram bot](./integrations/telegram-bot)
- [Operations](./operations)
- [Troubleshooting](./troubleshooting)
