/**
 * routes/api.js
 * REST API for the CASA Token landing page.
 *
 * GET /api/price         - current price and 24h change
 * GET /api/price/history - latest price history ticks
 * GET /api/stats         - market statistics
 * GET /api/tokenomics    - token distribution
 * GET /api/contract      - contract address
 * GET /api/swap/quote    - simulated exchange quote
 * POST /api/swap/prepare - prepare DEX swap transaction
 * POST /api/swap         - simulated exchange execution
 */

const express = require('express');
const priceEngine = require('../priceEngine');

const router = express.Router();

const BASE_STATS = {
  totalSupply: 1_000_000_000,
  circulatingSupply: 650_000_000,
  holders: 24_891,
  holdersGrowth24h: 847,
  volume24h: 382_000,
  volumeChange24h: -1.2,
  network: 'TON',
  standard: 'Jetton (TEP-74)',
  decimals: 9
};

const SWAP_TOKENS = {
  TON: { symbol: 'TON', name: 'Toncoin', decimals: 9, usdPrice: 6.2 },
  USDT: { symbol: 'USDT', name: 'Tether USD', decimals: 6, usdPrice: 1 },
  CASA: { symbol: 'CASA', name: 'CASA Token', decimals: 9 }
};

const SWAP_FEE_RATE = 0.003;
const DEFAULT_SLIPPAGE = 0.5;
const MIN_SWAP_AMOUNT = 0.000001;

let dynamicHolders = BASE_STATS.holders;

setInterval(() => {
  dynamicHolders += Math.floor(Math.random() * 3);
}, 30_000);

router.get('/health', (req, res) => {
  res.json({ ok: true, status: 'ok' });
});

router.get('/token', (req, res) => {
  res.json({
    ok: true,
    data: {
      name: 'CASA Token',
      ticker: 'CASA',
      network: BASE_STATS.network,
      standard: BASE_STATS.standard,
      totalSupply: BASE_STATS.totalSupply,
      contract: process.env.CONTRACT_ADDRESS || 'EQCxYz9ABC123DEF456GHI789CASA_TON_JETTONxYz9'
    }
  });
});

router.get('/price', (req, res) => {
  const data = priceEngine.getPrice();

  res.json({
    ok: true,
    data: {
      price: data.price,
      change24h: data.change24h,
      changePct24h: data.changePct24h,
      currency: 'USD',
      updatedAt: data.updatedAt
    }
  });
});

router.get('/price/history', (req, res) => {
  const requestedLimit = parseInt(req.query.limit, 10) || 60;
  const limit = Math.min(Math.max(requestedLimit, 1), 200);
  const history = priceEngine.getHistory().slice(-limit);

  res.json({ ok: true, data: history });
});

router.get('/stats', (req, res) => {
  const { price } = priceEngine.getPrice();
  const marketCap = Math.round(price * BASE_STATS.circulatingSupply);
  const fdv = Math.round(price * BASE_STATS.totalSupply);

  res.json({
    ok: true,
    data: {
      price,
      marketCap,
      fdv,
      volume24h: BASE_STATS.volume24h,
      volumeChange24h: BASE_STATS.volumeChange24h,
      holders: dynamicHolders,
      holdersGrowth24h: BASE_STATS.holdersGrowth24h,
      circulatingSupply: BASE_STATS.circulatingSupply,
      totalSupply: BASE_STATS.totalSupply,
      network: BASE_STATS.network,
      standard: BASE_STATS.standard,
      decimals: BASE_STATS.decimals,
      updatedAt: Date.now()
    }
  });
});

router.get('/tokenomics', (req, res) => {
  const distribution = [
    { label: 'Публичная продажа', percent: 40, amount: 400_000_000, color: '#0098EA', vesting: null },
    { label: 'Экосистема', percent: 25, amount: 250_000_000, color: '#00D1FF', vesting: null },
    { label: 'Команда', percent: 20, amount: 200_000_000, color: '#7B61FF', vesting: '24 мес., клифф 6 мес.' },
    { label: 'Маркетинг', percent: 10, amount: 100_000_000, color: '#00FFA3', vesting: null },
    { label: 'Резерв', percent: 5, amount: 50_000_000, color: '#FF6B9D', vesting: null }
  ];

  res.json({
    ok: true,
    data: {
      totalSupply: BASE_STATS.totalSupply,
      ticker: 'CASA',
      distribution
    }
  });
});

router.get('/contract', (req, res) => {
  res.json({
    ok: true,
    data: {
      address: process.env.CONTRACT_ADDRESS || 'EQCxYz9ABC123DEF456GHI789CASA_TON_JETTONxYz9',
      network: BASE_STATS.network,
      standard: BASE_STATS.standard,
      verified: true,
      auditUrl: 'https://github.com/casa-token/audit'
    }
  });
});

