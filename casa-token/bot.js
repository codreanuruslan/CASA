const { Telegraf, Markup } = require('telegraf');
const botStore = require('./botStore');

const DEFAULT_CASA_ADDRESS = 'EQBWK_VVEBJWiIQIIXOckUVw0HdF24buJiNiiR0dUHEe2xs4';
const PRODUCTION_PUBLIC_URL = 'https://www.casafond.com';
const ALERT_INTERVAL_MS = 5 * 60 * 1000;
const SUBSCRIPTION_WHALE = 'whale';
const SUBSCRIPTION_NEWS = 'news';

let lastKnownPrice = null;

function isLocalhostUrl(url) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|$)/i.test(url);
}

function getPublicUrl() {
  const url = (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
  if (
    isLocalhostUrl(url) &&
    (process.env.NODE_ENV === 'production' || process.env.TELEGRAM_BOT_POLLING !== 'true')
  ) {
    return PRODUCTION_PUBLIC_URL;
  }
  return url === 'https://casafond.com' ? PRODUCTION_PUBLIC_URL : url;
}

function getTelegramAppUrl() {
  const url = getPublicUrl();
  if (isLocalhostUrl(url) || !url.startsWith('https://')) return PRODUCTION_PUBLIC_URL;
  return url;
}

function isHttpsPublicUrl(url) {
  return url.startsWith('https://') && !isLocalhostUrl(url);
}

function getCasaAddress() {
  return process.env.CASA_JETTON_ADDRESS || process.env.CONTRACT_ADDRESS || DEFAULT_CASA_ADDRESS;
}

function getWhaleThreshold() {
  const threshold = Number(process.env.WHALE_THRESHOLD_USD || 1000);
  return Number.isFinite(threshold) && threshold > 0 ? threshold : 1000;
}

function money(value, digits = 2) {
  if (value === null || value === undefined || value === '') return 'н/д';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'н/д';
  return '$' + number.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function compact(value) {
  if (value === null || value === undefined || value === '') return 'н/д';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'н/д';
  return number.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function percent(value) {
  if (value === null || value === undefined || value === '') return 'н/д';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'н/д';
  const sign = number >= 0 ? '📈 +' : '📉 ';
  return sign + number.toFixed(2) + '%';
}

function shortAddr(address) {
  if (!address || typeof address === 'object') return '-';
  const value = String(address);
  if (value.length < 12) return value;
  return value.slice(0, 6) + '...' + value.slice(-4);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function readApi(path) {
  const response = await fetch(getPublicUrl() + path, {
    headers: { Accept: 'application/json' }
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || 'API request failed');
  }
  return payload.data || payload;
}

function mainKeyboard() {
  const siteUrl = getTelegramAppUrl();
  return Markup.inlineKeyboard([
    [Markup.button.webApp('🚀 Купить CASA', siteUrl + '/miniapp')],
    [
      Markup.button.callback('💎 Цена CASA', 'price'),
      Markup.button.callback('📈 Статистика', 'stats')
    ],
    [
      Markup.button.callback('📊 График', 'chart_menu'),
      Markup.button.callback('🏆 Топ холдеров', 'top_holders')
    ],
    [
      Markup.button.callback('📜 Контракт', 'contract'),
      Markup.button.callback('👛 Баланс', 'balance_menu')
    ],
    [
      Markup.button.callback('🔔 Алерт цены', 'alert_menu'),
      Markup.button.callback('🤝 Рефералка', 'referral')
    ],
    [
      Markup.button.callback('🐳 Whale Alerts', 'whale_menu'),
      Markup.button.callback('📰 Новости', 'news_menu')
    ],
    [
      Markup.button.url('🌐 Открыть сайт', siteUrl),
      Markup.button.callback('❓ Помощь', 'help')
    ]
  ]);
}

function backKeyboard(label = '⬅️ В меню') {
  return Markup.inlineKeyboard([[Markup.button.callback(label, 'start')]]);
}

function buyBackKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.webApp('🚀 Купить CASA', getTelegramAppUrl() + '/miniapp')],
    [Markup.button.callback('⬅️ В меню', 'start')]
  ]);
}

function chartPeriodKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('24ч', 'chart_1d'),
      Markup.button.callback('7д', 'chart_7d'),
      Markup.button.callback('30д', 'chart_30d')
    ],
    [Markup.button.callback('⬅️ В меню', 'start')]
  ]);
}

async function replyOrEdit(ctx, text, keyboard) {
  if (ctx.callbackQuery) {
    try {
      return await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
    } catch (error) {
      if (error?.description?.includes('message is not modified')) return null;
      return ctx.replyWithHTML(text, keyboard);
    }
  }
  return ctx.replyWithHTML(text, keyboard);
}

