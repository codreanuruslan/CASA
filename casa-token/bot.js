const { Telegraf, Markup } = require('telegraf');
const botStore = require('./botStore');

const DEFAULT_CASA_ADDRESS = 'EQBWK_VVEBJWiIQIIXOckUVw0HdF24buJiNiiR0dUHEe2xs4';
const PRODUCTION_PUBLIC_URL = 'https://www.casafond.com';
const ALERT_INTERVAL_MS = 5 * 60 * 1000;

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
      Markup.button.callback('📜 Контракт', 'contract'),
      Markup.button.callback('👛 Баланс', 'balance_menu')
    ],
    [
      Markup.button.callback('🔔 Алерт цены', 'alert_menu'),
      Markup.button.callback('🤝 Рефералка', 'referral')
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
      '<b>Холдеры:</b> ' + compact(data.holders) + '\n' +
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
        activeAlerts: await botStore.countPriceAlerts()
      }
    });
  });

  const alertTimer = setInterval(() => checkPriceAlerts(bot), ALERT_INTERVAL_MS);

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
    checkPriceAlerts: () => checkPriceAlerts(bot)
  };
}

module.exports = { attachTelegramBot, createBot };