function getTokenUsdPrice(symbol) {
  if (symbol === 'CASA') return priceEngine.getPrice().price;
  return SWAP_TOKENS[symbol]?.usdPrice;
}

function buildSwapQuote({ from, to, amount, slippage = DEFAULT_SLIPPAGE }) {
  const fromSymbol = String(from || '').toUpperCase();
  const toSymbol = String(to || '').toUpperCase();
  const numericAmount = Number(amount);
  const numericSlippage = Number(slippage);

  if (!SWAP_TOKENS[fromSymbol] || !SWAP_TOKENS[toSymbol]) {
    return { error: 'Unsupported token pair' };
  }

  if (fromSymbol === toSymbol) {
    return { error: 'Choose different tokens' };
  }

  if (!Number.isFinite(numericAmount) || numericAmount < MIN_SWAP_AMOUNT) {
    return { error: 'Enter a valid amount' };
  }

  if (!Number.isFinite(numericSlippage) || numericSlippage < 0.1 || numericSlippage > 5) {
    return { error: 'Slippage must be between 0.1% and 5%' };
  }

  const fromUsd = getTokenUsdPrice(fromSymbol);
  const toUsd = getTokenUsdPrice(toSymbol);
  const grossToAmount = (numericAmount * fromUsd) / toUsd;
  const feeAmount = grossToAmount * SWAP_FEE_RATE;
  const toAmount = grossToAmount - feeAmount;
  const minimumReceived = toAmount * (1 - numericSlippage / 100);
  const priceImpact = Math.min(2.5, Math.max(0.03, numericAmount * 0.015));

  return {
    from: fromSymbol,
    to: toSymbol,
    amount: parseFloat(numericAmount.toFixed(9)),
    estimatedAmount: parseFloat(toAmount.toFixed(9)),
    minimumReceived: parseFloat(minimumReceived.toFixed(9)),
    feeRate: SWAP_FEE_RATE,
    feeAmount: parseFloat(feeAmount.toFixed(9)),
    slippage: parseFloat(numericSlippage.toFixed(2)),
    priceImpact: parseFloat(priceImpact.toFixed(2)),
    route: [fromSymbol, toSymbol],
    provider: 'CASA Demo Router',
    simulated: true,
    updatedAt: Date.now()
  };
}

router.get('/swap/tokens', (req, res) => {
  res.json({ ok: true, data: Object.values(SWAP_TOKENS) });
});

router.get('/swap/config', (req, res) => {
  const provider = process.env.DEX_PROVIDER || 'demo';
  const configured = provider !== 'demo' && Boolean(
    process.env.STONFI_ROUTER_ADDRESS || process.env.DEDUST_FACTORY_ADDRESS
  );

  res.json({
    ok: true,
    data: {
      provider,
      configured,
      tonConnect: true,
      supportedProviders: ['stonfi', 'dedust', 'demo'],
      message: configured
        ? 'DEX provider configuration is present.'
        : 'DEX provider is not configured yet. Quote and wallet connection are available; blockchain execution is disabled.'
    }
  });
});

router.get('/swap/quote', (req, res) => {
  const quote = buildSwapQuote(req.query);
  if (quote.error) {
    res.status(400).json({ ok: false, error: quote.error });
    return;
  }

  res.json({ ok: true, data: quote });
});

router.post('/swap/prepare', (req, res) => {
  const quote = buildSwapQuote(req.body);
  if (quote.error) {
    res.status(400).json({ ok: false, error: quote.error });
    return;
  }

  const provider = process.env.DEX_PROVIDER || 'demo';
  const walletAddress = req.body.walletAddress;

  if (!walletAddress) {
    res.status(400).json({ ok: false, error: 'Connect TON wallet first' });
    return;
  }

  if (provider === 'demo') {
    res.status(501).json({
      ok: false,
      code: 'DEX_NOT_CONFIGURED',
      data: {
        quote,
        provider,
        walletAddress,
        nextStep: 'Configure STON.fi or DeDust SDK/API route builder and return a valid TonConnect transaction.'
      },
      error: 'DEX execution is not configured yet'
    });
    return;
  }

  res.status(501).json({
    ok: false,
    code: 'DEX_PROVIDER_PENDING',
    data: {
      quote,
      provider,
      walletAddress,
      nextStep: 'Implement provider-specific transaction building here.'
    },
    error: 'Provider transaction builder is pending'
  });
});

router.post('/swap', (req, res) => {
  const quote = buildSwapQuote(req.body);
  if (quote.error) {
    res.status(400).json({ ok: false, error: quote.error });
    return;
  }

  res.json({
    ok: true,
    data: {
      ...quote,
      status: 'simulated',
      txHash: `demo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
      message: 'Swap simulated. Connect a TON wallet and DEX SDK for production execution.'
    }
  });
});

module.exports = router;
