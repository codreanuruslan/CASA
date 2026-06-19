---
title: Рыночные данные
---

# Рыночные данные

## `GET /api/price`

```json
{
  "ok": true,
  "data": {
    "price": 1.23,
    "change24h": 0.04,
    "changePct24h": 3.36,
    "currency": "USD",
    "source": "stonfi",
    "stale": false,
    "updatedAt": 1781337600000
  }
}
```

При отсутствии реальной цены возвращается HTTP 502 и код `CASA_PRICE_UNAVAILABLE`.

## `GET /api/stats`

Frontend читает как минимум поля `marketCap`, `fdv`, `holders`, `volume24h`, `marketCapChange24h`, `holdersGrowth24h` и `volumeChange24h`. Отсутствующие или нечисловые значения отображаются как `-`.

## `GET /api/token`

Возвращает `name`, `ticker`, `network`, `standard`, `totalSupply` и `contract`. CASA использует сеть GRAMM, стандарт Jetton (TEP-74) и 9 decimals.

## `GET /api/tokenomics`

Распределение задается сервером: публичная продажа 40%, экосистема 25%, команда 20%, маркетинг 10%, резерв 5%. Абсолютный `amount` вычисляется только при доступном `totalSupply`.

:::caution
Часть tokenomics сейчас является конфигурацией в коде. Изменения бизнес-данных требуют обновления API и проверки отображаемого контента сайта.
:::
