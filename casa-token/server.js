const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const indexRouter = require('./routes');
const apiRouter = require('./routes/api');
const priceEngine = require('./priceEngine');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

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

priceEngine.start();

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`CASA Token site running at http://localhost:${port}`);
});
