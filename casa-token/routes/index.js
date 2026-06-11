const path = require('path');
const express = require('express');

const router = express.Router();

function sendHtml(res, fileName) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('CDN-Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Cloudflare-CDN-Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, '..', 'views', fileName));
}

router.get(['/', '/buy'], (req, res) => {
  sendHtml(res, 'index.html');
});

router.get('/miniapp', (req, res) => {
  sendHtml(res, 'miniapp.html');
});

module.exports = router;
