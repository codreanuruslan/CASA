const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const indexRouter = require('./routes');
const apiRouter = require('./routes/api');
const priceEngine = require('./priceEngine');
const { attachTelegramBot } = require('./bot');

const app = express();

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
    if (filePath.includes(`${path.sep}vendor${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

app.get('/tonconnect-manifest.json', (req, res) => {
  const origin = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

  res.json({
    url: origin,
    name: 'CASA Token',
    iconUrl: `${origin}/img/casa-icon-180.png`
  });
});

app.get('/api/dapp/config', (req, res) => {
  const origin = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|$)/i.test(origin);
  const isHttps = origin.startsWith('https://');

  res.json({
    ok: true,
    data: {
      publicUrl: origin,
      manifestUrl: `${origin}/tonconnect-manifest.json`,
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