async function setBotCommands(bot) {
  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Главное меню' },
    { command: 'menu', description: 'Главное меню' },
    { command: 'buy', description: 'Купить CASA' },
    { command: 'price', description: 'Текущая цена' },
    { command: 'stats', description: 'Статистика токена' },
    { command: 'chart', description: 'График цены CASA' },
    { command: 'top', description: 'Топ холдеров CASA' },
    { command: 'whale', description: 'Подписка на крупные сделки' },
    { command: 'news', description: 'Подписка на новости CASA' },
    { command: 'contract', description: 'Контракт CASA' },
    { command: 'alerts', description: 'Мой алерт цены' },
    { command: 'cancelalert', description: 'Отменить алерт' },
    { command: 'balance', description: 'Проверить баланс CASA' },
    { command: 'referral', description: 'Реферальная ссылка' }
  ]);
}

function helpText() {
  return (
    '📖 <b>Доступные команды</b>\n\n' +
    '/start — главное меню\n' +
    '/menu — главное меню\n' +
    '/price — текущая цена\n' +
    '/stats — статистика токена\n' +
    '/chart — график цены\n' +
    '/top — топ холдеров\n' +
    '/whale — подписка на крупные сделки\n' +
    '/news — подписка на новости\n' +
    '/contract — информация о контракте\n' +
    '/buy — купить CASA\n' +
    '/alert 0.05 above — алерт на рост цены\n' +
    '/alert 0.03 below — алерт на падение цены\n' +
    '/alerts — мой алерт\n' +
    '/cancelalert — отменить алерт\n' +
    '/balance UQ... — баланс CASA на кошельке\n' +
    '/referral — реферальная ссылка'
  );
}

async function sendHelp(ctx) {
  await replyOrEdit(ctx, helpText(), backKeyboard());
}

async function sendStart(ctx) {
  const address = getCasaAddress();
  const startPayload = ctx.startPayload;

  if (startPayload && startPayload.startsWith('ref_')) {
    const referrerId = Number.parseInt(startPayload.replace('ref_', ''), 10);
    const myId = ctx.from.id;
    if (referrerId && referrerId !== myId) {
      const referral = await botStore.recordReferral(myId, referrerId);
      if (referral.created) {
        try {
          await ctx.telegram.sendMessage(
            referrerId,
            `🎉 По вашей реферальной ссылке зарегистрировался новый пользователь!\nВсего рефералов: ${referral.count}`
          );
        } catch (_) {}
      }
    }
  }

  const text =
    '🏠 <b>CASA Token</b>\n\n' +
    '💎 Токен экосистемы CasaFond на блокчейне TON.\n\n' +
    'Покупайте, отслеживайте цену и статистику прямо здесь.\n\n' +
    '📋 <b>Контракт:</b>\n<code>' + address + '</code>';

  await replyOrEdit(ctx, text, mainKeyboard());
}

async function sendPrice(ctx) {
  try {
    const data = await readApi('/api/price');
    const text =
      '💵 <b>Цена CASA</b>\n\n' +
      '<b>Цена:</b> ' + money(data.price, 6) + '\n' +
      '<b>24ч:</b> ' + percent(data.changePct24h) + '\n' +
      '<b>Обновлено:</b> ' + new Date(data.updatedAt).toLocaleString('ru-RU');

    await replyOrEdit(ctx, text, backKeyboard());
  } catch (error) {
    console.error('Price command failed', error);
    await ctx.reply('⚠️ Не удалось получить цену. Попробуйте позже.');
  }
}

async function sendStats(ctx) {
  try {
    const data = await readApi('/api/stats');
    const text =
      '📊 <b>Статистика CASA</b>\n\n' +
      '<b>Market Cap:</b> ' + money(data.marketCap, 0) + '\n' +
      '<b>FDV:</b> ' + money(data.fdv, 0) + '\n' +
      '<b>Volume 24h:</b> ' + money(data.volume24h, 0) + '\n' +
      '<b>Ликвидность:</b> ' + money(data.liquidityUsd, 0) + '\n' +
      '<b>Сеть:</b> ' + data.network;

    await replyOrEdit(ctx, text, backKeyboard());
  } catch (error) {
    console.error('Stats command failed', error);
    await ctx.reply('⚠️ Не удалось получить статистику. Попробуйте позже.');
  }
}

