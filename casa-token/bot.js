const { Telegraf, Markup } = require('telegraf');

const DEFAULT_CASA_ADDRESS = 'EQBWK_VVEBJWiIQIIXOckUVw0HdF24buJiNiiR0dUHEe2xs4';

function getPublicUrl() {
  const url = (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
  return url === 'https://casafond.com' ? 'https://www.casafond.com' : url;
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
  return (number >= 0 ? '+' : '') + number.toFixed(2) + '%';
}

function shortAddress(address) {
  if (!address) return '-';
  return address.slice(0, 6) + '...' + address.slice(-6);
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

function actionKeyboard() {
  const siteUrl = getPublicUrl();
  const swapUrl = siteUrl + '/buy?connect=1';
  const address = getCasaAddress();

  return Markup.inlineKeyboard([
    [Markup.button.url('Купить CASA', swapUrl)],
    [
      Markup.button.url('Открыть сайт', siteUrl),
      Markup.button.url('Контракт', 'https://tonviewer.com/' + address)
    ],
    [Markup.button.callback('Цена', 'price'), Markup.button.callback('Статистика', 'stats')]
  ]);
}

async function sendStart(ctx) {
  const address = getCasaAddress();
  await ctx.replyWithHTML(
    '<b>CASA Token</b>\n\n' +
    'Здесь можно проверить цену, статистику и перейти к покупке CASA через TON Connect.\n\n' +
    '<b>Контракт:</b> <code>' + address + '</code>',
    actionKeyboard()
  );
}

async function sendPrice(ctx) {
  const data = await readApi('/api/price');
  await ctx.replyWithHTML(
    '<b>Цена CASA</b>\n\n' +
    '<b>CASA/USD:</b> ' + money(data.price, 6) + '\n' +
    '<b>24ч:</b> ' + percent(data.changePct24h) + '\n' +
    '<b>Обновлено:</b> ' + new Date(data.updatedAt).toLocaleString('ru-RU'),
    actionKeyboard()
  );
}

async function sendStats(ctx) {
  const data = await readApi('/api/stats');
  await ctx.replyWithHTML(
    '<b>Статистика CASA</b>\n\n' +
    '<b>Market cap:</b> ' + money(data.marketCap, 0) + '\n' +
    '<b>FDV:</b> ' + money(data.fdv, 0) + '\n' +
    '<b>Volume 24h:</b> ' + money(data.volume24h, 0) + '\n' +
    '<b>Liquidity:</b> ' + money(data.liquidityUsd, 0) + '\n' +
    '<b>Holders:</b> ' + compact(data.holders) + '\n' +
    '<b>Network:</b> ' + data.network,
    actionKeyboard()
  );
}

async function sendContract(ctx) {
  const data = await readApi('/api/contract');
  const address = data.address || getCasaAddress();
  await ctx.replyWithHTML(
    '<b>Контракт CASA</b>\n\n' +
    '<code>' + address + '</code>\n\n' +
    '<b>Сеть:</b> ' + (data.network || 'TON') + '\n' +
    '<b>Стандарт:</b> ' + (data.standard || 'Jetton') + '\n' +
    '<b>Проверен:</b> ' + (data.verified ? 'да' : 'нет'),
    Markup.inlineKeyboard([
      [Markup.button.url('Открыть в Tonviewer', 'https://tonviewer.com/' + address)],
      [Markup.button.url('Купить CASA', getPublicUrl() + '/buy?connect=1')]
    ])
  );
}

function createBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  const bot = new Telegraf(token);

  bot.start(sendStart);
  bot.command('buy', async (ctx) => {
    await ctx.replyWithHTML(
      '<b>Покупка CASA</b>\n\n' +
      'Нажмите кнопку ниже, подключите TON-кошелек и подтвердите обмен на сайте.',
      actionKeyboard()
    );
  });
  bot.command('price', sendPrice);
  bot.command('stats', sendStats);
  bot.command('contract', sendContract);

  bot.action('price', async (ctx) => {
    await ctx.answerCbQuery();
    await sendPrice(ctx);
  });
  bot.action('stats', async (ctx) => {
    await ctx.answerCbQuery();
    await sendStats(ctx);
  });

  bot.help(async (ctx) => {
    await ctx.reply('/start - меню\n/price - цена\n/stats - статистика\n/contract - контракт\n/buy - купить CASA');
  });

  bot.catch((error, ctx) => {
    console.error('Telegram bot error', error);
    if (ctx?.reply) ctx.reply('Временная ошибка бота. Попробуйте еще раз.').catch(() => {});
  });

  return bot;
}

function attachTelegramBot(app) {
  const bot = createBot();
  if (!bot) return null;

  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || 'telegram-webhook';
  const adminSecret = process.env.TELEGRAM_ADMIN_SECRET;
  const webhookPath = '/telegram/webhook/' + webhookSecret;
  const isProduction = process.env.NODE_ENV === 'production';

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

    const webhookUrl = getPublicUrl() + webhookPath;
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

    const webhookUrl = getPublicUrl() + webhookPath;
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
        lastErrorMessage: info.last_error_message
      }
    });
  });

  return { bot, webhookPath };
}

module.exports = { attachTelegramBot, createBot };
