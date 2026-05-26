const path = require('path');
const express = require('express');

const router = express.Router();

router.get(['/', '/buy'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'index.html'));
});

router.get('/miniapp', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'miniapp.html'));
});

module.exports = router;