async function sendContract(ctx) {
  try {
    const data = await readApi('/api/contract');
    const address = data.address || getCasaAddress();
    const text =
      '📋 <b>Контракт CASA</b>\n\n' +
      '<code>' + address + '</code>\n\n' +
      '<b>Сеть:</b> ' + (data.network || 'TON') + '\n' +
      '<b>Стандарт:</b> ' + (data.standard || 'Jetton') + '\n' +
      '<b>Проверен:</b> ' + (data.verified ? '✅ да' : '❌ нет');

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('🔍 Открыть в Tonviewer', 'https://tonviewer.com/' + address)],
      [Markup.button.webApp('🚀 Купить CASA', getTelegramAppUrl() + '/miniapp')],
      [Markup.button.callback('⬅️ В меню', 'start')]
    ]);

    await replyOrEdit(ctx, text, keyboard);
  } catch (error) {
    console.error('Contract command failed', error);
    await ctx.reply('⚠️ Не удалось получить данные контракта.');
  }
}

async function sendChartMenu(ctx) {
  await replyOrEdit(ctx, '📊 <b>График цены CASA</b>\n\nВыберите период:', chartPeriodKeyboard());
}

function normalizeHistory(raw) {
  const points = Array.isArray(raw) ? raw : [];
  return points
    .map(point => ({
      price: Number(point.price),
      ts: Number(point.ts || point.time || point.date || Date.now())
    }))
    .filter(point => Number.isFinite(point.price) && point.price > 0);
}

function chartLabel(ts, period) {
  const date = new Date(ts);
  if (period === '1d') {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

async function loadChartPoints(period) {
  const limits = { '1d': 24, '7d': 60, '30d': 60 };
  const limit = limits[period] || 24;
  const history = normalizeHistory(await readApi('/api/price/history?limit=' + limit));

  if (history.length >= 2) return history;

  const current = await readApi('/api/price');
  const price = Number(current.price);
  if (!Number.isFinite(price) || price <= 0) return [];

  const now = Date.now();
  return [
    { price, ts: now - 60 * 60 * 1000 },
    { price, ts: now }
  ];
}

async function sendChart(ctx, period) {
  const periodLabels = { '1d': '24 часа', '7d': '7 дней', '30d': '30 дней' };

  try {
    const points = await loadChartPoints(period);
    if (points.length < 2) throw new Error('Not enough chart points');

    const labels = points.map(point => chartLabel(point.ts, period));
    const prices = points.map(point => point.price);
    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    const changePct = firstPrice ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
    const isUp = lastPrice >= firstPrice;
    const lineColor = isUp ? '#23c55e' : '#ef4444';
    const fillColor = isUp ? 'rgba(35,197,94,0.18)' : 'rgba(239,68,68,0.18)';

    const chartConfig = {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'CASA/USD',
          data: prices,
          borderColor: lineColor,
          backgroundColor: fillColor,
          borderWidth: 3,
          pointRadius: points.length > 30 ? 0 : 3,
          fill: true,
          tension: 0.35
        }]
      },
      options: {
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: 'CASA Token — ' + (periodLabels[period] || 'график'),
            color: '#ffffff',
            font: { size: 18 }
          }
        },
        scales: {
          x: {
            ticks: { color: '#cbd5e1', maxTicksLimit: 8 },
            grid: { color: 'rgba(148,163,184,0.18)' }
          },
          y: {
            ticks: { color: '#cbd5e1' },
            grid: { color: 'rgba(148,163,184,0.18)' }
          }
        }
      }
    };

    const chartUrl =
      'https://quickchart.io/chart?bkg=%230f172a&w=900&h=460&c=' +
      encodeURIComponent(JSON.stringify(chartConfig));
    const caption =
      `📊 <b>CASA — ${periodLabels[period] || 'график'}</b>\n\n` +
      '<b>Цена:</b> ' + money(lastPrice, 6) + '\n' +
      '<b>Изменение:</b> ' + percent(changePct);

    await ctx.replyWithPhoto(
      { url: chartUrl },
      { caption, parse_mode: 'HTML', ...chartPeriodKeyboard() }
    );
  } catch (error) {
    console.error('Chart command failed', error);
    await replyOrEdit(ctx, '⚠️ Не удалось построить график. Попробуйте позже.', backKeyboard());
  }
}

