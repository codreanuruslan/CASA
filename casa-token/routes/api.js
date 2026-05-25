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
const { StonApiClient } = require('@ston-fi/api');
const { dexFactory, Client } = require('@ston-fi/sdk');
const priceEngine = require('../priceEngine');

const router = express.Router();
const stonApi = new StonApiClient();
const tonClient = new Client({
  endpoint: process.env.TON_RPC_ENDPOINT || 'https://toncenter.com/api/v2/jsonRPC'
});
const CASA_JETTON_ADDRESS = 'EQBWK_VVEBJWiIQIIXOckUVw0HdF24buJiNiiR0dUHEe2xs4';

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
  TON: {
    symbol: 'TON',
    name: 'Toncoin',
    decimals: 9,
    address: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    address: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs'
  },
  CASA: {
    symbol: 'CASA',
    name: 'CASA Token',
    decimals: 9,
    address: process.env.CASA_JETTON_ADDRESS || CASA_JETTON_ADDRESS
  }
};

const SWAP_FEE_RATE = 0.003;
const DEFAULT_SLIPPAGE = 0.5;
const MIN_SWAP_AMOUNT = 0.000001;
const PRICE_CACHE_TTL = 15_000;
let casaPriceCache = null;

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
      contract: process.env.CONTRACT_ADDRESS || CASA_JETTON_ADDRESS
    }
  });
});

router.get('/price', async (req, res) => {
  const data = await getCasaPrice();

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

router.get('/stats', async (req, res) => {
  const { price } = await getCasaPrice();
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
      address: process.env.CONTRACT_ADDRESS || CASA_JETTON_ADDRESS,
      network: BASE_STATS.network,
      standard: BASE_STATS.standard,
      verified: true,
      auditUrl: 'https://github.com/casa-token/audit'
    }
  });
});

function decimalToUnits(value, decimals) {
  const normalized = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const [whole, fraction = ''] = normalized.split('.');
  const paddedFraction = (fraction + '0'.repeat(decimals)).slice(0, decimals);
  return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt(paddedFraction || '0')).toString();
}

function unitsToDecimal(units, decimals) {
  const value = BigInt(units || '0');
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return Number(whole.toString() + (fraction ? '.' + fraction : ''));
}

function getProvider() {
  return (process.env.DEX_PROVIDER || 'stonfi').toLowerCase();
}

function getToken(symbol) {
  const token = SWAP_TOKENS[symbol];
  if (!token) return null;
  if (symbol === 'CASA') {
    return { ...token, address: process.env.CASA_JETTON_ADDRESS || token.address };
  }
  return token;
}

function getStonConfigError(fromSymbol, toSymbol) {
  const fromToken = getToken(fromSymbol);
  const toToken = getToken(toSymbol);
  if (!fromToken || !toToken) return 'Unsupported token pair';
  if (!fromToken.address) return `${fromSymbol} address is not configured`;
  if (!toToken.address) return `${toSymbol} address is not configured`;
  return null;
}

async function buildStonFiQuote({ from, to, amount, slippage = DEFAULT_SLIPPAGE }) {
  const fromSymbol = String(from || '').toUpperCase();
  const toSymbol = String(to || '').toUpperCase();
  const numericAmount = Number(amount);
  const numericSlippage = Number(slippage);

  if (fromSymbol === toSymbol) return { error: 'Choose different tokens' };
  if (!Number.isFinite(numericAmount) || numericAmount < MIN_SWAP_AMOUNT) return { error: 'Enter a valid amount' };
  if (!Number.isFinite(numericSlippage) || numericSlippage < 0.1 || numericSlippage > 5) {
    return { error: 'Slippage must be between 0.1% and 5%' };
  }

  const configError = getStonConfigError(fromSymbol, toSymbol);
  if (configError) return { error: configError, code: 'TOKEN_NOT_CONFIGURED' };

  const fromToken = getToken(fromSymbol);
  const toToken = getToken(toSymbol);
  const offerUnits = decimalToUnits(amount, fromToken.decimals);
  if (!offerUnits || BigInt(offerUnits) <= 0n) return { error: 'Enter a valid amount' };

  try {
    const simulation = await stonApi.simulateSwap({
      offerAddress: fromToken.address,
      askAddress: toToken.address,
      offerUnits,
      slippageTolerance: String(numericSlippage / 100),
      dexV2: true
    });

    const estimatedAmount = unitsToDecimal(simulation.askUnits, toToken.decimals);
    const minimumReceived = unitsToDecimal(simulation.minAskUnits || simulation.recommendedMinAskUnits, toToken.decimals);
    const feeAmount = unitsToDecimal(simulation.feeUnits, toToken.decimals);

    return {
      from: fromSymbol,
      to: toSymbol,
      amount: parseFloat(numericAmount.toFixed(9)),
      estimatedAmount,
      minimumReceived,
      feeRate: Number(simulation.feePercent || 0),
      feeAmount,
      slippage: parseFloat(numericSlippage.toFixed(2)),
      priceImpact: parseFloat(Number(simulation.priceImpact || 0).toFixed(4)),
      route: [fromSymbol, toSymbol],
      provider: 'STON.fi',
      simulated: false,
      source: 'stonfi',
      routerAddress: simulation.routerAddress,
      poolAddress: simulation.poolAddress,
      offerUnits: simulation.offerUnits,
      askUnits: simulation.askUnits,
      minAskUnits: simulation.minAskUnits,
      swapRate: simulation.swapRate,
      recommendedSlippageTolerance: simulation.recommendedSlippageTolerance,
      gasParams: simulation.gasParams,
      updatedAt: Date.now()
    };
  } catch (error) {
    if (fromSymbol !== 'TON' && toSymbol !== 'TON') {
      const viaTonQuote = await buildStonFiMultiHopQuote({
        fromSymbol,
        toSymbol,
        amount: numericAmount,
        slippage: numericSlippage
      });
      if (!viaTonQuote.error) return viaTonQuote;
    }

    return {
      error: 'STON.fi quote is unavailable for this pair or amount',
      code: 'STONFI_QUOTE_FAILED',
      details: error.message
    };
  }
}

