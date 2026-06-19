---
title: Troubleshooting
---

# Troubleshooting

## Telegram Wallet shows "Manifest error"

Check:

```text
https://www.casafond.com/tonconnect-site-manifest.json
```

The response must use HTTPS URLs and must not contain `localhost`:

```json
{
  "url": "https://www.casafond.com",
  "name": "CasaFond Site",
  "iconUrl": "https://www.casafond.com/img/casa-icon-180.png"
}
```

Also check that the deployed process was restarted after the latest code was pulled and that `/img/casa-icon-180.png` is publicly reachable.

## Telegram bot does not answer

Open:

```text
https://www.casafond.com/api/telegram/status?secret=TELEGRAM_ADMIN_SECRET
```

Check:

- `actualWebhookUrl` is not empty.
- `actualWebhookUrl` equals `expectedWebhookUrl`.
- `lastErrorMessage` is empty.
- `pendingUpdateCount` is not growing forever.

If the webhook is empty, register it:

```http
POST /api/telegram/set-webhook?secret=TELEGRAM_ADMIN_SECRET
```

## Bot alerts or referrals disappear after restart

This means the bot is using memory fallback storage. Configure PostgreSQL:

```env
DATABASE_URL=postgres://user:password@host:5432/database
DATABASE_SSL=true
```

On startup, the logs should include:

```text
Bot store connected to PostgreSQL.
```

## PostgreSQL connection fails

Check:

1. `DATABASE_URL` is present in the runtime environment.
2. The database accepts connections from the app host.
3. TLS mode matches the provider. Try `DATABASE_SSL=true` for managed PostgreSQL.
4. The `pg` dependency is installed from either root or `casa-token`, depending on deployment mode.

The app falls back to memory storage if database initialization fails, so the bot can still run while persistence is degraded.

## TON Connect does not open

1. Open `/api/dapp/config` and check `warnings`.
2. Verify that `PUBLIC_URL` is HTTPS and reachable from a phone.
3. Check `/tonconnect-site-manifest.json` and icon URL.
4. Check local `/vendor/tonconnect-ui.min.js`.
5. Only then check the CDN fallback.

## Quote endpoint is unavailable

- `STONFI_QUOTE_FAILED`: check STON.fi availability, pool existence, and liquidity.
- `TOKEN_NOT_CONFIGURED`: check `CASA_JETTON_ADDRESS`.
- Slippage must be between `0.1` and `5`.
- Amount must be at least `0.000001`.

## Price or stats show `-`

Check Network responses for `/api/price` and `/api/stats`. HTTP 502 usually means the server could not fetch market data. Invalid numeric fields are intentionally rendered as `-` by the frontend.

## USDT to CASA swap does not execute

The API may return a multi-hop quote through GRAMM, but transaction building for that route may not be implemented. Use direct GRAMM/CASA operations or implement multi-message route execution server-side.

## Frontend changes are not visible

JS and CSS are cached for seven days. Update the version query in HTML and clear CDN cache if needed.

## Docusaurus build fails on a link

The site uses `onBrokenLinks: 'throw'`. Fix the internal path or slug. Do not disable the check unless you are doing a temporary local build.
