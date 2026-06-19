---
title: Swap API
---

# Swap API

## Поддерживаемые токены

`GET /api/swap/tokens` возвращает GRAMM, USDT и CASA с адресами и decimals. CASA и GRAMM используют 9 decimals, USDT — 6.

## Котировка

```http
GET /api/swap/quote?from=GRAMM&to=CASA&amount=1&slippage=0.5
Accept: application/json
```

Ограничения:

- `from` и `to` должны отличаться;
- сумма не меньше `0.000001`;
- slippage от `0.1` до `5` процентов;
- символы токенов нормализуются в uppercase.

Ключевые поля ответа: `estimatedAmount`, `minimumReceived`, `feeAmount`, `priceImpact`, `route`, `provider`, `offerUnits`, `askUnits`, `minAskUnits`.

## Подготовка транзакции

```http
POST /api/swap/prepare
Content-Type: application/json

{
  "from": "GRAMM",
  "to": "CASA",
  "amount": 1,
  "slippage": 0.5,
  "walletAddress": "EQ..."
}
```

Успешный ответ содержит `data.transaction` в формате TON Connect:

```json
{
  "validUntil": 1781337900,
  "messages": [
    {
      "address": "EQ...",
      "amount": "300000000",
      "payload": "base64..."
    }
  ]
}
```

## Ошибки

| Код | HTTP | Причина |
| --- | --- | --- |
| `TOKEN_NOT_CONFIGURED` | 400 | Нет адреса токена |
| `STONFI_QUOTE_FAILED` | 502 | STON.fi не вернул котировку |
| `MULTIHOP_TX_PENDING` | 501 | Котировка через GRAMM есть, builder multi-hop еще не реализован |
| `STONFI_TX_BUILD_FAILED` | 502 | Не удалось построить transaction payload |
| `DEX_PROVIDER_PENDING` | 501 | Builder выбранного провайдера отсутствует |
| `SIMULATED_SWAP_REMOVED` | 410 | Использован старый `/api/swap` |