async function sendTopHolders(ctx) {
  try {
    const address = getCasaAddress();
    const response = await fetch(
      `https://tonapi.io/v2/jettons/${encodeURIComponent(address)}/holders?limit=10`,
      { headers: { Accept: 'application/json' } }
    );

    if (!response.ok) throw new Error('TonAPI holders request failed');

    const data = await response.json();
    const holders = data.addresses || data.holders || [];

    if (!holders.length) {
      await replyOrEdit(ctx, '⚠️ Не удалось загрузить топ холдеров.', backKeyboard());
      return;
    }

    const medals = ['🥇', '🥈', '🥉', '4.', '5.', '6.', '7.', '8.', '9.', '10.'];
    let text = '🏆 <b>Топ 10 холдеров CASA</b>\n\n';

    holders.slice(0, 10).forEach((holder, index) => {
      const rawBalance = holder.balance || holder.amount || holder.jetton_balance;
      const balance = rawBalance
        ? (Number(rawBalance) / 1e9).toLocaleString('en-US', { maximumFractionDigits: 0 })
        : 'н/д';
      const owner = holder.owner?.address || holder.wallet?.address || holder.address || holder.owner || '';
      text += `${medals[index]} <code>${shortAddr(owner)}</code> — <b>${balance} CASA</b>\n`;
    });

    text += '\n<i>Данные: tonapi.io</i>';
    await replyOrEdit(ctx, text, backKeyboard());
  } catch (error) {
    console.error('Top holders command failed', error);
    await replyOrEdit(ctx, '⚠️ Не удалось загрузить топ холдеров. Попробуйте позже.', backKeyboard());
  }
}

async function sendWhaleMenu(ctx) {
  const chatId = ctx.chat?.id || ctx.from?.id;
  const subscribed = await botStore.isSubscribed(chatId, SUBSCRIPTION_WHALE);
  const threshold = getWhaleThreshold();
  const text = subscribed
    ? `🐳 <b>Whale Alerts активны</b>\n\nВы получаете уведомления о крупных переводах CASA от <b>${money(threshold, 0)}</b>.\n\nМожно отключить подписку кнопкой ниже.`
    : `🐳 <b>Whale Alerts</b>\n\nБот будет присылать уведомления, когда видит крупный перевод CASA от <b>${money(threshold, 0)}</b>.\n\nПорог задаётся переменной <code>WHALE_THRESHOLD_USD</code>.`;

  const keyboard = subscribed
    ? Markup.inlineKeyboard([
        [Markup.button.callback('🔕 Отключить Whale Alerts', 'whale_unsub')],
        [Markup.button.callback('⬅️ В меню', 'start')]
      ])
    : Markup.inlineKeyboard([
        [Markup.button.callback('🐳 Подключить Whale Alerts', 'whale_sub')],
        [Markup.button.callback('⬅️ В меню', 'start')]
      ]);

  await replyOrEdit(ctx, text, keyboard);
}

async function sendNewsMenu(ctx) {
  const chatId = ctx.chat?.id || ctx.from?.id;
  const subscribed = await botStore.isSubscribed(chatId, SUBSCRIPTION_NEWS);
  const text = subscribed
    ? '📰 <b>Новости CASA активны</b>\n\nВы подписаны на анонсы проекта, обновления и важные сообщения.'
    : '📰 <b>Новости CASA</b>\n\nПодпишитесь, чтобы получать анонсы проекта, обновления и важные сообщения прямо в Telegram.';

  const keyboard = subscribed
    ? Markup.inlineKeyboard([
        [Markup.button.callback('🔕 Отписаться от новостей', 'news_unsub')],
        [Markup.button.callback('⬅️ В меню', 'start')]
      ])
    : Markup.inlineKeyboard([
        [Markup.button.callback('📰 Подписаться на новости', 'news_sub')],
        [Markup.button.callback('⬅️ В меню', 'start')]
      ]);

  await replyOrEdit(ctx, text, keyboard);
}

function getTransferId(tx) {
  return (
    tx.transaction_id ||
    tx.tx_hash ||
    tx.hash ||
    tx.event_id ||
    tx.trace_id ||
    [tx.timestamp || tx.utime || '', tx.amount || tx.jetton_amount || '', tx.sender?.address || tx.from || '', tx.recipient?.address || tx.to || ''].join(':')
  );
}

function getTransferAmount(tx) {
  const raw = tx.amount || tx.jetton_amount || tx.value || tx.quantity;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return amount / 1e9;
}

