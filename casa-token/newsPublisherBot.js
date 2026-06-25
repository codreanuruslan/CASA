const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const runOnceOverride = process.env.NEWS_BOT_RUN_ONCE;
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '.env.news'), override: true });
if (runOnceOverride !== undefined) process.env.NEWS_BOT_RUN_ONCE = runOnceOverride;

const DEFAULT_FEEDS = [
  'https://news.google.com/rss/search?q=(site%3Ablog.ton.org%20OR%20site%3Aton.org%20OR%20site%3Acoingecko.com)%20(TON%20OR%20Toncoin%20OR%20%22The%20Open%20Network%22%20OR%20CoinGecko)&hl=en-US&gl=US&ceid=US:en'
];

const DEFAULT_KEYWORDS = [
  'ton',
  'ton community',
  'toncoin',
  'the open network',
  'telegram open network',
  'ton foundation'
];

const DEFAULT_EXCLUDE_KEYWORDS = [
  'buy',
  'price',
  'pricing',
  'value',
  'advice',
  'prediction',
  'forecast',
  'outlook',
  'presale',
  'performing better',
  'venmo',
  'kabul university',
  'blockdag',
  'zcash'
];

const DEFAULT_ALLOWED_SOURCES = [
  'ton',
  'ton blog',
  'ton foundation',
  'the open network',
  'coingecko'
];

const statePath = path.join(__dirname, process.env.NEWS_BOT_STATE_FILE || '.news-bot-state.json');
const intervalMs = Math.max(Number(process.env.NEWS_BOT_INTERVAL_MINUTES || 30), 1) * 60 * 1000;
const maxPostsPerRun = Math.max(Number(process.env.NEWS_BOT_MAX_POSTS_PER_RUN || 2), 1);
const dryRun = process.env.NEWS_BOT_DRY_RUN === 'true';

function listFromEnv(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/');
}

function getTag(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match ? decodeXml(match[1]).trim() : '';
}

function getAtomLink(block) {
  const href = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  if (href) return decodeXml(href[1]).trim();
  return getTag(block, 'link');
}

function normalizeItem(item, sourceUrl) {
  const title = stripTags(getTag(item, 'title'));
  const description = stripTags(getTag(item, 'description') || getTag(item, 'summary') || getTag(item, 'content'));
  const link = getAtomLink(item);
  const guid = stripTags(getTag(item, 'guid') || getTag(item, 'id') || link || title);
  const publishedRaw = getTag(item, 'pubDate') || getTag(item, 'published') || getTag(item, 'updated');
  const publishedDate = publishedRaw ? new Date(publishedRaw) : new Date();
  const publishedAt = Number.isNaN(publishedDate.getTime()) ? new Date().toISOString() : publishedDate.toISOString();

  return {
    id: crypto.createHash('sha256').update(guid || `${title}:${link}`).digest('hex'),
    title,
    description,
    link,
    sourceUrl,
    publishedAt
  };
}

