---
title: TON Connect
---

# TON Connect

## Manifests

Приложение генерирует три manifest endpoint:

| Путь | Имя | URL приложения |
| --- | --- | --- |
| `/tonconnect-manifest.json` | CasaFond | origin |
| `/tonconnect-site-manifest.json` | CasaFond Site | origin |
| `/tonconnect-miniapp-manifest.json` | CasaFond Mini App | `/miniapp` |

Все используют `/img/casa-icon-180.png` и кэшируются на сутки.

## Клиентская инициализация

```js
const connector = new TON_CONNECT_UI.TonConnect({
  manifestUrl,
  storage: createScopedStorage('casa-site:')
});

const ui = new TON_CONNECT_UI.TonConnectUI({
  connector,
  buttonRootId: 'tonConnectButton',
  language: 'ru',
  restoreConnection: false
});
```

Storage изолирован префиксом `casa-site:`. Автоматическое восстановление соединения отключено, поэтому состояние кошелька не следует считать постоянной сессией.

## Требования production

- `PUBLIC_URL` должен быть HTTPS;
- URL должен быть доступен кошельку извне;
- icon и manifest не должны требовать авторизации;
- reverse proxy обязан корректно передавать protocol и host или задается `PUBLIC_URL`.

`/api/dapp/config` сообщает `tonConnectReady` и предупреждения. Frontend показывает предупреждения в статусе swap.