async function loadCurrentPrice() {
  if (lastKnownPrice) return lastKnownPrice;
  const data = await readApi('/api/price');
  const price = Number(data.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  lastKnownPrice = price;
  return price;
}

async function checkWhaleTransactions(bot) {
  const subscribers = await botStore.listSubscribers(SUBSCRIPTION_WHALE);
  if (subscribers.length === 0) return;

  try {
    const price = await loadCurrentPrice();
    if (!price) return;

    const address = getCasaAddress();
    const response = await fetch(
      `https://tonapi.io/v2/jettons/${encodeURIComponent(address)}/transfers?limit=20`,
      { headers: { Accept: 'application/json' } }
    );
    if (!response.ok) throw new Error('TonAPI transfers request failed');

    const data = await response.json();
    const transfers = data.events || data.transfers || data.items || [];
    const threshold = getWhaleThreshold();
    const fiveMinutesAgo = Date.now() - ALERT_INTERVAL_MS;

    for (const tx of transfers) {
      const timestamp = Number(tx.timestamp || tx.utime || 0);
      if (timestamp && timestamp * 1000 < fiveMinutesAgo) continue;

      const amount = getTransferAmount(tx);
      const usdValue = amount * price;
      if (usdValue < threshold) continue;

      const txId = getTransferId(tx);
      const isNew = await botStore.rememberWhaleTx(txId);
      if (!isNew) continue;

      const fromAddr = shortAddr(tx.sender?.address || tx.from || tx.source?.address || '');
      const toAddr = shortAddr(tx.recipient?.address || tx.to || tx.destination?.address || '');
      const tonviewerUrl = tx.hash || tx.transaction_id
        ? `https://tonviewer.com/transaction/${encodeURIComponent(tx.hash || tx.transaction_id)}`
        : `https://tonviewer.com/${encodeURIComponent(address)}`;

      const message =
        '🐳 <b>Whale Alert CASA</b>\n\n' +
        '<b>Сумма:</b> ' + compact(amount) + ' CASA\n' +
        '<b>Стоимость:</b> ~' + money(usdValue, 0) + '\n' +
        '<b>Порог:</b> ' + money(threshold, 0) + '\n\n' +
        'От: <code>' + fromAddr + '</code>\n' +
        'Кому: <code>' + toAddr + '</code>\n\n' +
        '<a href="' + tonviewerUrl + '">Открыть в Tonviewer</a>';

      for (const chatId of subscribers) {
        try {
          await bot.telegram.sendMessage(chatId, message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
          });
        } catch (error) {
          console.error('Whale alert delivery failed', error);
        }
      }

      return;
    }
  } catch (error) {
    console.error('Whale check failed', error);
  }
}

async function broadcastNews(bot, title, text, url) {
  const subscribers = await botStore.listSubscribers(SUBSCRIPTION_NEWS);
  if (subscribers.length === 0) return 0;

  const safeTitle = escapeHtml(title).slice(0, 180);
  const safeText = escapeHtml(text).slice(0, 3000);
  let message = `📰 <b>${safeTitle}</b>\n\n${safeText}`;

  if (url && /^https?:\/\//i.test(url)) {
    message += '\n\n<a href="' + escapeHtml(url) + '">Читать полностью</a>';
  }

  let sent = 0;
  for (const chatId of subscribers) {
    try {
      await bot.telegram.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        disable_web_page_preview: false
      });
      sent += 1;
    } catch (error) {
      console.error('News delivery failed', error);
    }
  }
  return sent;
}

async function sendAlertMenu(ctx) {
  const chatId = ctx.chat.id;
  const existing = await botStore.getPriceAlert(chatId);
  const text = existing
    ? `🔔 <b>Ваш алерт активен</b>\n\nУведомлю, когда цена <b>${existing.direction === 'above' ? 'вырастет выше' : 'упадёт ниже'} ${money(existing.price, 6)}</b>.\n\nЧтобы удалить, нажмите «Отменить алерт».`
    : '🔔 <b>Алерт на цену</b>\n\nВведите команду:\n\n<code>/alert 0.05 above</code> — уведомить, когда цена вырастет выше $0.05\n<code>/alert 0.03 below</code> — уведомить, когда цена упадёт ниже $0.03';

  const buttons = existing
    ? [
        [Markup.button.callback('🗑 Отменить алерт', 'alert_cancel')],
        [Markup.button.callback('⬅️ В меню', 'start')]
      ]
    : [
        [Markup.button.callback('💎 Проверить цену', 'price')],
        [Markup.button.callback('⬅️ В меню', 'start')]
      ];

  await replyOrEdit(ctx, text, Markup.inlineKeyboard(buttons));
}

async function cancelAlert(ctx) {
  await botStore.deletePriceAlert(ctx.chat.id);
  const text = '✅ Алерт отменён.';

  if (ctx.callbackQuery) {
    await replyOrEdit(ctx, text, backKeyboard());
    return;
  }

  await ctx.replyWithHTML(text, backKeyboard());
}