function parseFeed(xml, sourceUrl) {
  const items = [];
  const itemMatches = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];

  for (const item of itemMatches) {
    const parsed = normalizeItem(item, sourceUrl);
    if (parsed.title && parsed.link) items.push(parsed);
  }

  return items;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesKeyword(haystack, keyword) {
  const normalizedKeyword = String(keyword || '').trim().toLowerCase();
  if (!normalizedKeyword) return false;

  if (normalizedKeyword === 'ton') {
    return /(^|[^a-zA-Z0-9])[$#]?TON([^a-zA-Z0-9]|$)/.test(haystack);
  }

  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedKeyword)}([^a-z0-9]|$)`, 'i');
  return pattern.test(haystack.toLowerCase());
}

function matchesKeywords(item, keywords) {
  const haystack = `${item.title} ${item.description}`;
  return keywords.some(keyword => matchesKeyword(haystack, keyword));
}

function getSourceName(item) {
  const title = String(item.title || '');
  const match = title.match(/\s-\s([^-]+)$/);
  return match ? match[1].trim() : '';
}

function matchesAllowedSources(item, allowedSources) {
  if (!allowedSources.length) return true;
  const source = getSourceName(item).toLowerCase();
  return allowedSources.some(allowed => source === String(allowed).trim().toLowerCase());
}

function matchesExcludedKeywords(item, keywords) {
  const haystack = `${item.title} ${item.description}`;
  if (/(^|[^a-z0-9])vs\.?([^a-z0-9]|$)/i.test(haystack)) return true;
  return keywords.some(keyword => matchesKeyword(haystack, keyword));
}

function trimText(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trimEnd() + '...';
}

function displayTitle(item) {
  return String(item.title || '').replace(/\s-\s[^-]+$/, '').trim();
}

function russianTitle(item) {
  const title = displayTitle(item);
  const normalized = title.toLowerCase();

  if (normalized === 'agentic wallets') return 'Агентные кошельки в экосистеме TON';
  if (normalized === 'ton ecosystem') return 'Экосистема TON';
  if (normalized.includes('ton to gram rebrand')) return 'TON и GRAM: официальный ребрендинг';

  return title
    .replace(/\bTON\b/g, 'TON')
    .replace(/\bToncoin\b/g, 'Toncoin')
    .replace(/\bThe Open Network\b/g, 'The Open Network');
}

function cleanDescription(item) {
  const title = displayTitle(item).toLowerCase();
  const source = getSourceName(item).toLowerCase();
  const description = trimText(item.description, 260);
  const normalized = description
    .replace(/\s+/g, ' ')
    .replace(new RegExp(`\\b${escapeRegExp(source)}\\b`, 'ig'), '')
    .trim()
    .toLowerCase();

  if (!description) return '';
  if (normalized === title) return '';
  if (normalized.length < 30) return '';
  return description;
}

function russianDescription(item) {
  const source = getSourceName(item) || 'официальный источник';
  const title = displayTitle(item);
  const normalized = title.toLowerCase();

  if (normalized === 'agentic wallets') {
    return 'TON рассказывает о новом направлении агентных кошельков: инструментах, которые помогают автоматизировать действия пользователя в Web3 и делают работу с крипто-сервисами проще.';
  }

  if (normalized === 'ton ecosystem') {
    return 'Официальный раздел TON об экосистеме The Open Network: кошельках, приложениях, сервисах, инструментах для разработчиков и проектах, которые развивают сеть.';
  }

  if (normalized.includes('ton to gram rebrand')) {
    return 'Официальный материал о переходе TON к бренду GRAM и о том, как это связано с развитием экосистемы The Open Network.';
  }

  const description = cleanDescription(item);
  if (description) return description;

  return `${source} опубликовал официальный материал о развитии TON: продуктах экосистемы, инфраструктуре The Open Network и сервисах, которые делают сеть полезнее для пользователей и разработчиков.`;
}

function telegramText(item) {
  const source = getSourceName(item) || 'TON';
  const title = russianTitle(item);
  const intro = russianDescription(item);

  return [
    `Официальная новость TON`,
    ``,
    `${title}`,
    ``,
    `${intro}`,
    ``,
    `Источник: ${source}`,
    `Подробнее: ${item.link}`
  ].filter(Boolean).join('\n\n');
}

function tweetText(item) {
  const title = trimText(russianTitle(item), 160);
  const intro = trimText(russianDescription(item), 80);
  const tags = process.env.NEWS_BOT_TWEET_TAGS || '#TON #CoinGecko';
  return trimText(`${title}\n\n${intro}\n\n${item.link}\n\n${tags}`, 275);
}

async function readState() {
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    const state = JSON.parse(raw);
    return {
      seen: Array.isArray(state.seen) ? state.seen : []
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { seen: [] };
    throw error;
  }
}

async function writeState(state) {
  const next = {
    seen: Array.from(new Set(state.seen)).slice(-1000)
  };
  await fs.writeFile(statePath, JSON.stringify(next, null, 2));
}

async function fetchFeed(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      'User-Agent': 'CASA-news-publisher/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Feed request failed ${response.status}: ${url}`);
  }

  return response.text();
}