function senderArgsToTonConnectTransaction(txParams) {
  return {
    validUntil: Math.floor(Date.now() / 1000) + 300,
    messages: [
      {
        address: txParams.to.toString(),
        amount: txParams.value.toString(),
        payload: txParams.body?.toBoc().toString('base64')
      }
    ]
  };
}

async function buildStonFiTransaction({ from, to, amount, slippage = DEFAULT_SLIPPAGE, walletAddress }) {
  const fromSymbol = String(from || '').toUpperCase();
  const toSymbol = String(to || '').toUpperCase();
  const numericAmount = Number(amount);
  const numericSlippage = Number(slippage);

  if (!walletAddress) return { error: 'Connect TON wallet first' };
  if (fromSymbol === toSymbol) return { error: 'Choose different tokens' };
  if (!Number.isFinite(numericAmount) || numericAmount < MIN_SWAP_AMOUNT) return { error: 'Enter a valid amount' };

  const configError = getStonConfigError(fromSymbol, toSymbol);
  if (configError) return { error: configError, code: 'TOKEN_NOT_CONFIGURED' };

  const fromToken = getToken(fromSymbol);
  const toToken = getToken(toSymbol);
  const offerUnits = decimalToUnits(amount, fromToken.decimals);
  if (!offerUnits || BigInt(offerUnits) <= 0n) return { error: 'Enter a valid amount' };

  const simulation = await stonApi.simulateSwap({
    offerAddress: fromToken.address,
    askAddress: toToken.address,
    offerUnits,
    slippageTolerance: String(numericSlippage / 100),
    dexV2: true
  });

  const dexContracts = dexFactory(simulation.router);
  const routerContract = tonClient.open(dexContracts.Router.create(simulation.router.address));
  const proxyTon = dexContracts.pTON.create(simulation.router.ptonMasterAddress);
  const commonParams = {
    userWalletAddress: walletAddress,
    receiverAddress: walletAddress,
    refundAddress: walletAddress,
    excessesAddress: walletAddress,
    offerAmount: BigInt(simulation.offerUnits),
    minAskAmount: BigInt(simulation.minAskUnits || simulation.recommendedMinAskUnits)
  };

  let txParams;
  if (fromSymbol === 'TON') {
    txParams = await routerContract.getSwapTonToJettonTxParams({
      ...commonParams,
      proxyTon,
      askJettonAddress: toToken.address,
      askJettonWalletAddress: simulation.askJettonWallet
    });
  } else if (toSymbol === 'TON') {
    txParams = await routerContract.getSwapJettonToTonTxParams({
      ...commonParams,
      offerJettonAddress: fromToken.address,
      offerJettonWalletAddress: simulation.offerJettonWallet,
      askJettonWalletAddress: simulation.askJettonWallet,
      proxyTon
    });
  } else {
    txParams = await routerContract.getSwapJettonToJettonTxParams({
      ...commonParams,
      offerJettonAddress: fromToken.address,
      offerJettonWalletAddress: simulation.offerJettonWallet,
      askJettonAddress: toToken.address,
      askJettonWalletAddress: simulation.askJettonWallet
    });
  }

  return {
    transaction: senderArgsToTonConnectTransaction(txParams),
    simulation
  };
}

