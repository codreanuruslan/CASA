---
title: DOM-контракт
---

# DOM-контракт `main.js`

Изменение идентификаторов в `views/index.html` может молча отключить часть интерфейса или вызвать исключение.

## Обязательные элементы

| Селектор | Использование |
| --- | --- |
| `#particles` | Canvas и 2D context для фоновой анимации |
| `.burger` | Кнопка мобильного меню |
| `.mobile-menu` | Контейнер мобильной навигации |
| `.header` | Изменение фона при прокрутке |

## Рыночная статистика

| ID | Значение |
| --- | --- |
| `price` | Цена CASA в USD |
| `price-change` | Изменение цены за 24 часа |
| `marketCap` | Market cap или FDV |
| `holdersCount` | Количество держателей |
| `volume24h` | Объем за 24 часа |
| `market-cap-change` | Изменение капитализации |
| `holders-change` | Рост держателей |
| `volume-change` | Изменение объема |

## Swap-форма

`swapForm` включает `swapFromAmount`, `swapFromToken`, `swapToToken`, `swapToAmount`, `swapSlippage`, `swapSwitch`, `swapSubmit` и поля `quote*`. TON Connect использует `tonConnectButton`, `walletStatus` и `walletConnectAction`.

Большинство swap-элементов защищены проверкой наличия формы, но после обнаружения `#swapForm` дочерние controls считаются обязательными.

## Динамические селекторы

- `.distribution-item[data-color]` задает цвет `.dist-dot` и `.dist-fill`;
- `.copy-btn` получает визуальное подтверждение копирования;
- `#faq`, `#community` и `footer` определяют место вставки устава;
- `.nav-links` и `.mobile-menu ul` получают ссылку «Устав».