async function findNews() {
  const feedUrls = listFromEnv('NEWS_BOT_FEED_URLS', DEFAULT_FEEDS);
  const keywords = listFromEnv('NEWS_BOT_KEYWORDS', DEFAULT_KEYWORDS);
  const excludeKeywords = listFromEnv('NEWS_BOT_EXCLUDE_KEYWORDS', DEFAULT_EXCLUDE_KEYWORDS);
  const allowedSources = listFromEnv('NEWS_BOT_ALLOWED_SOURCES', DEFAULT_ALLOWED_SOURCES);
  const found = [];

  for (const url of feedUrls) {
    try {
      const xml = await fetchFeed(url);
      found.push(...parseFeed(xml, url));
    } catch (error) {
      console.error(error.message);
    }
  }

  return found
    .filter(item => matchesAllowedSources(item, allowedSources))
    .filter(item => matchesKeywords(item, keywords))
    .filter(item => !matchesExcludedKeywords(item, excludeKeywords))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

async function publishTelegram(item) {
  const token = process.env.TELEGRAM_NEWS_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_NEWS_CHAT_ID;

  if (!token || !chatId) {
    console.warn('Telegram publish skipped: TELEGRAM_NEWS_BOT_TOKEN/TELEGRAM_BOT_TOKEN or TELEGRAM_NEWS_CHAT_ID is missing.');
    return false;
  }

  if (dryRun) {
    console.log('[DRY RUN] Telegram:', telegramText(item));
    return true;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: telegramText(item),
      disable_web_page_preview: false
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram publish failed ${response.status}: ${text}`);
  }

  return true;
}

function oauthEncode(value) {
  return encodeURIComponent(value)
    .replace(/[!*()']/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
}

function oauthHeader(method, url) {
  const consumerKey = process.env.TWITTER_API_KEY;
  const consumerSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;

  if (!consumerKey || !consumerSecret || !accessToken || !accessSecret) return null;

  const oauth = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0'
  };

  const parameters = { ...oauth };
  const parameterString = Object.keys(parameters)
    .sort()
    .map(key => `${oauthEncode(key)}=${oauthEncode(parameters[key])}`)
    .join('&');
  const baseString = [
    method.toUpperCase(),
    oauthEncode(url),
    oauthEncode(parameterString)
  ].join('&');
  const signingKey = `${oauthEncode(consumerSecret)}&${oauthEncode(accessSecret)}`;

  oauth.oauth_signature = crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64');

  return 'OAuth ' + Object.keys(oauth)
    .sort()
    .map(key => `${oauthEncode(key)}="${oauthEncode(oauth[key])}"`)
    .join(', ');
}

async function publishTwitter(item) {
  const url = 'https://api.twitter.com/2/tweets';
  const body = { text: tweetText(item) };
  const authorization = oauthHeader('POST', url);

  if (!authorization) {
    console.warn('Twitter publish skipped: TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, or TWITTER_ACCESS_SECRET is missing.');
    return false;
  }

  if (dryRun) {
    console.log('[DRY RUN] Twitter:', body.text);
    return true;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twitter publish failed ${response.status}: ${text}`);
  }

  return true;
}

async function publishItem(item) {
  const results = await Promise.allSettled([
    publishTelegram(item),
    publishTwitter(item)
  ]);

  for (const result of results) {
    if (result.status === 'rejected') console.error(result.reason.message || result.reason);
  }

  return results.some(result => result.status === 'fulfilled' && result.value);
}

async function runOnce() {
  const state = await readState();
  const seen = new Set(state.seen);
  const news = await findNews();
  const fresh = news.filter(item => !seen.has(item.id)).slice(0, maxPostsPerRun);

  if (fresh.length === 0) {
    console.log('No new matching news found.');
    return;
  }

  for (const item of fresh.reverse()) {
    const published = await publishItem(item);
    if (published && !dryRun) {
      seen.add(item.id);
      console.log('Published:', item.title);
    } else if (published) {
      console.log('Matched in dry run:', item.title);
    }
  }

  if (!dryRun) await writeState({ seen: Array.from(seen) });
}

async function main() {
  await runOnce();

  if (process.env.NEWS_BOT_RUN_ONCE === 'true') return;

  console.log(`News publisher started. Interval: ${Math.round(intervalMs / 60000)} min.`);
  setInterval(() => {
    runOnce().catch(error => console.error('News publisher failed:', error));
  }, intervalMs);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  findNews,
  getSourceName,
  matchesAllowedSources,
  matchesKeywords,
  matchesExcludedKeywords,
  parseFeed,
  runOnce,
  tweetText,
  telegramText
};
