---
title: Обзор API
---

# REST API

Base URL: `/api`. Успешные ответы обычно используют оболочку:

```json
{
  "ok": true,
  "data": {}
}
```

Ошибки могут содержать `code`, `error`, `details` и контекст в `data`.

## Маршруты

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET | `/health` | Проверка процесса API |
| GET | `/token` | Метаданные CASA |
| GET | `/price` | Цена и изменение за 24 часа |
| GET | `/price/history?limit=60` | Последние точки истории, лимит 1–200 |
| GET | `/stats` | Капитализация, объем, holders и связанные показатели |
| GET | `/tokenomics` | Распределение предложения |
| GET | `/contract` | Адрес и стандарт контракта |
| GET | `/swap/tokens` | Поддерживаемые токены |
| GET | `/swap/config` | Состояние DEX-провайдера |
| GET | `/swap/quote` | Котировка обмена |
| POST | `/swap/prepare` | TON Connect transaction |
| POST | `/swap` | Удаленный legacy endpoint, всегда HTTP 410 |

## Dapp config

`GET /api/dapp/config` объявлен в `app.js`, а не в API router. Он возвращает URL manifests, готовность TON Connect и предупреждения о localhost/HTTP.

## Кэширование

Сервер использует stale-while-refresh подход в памяти процесса:

- цена: TTL 15 секунд;
- статистика: TTL 30 секунд;
- timeout внешнего запроса: 10 секунд.

После перезапуска процесса кэш пуст и первый запрос зависит от внешних сервисов.