async function buildStonFiMultiHopQuote({ fromSymbol, toSymbol, amount, slippage }) {
  const firstHop = await buildStonFiQuote({ from: fromSymbol, to: 'TON', amount, slippage });
  if (firstHop.error) return firstHop;

  const secondHop = await buildStonFiQuote({
    from: 'TON',
    to: toSymbol,
    amount: firstHop.estimatedAmount,
    slippage
  });
  if (secondHop.error) return secondHop;

  return {
    from: fromSymbol,
    to: toSymbol,
    amount: firstHop.amount,
    estimatedAmount: secondHop.estimatedAmount,
    minimumReceived: secondHop.minimumReceived,
    feeRate: firstHop.feeRate + secondHop.feeRate,
    feeAmount: secondHop.feeAmount,
    slippage,
    priceImpact: parseFloat((firstHop.priceImpact + secondHop.priceImpact).toFixed(4)),
    route: [fromSymbol, 'TON', toSymbol],
    provider: 'STON.fi',
    simulated: false,
    source: 'stonfi',
    hops: [firstHop, secondHop],
    updatedAt: Date.now()
  };
}

async function getCasaPrice() {
  const now = Date.now();
  if (casaPriceCache && now - casaPriceCache.updatedAt < PRICE_CACHE_TTL) return casaPriceCache;

  const casaToken = getToken('CASA');
  if (getProvider() === 'stonfi' && casaToken.address) {
    const quote = await buildStonFiQuote({ from: 'CASA', to: 'USDT', amount: '1', slippage: DEFAULT_SLIPPAGE });
    if (!quote.error && Number.isFinite(quote.estimatedAmount) && quote.estimatedAmount > 0) {
      const fallback = priceEngine.getPrice();
      casaPriceCache = {
        price: quote.estimatedAmount,
        change24h: fallback.change24h,
        changePct24h: fallback.changePct24h,
        updatedAt: now,
        source: 'stonfi'
      };
      return casaPriceCache;
    }
  }

  return { ...priceEngine.getPrice(), source: 'simulated' };
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

  const fromUsd = fromSymbol === 'CASA' ? priceEngine.getPrice().price : (fromSymbol === 'TON' ? 1.8 : 1);
  const toUsd = toSymbol === 'CASA' ? priceEngine.getPrice().price : (toSymbol === 'TON' ? 1.8 : 1);
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
  res.json({ ok: true, data: Object.keys(SWAP_TOKENS).map(getToken) });
});

router.get('/swap/config', (req, res) => {
  const provider = getProvider();
  const configured = provider === 'stonfi'
    ? Boolean(getToken('CASA').address)
    : provider === 'dedust'
      ? Boolean(process.env.DEDUST_FACTORY_ADDRESS && getToken('CASA').address)
      : false;

  res.json({
    ok: true,
    data: {
      provider,
      configured,
      tonConnect: true,
      supportedProviders: ['stonfi', 'dedust', 'demo'],
      message: configured
        ? 'Production quotes are enabled.'
        : 'Production DEX quote provider is not fully configured. Set DEX_PROVIDER=stonfi and CASA_JETTON_ADDRESS.'
    }
  });
});

async function getQuote(params) {
  if (getProvider() === 'stonfi') return buildStonFiQuote(params);
  return buildSwapQuote(params);
}

router.get('/swap/quote', async (req, res) => {
  const quote = await getQuote(req.query);
  if (quote.error) {
    res.status(quote.code === 'STONFI_QUOTE_FAILED' ? 502 : 400).json({
      ok: false,
      code: quote.code,
      error: quote.error,
      details: quote.details
    });
    return;
  }

  res.json({ ok: true, data: quote });
});

router.post('/swap/prepare', async (req, res) => {
  const quote = await getQuote(req.body);
  if (quote.error) {
    res.status(quote.code === 'STONFI_QUOTE_FAILED' ? 502 : 400).json({
      ok: false,
      code: quote.code,
      error: quote.error,
      details: quote.details
    });
    return;
  }

  const provider = getProvider();
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

  if (provider === 'stonfi') {
    if (quote.hops?.length) {
      res.status(501).json({
        ok: false,
        code: 'MULTIHOP_TX_PENDING',
        data: {
          quote,
          provider,
          walletAddress,
          nextStep: 'This quote uses multiple STON.fi hops. Execute direct TON/CASA swaps first or implement multi-message route execution.'
        },
        error: 'Multi-hop transaction builder is pending'
      });
      return;
    }

    try {
      const built = await buildStonFiTransaction({ ...req.body, walletAddress });
      if (built.error) {
        res.status(400).json({ ok: false, code: built.code, error: built.error });
        return;
      }

      res.json({
        ok: true,
        data: {
          quote,
          provider,
          walletAddress,
          transaction: built.transaction,
          status: 'ready'
        }
      });
    } catch (error) {
      res.status(502).json({
        ok: false,
        code: 'STONFI_TX_BUILD_FAILED',
        data: { quote, provider, walletAddress },
        error: 'Failed to build STON.fi transaction',
        details: error.message
      });
    }
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