async function sendBalanceMenu(ctx) {
  const text =
    '👛 <b>Проверка баланса</b>\n\n' +
    'Введите TON-адрес кошелька командой:\n\n' +
    '<code>/balance UQ...</code>';

  await replyOrEdit(ctx, text, Markup.inlineKeyboard([
    [Markup.button.callback('💎 Цена CASA', 'price'), Markup.button.callback('📈 Статистика', 'stats')],
    [Markup.button.callback('⬅️ В меню', 'start')]
  ]));
}

async function checkBalance(ctx) {
  const parts = ctx.message.text.trim().split(/\s+/);
  const walletAddress = parts[1];

  if (!walletAddress) {
    await ctx.replyWithHTML('⚠️ Укажите адрес: <code>/balance UQ...</code>');
    return;
  }

  try {
    const casaAddress = getCasaAddress();
    const response = await fetch(
      `https://tonapi.io/v2/accounts/${encodeURIComponent(walletAddress)}/jettons/${encodeURIComponent(casaAddress)}`,
      { headers: { Accept: 'application/json' } }
    );

    if (!response.ok) throw new Error('Wallet not found');

    const data = await response.json();
    const balance = data.balance
      ? (Number(data.balance) / 1e9).toLocaleString('en-US', { maximumFractionDigits: 2 })
      : '0';

    await ctx.replyWithHTML(
      '👛 <b>Баланс кошелька</b>\n\n' +
      '<b>Адрес:</b> <code>' + walletAddress.slice(0, 8) + '...' + walletAddress.slice(-6) + '</code>\n' +
      '<b>CASA:</b> ' + balance + ' CASA',
      backKeyboard()
    );
  } catch (error) {
    console.error('Balance command failed', error);
    await ctx.replyWithHTML('⚠️ Не удалось получить баланс.\n\nПроверьте адрес и попробуйте снова.', backKeyboard());
  }
}

async function sendReferral(ctx) {
  const chatId = ctx.from.id;
  const botUsername = ctx.botInfo?.username || 'casafond_bot';
  const refLink = `https://t.me/${botUsername}?start=ref_${chatId}`;
  const shareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(refLink);
  const count = await botStore.countReferrals(chatId);

  const text =
    '👥 <b>Реферальная программа</b>\n\n' +
    'Поделитесь ссылкой и получайте уведомления, когда друзья присоединяются.\n\n' +
    '<b>Ваша ссылка:</b>\n' +
    '<code>' + refLink + '</code>\n\n' +
    '👤 Привлечено рефералов: <b>' + count + '</b>';

  await replyOrEdit(ctx, text, Markup.inlineKeyboard([
    [Markup.button.url('📤 Поделиться ссылкой', shareUrl)],
    [Markup.button.callback('⬅️ В меню', 'start')]
  ]));
}

async function checkPriceAlerts(bot) {
  const alerts = await botStore.listPriceAlerts();
  if (alerts.length === 0) return;

  let currentPrice;
  try {
    const data = await readApi('/api/price');
    currentPrice = Number(data.price);
    if (Number.isFinite(currentPrice) && currentPrice > 0) lastKnownPrice = currentPrice;
    if (!Number.isFinite(currentPrice)) return;
  } catch (error) {
    console.error('Price alert check failed', error);
    return;
  }

  for (const alert of alerts) {
    const triggered =
      (alert.direction === 'above' && currentPrice >= alert.price) ||
      (alert.direction === 'below' && currentPrice <= alert.price);

    if (!triggered) continue;

    await botStore.deletePriceAlert(alert.chatId);
    try {
      await bot.telegram.sendMessage(
        alert.chatId,
        `🔔 <b>Алерт сработал!</b>\n\nЦена CASA достигла <b>$${currentPrice.toFixed(6)}</b>\n\nПорог: ${alert.direction === 'above' ? 'выше' : 'ниже'} $${alert.price}`,
        { parse_mode: 'HTML', ...mainKeyboard() }
      );
    } catch (error) {
      console.error('Price alert delivery failed', error);
    }
  }
}

function createBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('Telegram bot disabled: TELEGRAM_BOT_TOKEN is not configured.');
    return null;
  }

  const bot = new Telegraf(token);

  bot.start(sendStart);
  bot.command('menu', sendStart);
  bot.command('price', sendPrice);
  bot.command('stats', sendStats);
  bot.command('chart', sendChartMenu);
  bot.command('top', sendTopHolders);
  bot.command('whale', sendWhaleMenu);
  bot.command('news', sendNewsMenu);
  bot.command('contract', sendContract);
  bot.command('balance', checkBalance);
  bot.command('referral', sendReferral);
  bot.command('alerts', sendAlertMenu);
  bot.command('cancelalert', cancelAlert);

  bot.command('buy', async (ctx) => {
    await ctx.replyWithHTML(
      '🛒 <b>Покупка CASA</b>\n\nНажмите кнопку, подключите TON-кошелёк и подтвердите обмен.',
      buyBackKeyboard()
    );
  });

  bot.command('alert', async (ctx) => {
    const parts = ctx.message.text.trim().split(/\s+/);
    const price = Number.parseFloat(parts[1]);
    const direction = parts[2];

    if (!Number.isFinite(price) || price <= 0 || !['above', 'below'].includes(direction)) {
      await ctx.replyWithHTML('⚠️ Формат: <code>/alert 0.05 above</code> или <code>/alert 0.03 below</code>');
      return;
    }

    await botStore.setPriceAlert(ctx.chat.id, { price, direction });
    const directionText = direction === 'above' ? 'вырастет выше' : 'упадёт ниже';
    await ctx.replyWithHTML(`🔔 Алерт установлен!\n\nУведомлю вас, когда CASA <b>${directionText} $${price}</b>.`, backKeyboard());
  });

  bot.help(sendHelp);

  bot.action('start', async (ctx) => {
    await ctx.answerCbQuery();
    await sendStart(ctx);
  });
  bot.action('price', async (ctx) => {
    await ctx.answerCbQuery();
    await sendPrice(ctx);
  });
  bot.action('stats', async (ctx) => {
    await ctx.answerCbQuery();
    await sendStats(ctx);
  });
  bot.action('chart_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await sendChartMenu(ctx);
  });
  bot.action('top_holders', async (ctx) => {
    await ctx.answerCbQuery();
    await sendTopHolders(ctx);
  });
  bot.action('whale_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await sendWhaleMenu(ctx);
  });
  bot.action('news_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await sendNewsMenu(ctx);
  });
  bot.action('chart_1d', async (ctx) => {
    await ctx.answerCbQuery();
    await sendChart(ctx, '1d');
  });
  bot.action('chart_7d', async (ctx) => {
    await ctx.answerCbQuery();
    await sendChart(ctx, '7d');
  });
  bot.action('chart_30d', async (ctx) => {
    await ctx.answerCbQuery();
    await sendChart(ctx, '30d');
  });
  bot.action('contract', async (ctx) => {
    await ctx.answerCbQuery();
    await sendContract(ctx);
  });
  bot.action('alert_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await sendAlertMenu(ctx);
  });
  bot.action('balance_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await sendBalanceMenu(ctx);
  });
  bot.action('referral', async (ctx) => {
    await ctx.answerCbQuery();
    await sendReferral(ctx);
  });
  bot.action('help', async (ctx) => {
    await ctx.answerCbQuery();
    await sendHelp(ctx);
  });
  bot.action('alert_cancel', async (ctx) => {
    await ctx.answerCbQuery();
    await cancelAlert(ctx);
  });
  bot.action('whale_sub', async (ctx) => {
    await ctx.answerCbQuery();
    await botStore.subscribe(ctx.chat.id, SUBSCRIPTION_WHALE);
    await replyOrEdit(ctx, '🐳 <b>Whale Alerts подключены.</b>\n\nБот пришлёт уведомление, когда увидит крупное движение CASA.', backKeyboard());
  });
  bot.action('whale_unsub', async (ctx) => {
    await ctx.answerCbQuery();
    await botStore.unsubscribe(ctx.chat.id, SUBSCRIPTION_WHALE);
    await replyOrEdit(ctx, '🔕 Whale Alerts отключены.', backKeyboard());
  });
  bot.action('news_sub', async (ctx) => {
    await ctx.answerCbQuery();
    await botStore.subscribe(ctx.chat.id, SUBSCRIPTION_NEWS);
    await replyOrEdit(ctx, '📰 <b>Подписка на новости активна.</b>\n\nБудем присылать важные анонсы CASA.', backKeyboard());
  });
  bot.action('news_unsub', async (ctx) => {
    await ctx.answerCbQuery();
    await botStore.unsubscribe(ctx.chat.id, SUBSCRIPTION_NEWS);
    await replyOrEdit(ctx, '🔕 Вы отписались от новостей CASA.', backKeyboard());
  });

  bot.catch((error, ctx) => {
    console.error('Telegram bot error', error);
    const message = process.env.NODE_ENV === 'production'
      ? '⚠️ Временная ошибка. Попробуйте ещё раз.'
      : 'Ошибка: ' + (error?.description || error?.message || 'unknown');
    if (ctx?.reply) ctx.reply(message).catch(() => {});
  });

  return bot;
}

