---
title: Справочник main.js
---

# `public/js/main.js`

Файл является точкой клиентской инициализации лендинга. Все обработчики регистрируются при выполнении defer-скрипта после разбора HTML.

## Подсистемы

| Подсистема | Функции | Поведение |
| --- | --- | --- |
| Частицы | `Particle`, `resizeCanvas`, `animate` | Canvas-фон; при reduced motion создается меньше частиц и цикл не продолжается |
| Меню | `setMobileMenu` | Синхронизирует CSS-классы и ARIA-состояния |
| Навигация | `scrollToSection` | Плавный scroll с компенсацией высоты header |
| Рынок | `updatePrice`, `updateStats` | Запрашивает API каждые 5 и 30 секунд |
| TON Connect | `loadTonConnectScript`, `initTonConnect`, `openWalletConnect` | Лениво загружает SDK и связывает кошелек |
| Swap | `loadSwapQuote`, `queueSwapQuote` | Debounce 250 мс, отображение расчета и ошибок |
| Покупка | `shouldAutoOpenBuy`, `startBuyFlow` | Автозапуск для `/buy`, `?connect=1`, `?buy=casa` |
| Clipboard | `writeClipboard`, `copyContract` | Clipboard API с fallback через textarea |
| Устав | `publishCharter` | Динамически вставляет секцию и пункты меню |

## Периодические запросы

```js
updatePrice().catch(() => {});
updateStats().catch(() => {});
setInterval(() => updatePrice().catch(() => {}), 5000);
setInterval(() => updateStats().catch(() => {}), 30000);
```

Ошибки фонового обновления намеренно не прерывают страницу. Последнее отображенное значение остается в DOM.

## Загрузка TON Connect

SDK загружается в таком порядке:

1. локальный `/vendor/tonconnect-ui.min.js?v=3.0.0`;
2. fallback с `unpkg.com`;
3. ожидание глобального `window.TON_CONNECT_UI` до 20 попыток по 100 мс.

Для обычного посещения загрузка начинается при приближении секции swap к viewport. Для buy-сценария SDK и dapp config загружаются сразу параллельно.

## Состояние кошелька

`updateWalletState()` обновляет три элемента: краткий адрес, подпись кнопки подключения и текст submit-кнопки. Полный адрес берется только из `tonConnectUI.account.address` при подготовке swap.

## Глобальный API страницы

Файл экспортирует в `window` одну функцию:

```js
window.scrollToSection = scrollToSection;
```

Остальные функции локальны для скрипта и не являются стабильным публичным API.

## Известные ограничения

- адрес CASA также захардкожен в `copyContract()`; при смене контракта его нужно синхронизировать с серверной конфигурацией;
- quote-запросы не отменяются через `AbortController`, поэтому более старый ответ теоретически может прийти после нового;
- header и canvas предполагаются обязательными элементами и используются без null-check;
- `publishCharter()` хранит большой блок контента внутри JavaScript, а не в шаблоне или CMS.
