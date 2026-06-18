const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

const indexRouter = require('./routes');
const apiRouter = require('./routes/api');
const priceEngine = require('./priceEngine');
const { attachTelegramBot } = require('./bot');

const app = express();
const PRODUCTION_PUBLIC_URL = 'https://www.casafond.com';

function isLocalhostUrl(url) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|$)/i.test(url);
}

function normalizePublicUrl(url) {
  return url
    .replace(/\/$/, '')
    .replace('https://casafond.com', PRODUCTION_PUBLIC_URL)
    .replace('http://casafond.com', PRODUCTION_PUBLIC_URL)
    .replace('http://www.casafond.com', PRODUCTION_PUBLIC_URL);
}

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (
      filePath.includes(`${path.sep}vendor${path.sep}`) ||
      filePath.endsWith(`${path.sep}wallets-v2.json`) ||
      filePath.endsWith(`${path.sep}wallets-mini.json`)
    ) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      // Versioned via ?v= query string — safe for longer cache
      res.setHeader('Cache-Control', 'public, max-age=604800');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

function getPublicOrigin(req) {
  const requestHost = req.get('host') || '';
  const requestOrigin = requestHost.includes('casafond.com')
    ? PRODUCTION_PUBLIC_URL
    : `${req.protocol}://${requestHost}`;
  const configuredOrigin = process.env.PUBLIC_URL ? normalizePublicUrl(process.env.PUBLIC_URL) : '';
  const origin = !configuredOrigin || isLocalhostUrl(configuredOrigin)
    ? normalizePublicUrl(requestOrigin)
    : configuredOrigin;

  if (process.env.NODE_ENV === 'production' && isLocalhostUrl(origin)) {
    return PRODUCTION_PUBLIC_URL;
  }
  return origin;
}

function sendTonConnectManifest(req, res, name, urlPath = '') {
  const origin = getPublicOrigin(req);

  res.setHeader('Cache-Control', 'public, max-age=86400');

  res.json({
    url: `${origin}${urlPath}`,
    name,
    iconUrl: `${origin}/img/casa-icon-180.png`
  });
}

app.get('/tonconnect-manifest.json', (req, res) => {
  sendTonConnectManifest(req, res, 'CasaFond');
});

app.get('/tonconnect-site-manifest.json', (req, res) => {
  sendTonConnectManifest(req, res, 'CasaFond Site');
});

app.get('/tonconnect-miniapp-manifest.json', (req, res) => {
  sendTonConnectManifest(req, res, 'CasaFond Mini App', '/miniapp');
});

app.get('/api/dapp/config', (req, res) => {
  const origin = getPublicOrigin(req);
  const isLocalhost = isLocalhostUrl(origin);
  const isHttps = origin.startsWith('https://');

  res.json({
    ok: true,
    data: {
      publicUrl: origin,
      manifestUrl: `${origin}/tonconnect-site-manifest.json`,
      miniAppManifestUrl: `${origin}/tonconnect-miniapp-manifest.json`,
      tonConnectReady: isHttps && !isLocalhost,
      warnings: [
        ...(isLocalhost ? ['PUBLIC_URL points to localhost. Mobile wallets cannot fetch localhost from a scanned QR.'] : []),
        ...(!isHttps ? ['PUBLIC_URL must be HTTPS for reliable TON Connect wallet manifest loading.'] : [])
      ]
    }
  });
});

app.use('/', indexRouter);
app.use('/api', apiRouter);
attachTelegramBot(app);

priceEngine.start();

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