function attachTelegramBot(app) {
  const bot = createBot();
  if (!bot) return null;
  botStore.initBotStore().catch(error => console.error('Bot store init failed', error));

  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || 'telegram-webhook';
  const adminSecret = process.env.TELEGRAM_ADMIN_SECRET;
  const webhookPath = '/telegram/webhook/' + webhookSecret;
  const isProduction = process.env.NODE_ENV === 'production';
  const pollingEnabled = process.env.TELEGRAM_BOT_POLLING === 'true';
  const webhookUrl = getPublicUrl() + webhookPath;

  setBotCommands(bot).catch(error => console.error('Telegram command setup failed', error));

  function hasAdminAccess(req) {
    if (!adminSecret) return !isProduction;
    return req.query.secret === adminSecret;
  }

  app.post(webhookPath, async (req, res) => {
    try {
      await bot.handleUpdate(req.body);
      res.sendStatus(200);
    } catch (error) {
      console.error('Telegram webhook error', error);
      res.sendStatus(500);
    }
  });

  app.post('/api/telegram/set-webhook', async (req, res) => {
    if (!hasAdminAccess(req)) {
      res.status(403).json({ ok: false, error: 'Forbidden' });
      return;
    }

    const result = await bot.telegram.setWebhook(webhookUrl);
    res.json({ ok: true, data: { webhookUrl, result } });
  });

  app.get('/api/telegram/webhook-info', async (req, res) => {
    if (!hasAdminAccess(req)) {
      res.status(403).json({ ok: false, error: 'Forbidden' });
      return;
    }

    const info = await bot.telegram.getWebhookInfo();
    res.json({ ok: true, data: info });
  });

  app.get('/api/telegram/status', async (req, res) => {
    if (!hasAdminAccess(req)) {
      res.status(403).json({ ok: false, error: 'Forbidden' });
      return;
    }

    const [me, info] = await Promise.all([
      bot.telegram.getMe(),
      bot.telegram.getWebhookInfo()
    ]);

    res.json({
      ok: true,
      data: {
        bot: {
          id: me.id,
          username: me.username,
          firstName: me.first_name,
          canJoinGroups: me.can_join_groups
        },
        expectedWebhookUrl: webhookUrl,
        actualWebhookUrl: info.url,
        pendingUpdateCount: info.pending_update_count,
        lastErrorDate: info.last_error_date,
        lastErrorMessage: info.last_error_message,
        activeAlerts: await botStore.countPriceAlerts(),
        subscribers: {
          whale: await botStore.countSubscribers(SUBSCRIPTION_WHALE),
          news: await botStore.countSubscribers(SUBSCRIPTION_NEWS)
        },
        whaleThresholdUsd: getWhaleThreshold()
      }
    });
  });

  app.post('/api/telegram/broadcast-news', async (req, res) => {
    if (!hasAdminAccess(req)) {
      res.status(403).json({ ok: false, error: 'Forbidden' });
      return;
    }

    const { title, text, url } = req.body || {};
    if (!title || !text) {
      res.status(400).json({ ok: false, error: 'title and text are required' });
      return;
    }

    try {
      const sent = await broadcastNews(bot, title, text, url);
      res.json({ ok: true, data: { sent, total: await botStore.countSubscribers(SUBSCRIPTION_NEWS) } });
    } catch (error) {
      console.error('Broadcast news failed', error);
      res.status(500).json({ ok: false, error: 'Broadcast failed' });
    }
  });

  const alertTimer = setInterval(async () => {
    await checkPriceAlerts(bot);
    await checkWhaleTransactions(bot);
  }, ALERT_INTERVAL_MS);

  if (pollingEnabled) {
    bot.launch()
      .then(() => console.log('Telegram bot polling started.'))
      .catch(error => console.error('Telegram bot polling failed', error));

    const stop = signal => {
      clearInterval(alertTimer);
      bot.stop(signal);
      process.exit(0);
    };

    process.once('SIGINT', () => stop('SIGINT'));
    process.once('SIGTERM', () => stop('SIGTERM'));
  } else if (isHttpsPublicUrl(getPublicUrl())) {
    bot.telegram.setWebhook(webhookUrl)
      .then(() => console.log('Telegram webhook configured:', webhookUrl))
      .catch(error => console.error('Telegram webhook setup failed', error));
  } else {
    console.warn('Telegram webhook not configured: PUBLIC_URL must be HTTPS or set TELEGRAM_BOT_POLLING=true');
  }

  return {
    bot,
    webhookPath,
    checkPriceAlerts: () => checkPriceAlerts(bot),
    checkWhaleTransactions: () => checkWhaleTransactions(bot),
    broadcastNews: (title, text, url) => broadcastNews(bot, title, text, url)
  };
}

module.exports = { attachTelegramBot, createBot };
