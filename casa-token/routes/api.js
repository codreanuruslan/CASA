/**
 * routes/api.js
 * REST API for the CASA Token landing page.
 *
 * GET /api/price         - current price and 24h change
 * GET /api/price/history - latest price history ticks
 * GET /api/stats         - market statistics
 * GET /api/tokenomics    - token distribution
 * GET /api/contract      - contract address
 * GET /api/swap/quote    - production DEX quote
 * POST /api/swap/prepare - prepare DEX swap transaction
 * POST /api/swap         - disabled legacy endpoint
 */

const express = require('express');
const { StonApiClient } = require('@ston-fi/api');
const { dexFactory, Client } = require('@ston-fi/sdk');
const { Address, JettonMaster, TonClient } = require('@ton/ton');
const priceEngine = require('../priceEngine');

const router = express.Router();
const stonApi = new StonApiClient();
const tonClient = new Client({
  endpoint: process.env.TON_RPC_ENDPOINT || 'https://toncenter.com/api/v2/jsonRPC'
});
const chainTonClient = new TonClient({
  endpoint: process.env.TON_RPC_ENDPOINT || 'https://toncenter.com/api/v2/jsonRPC'
});
const CASA_JETTON_ADDRESS = 'EQBWK_VVEBJWiIQIIXOckUVw0HdF24buJiNiiR0dUHEe2xs4';

const TOKEN_META = {
  network: 'GRAMM',
  standard: 'Jetton (TEP-74)',
  decimals: 9
};

const SWAP_TOKENS = {
  GRAMM: {
    symbol: 'GRAMM',
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

const DEFAULT_SLIPPAGE = 0.5;
const MIN_SWAP_AMOUNT = 0.000001;
const PRICE_CACHE_TTL = 15_000;
const STATS_CACHE_TTL = 30_000;
const EXTERNAL_REQUEST_TIMEOUT = 10_000;
let casaPriceCache = null;
let casaStatsCache = null;
let priceUpdatePromise = null;
let statsUpdatePromise = null;

router.get('/health', (req, res) => {
  res.json({ ok: true, status: 'ok' });
});

router.get('/token', async (req, res) => {
  const tokenData = await getCasaTokenData().catch(() => ({ totalSupply: null }));
  res.json({
    ok: true,
    data: {
      name: 'CASA Token',
      ticker: 'CASA',
      network: TOKEN_META.network,
      standard: TOKEN_META.standard,
      totalSupply: tokenData.totalSupply,
      contract: process.env.CONTRACT_ADDRESS || CASA_JETTON_ADDRESS
    }
  });
});

router.get('/price', async (req, res) => {
  try {
    const data = await getCasaPrice();

    res.json({
      ok: true,
      data: {
        price: data.price,
        change24h: data.change24h,
        changePct24h: data.changePct24h,
        currency: 'USD',
        source: data.source,
        stale: Boolean(data.stale),
        updatedAt: data.updatedAt
      }
    });
  } catch (error) {
    res.status(502).json({
      ok: false,
      code: 'CASA_PRICE_UNAVAILABLE',
      error: 'Real CASA price is unavailable',
      details: error.message
    });
  }
});

router.get('/price/history', (req, res) => {
  const requestedLimit = parseInt(req.query.limit, 10) || 60;
  const limit = Math.min(Math.max(requestedLimit, 1), 200);
  const history = priceEngine.getHistory().slice(-limit);

  res.json({ ok: true, data: history });
});

router.get('/stats', async (req, res) => {
  try {
    const data = await getCasaStats();
    res.json({ ok: true, data });
  } catch (error) {
    res.status(502).json({
      ok: false,
      code: 'CASA_STATS_UNAVAILABLE',
      error: 'Real CASA statistics are unavailable',
      details: error.message
    });
  }
});

router.get('/tokenomics', async (req, res) => {
  const tokenData = await getCasaTokenData().catch(() => ({ totalSupply: null }));
  const distribution = [
    { label: 'Публичная продажа', percent: 40, color: '#0098EA', vesting: null },
    { label: 'Экосистема', percent: 25, color: '#00D1FF', vesting: null },
    { label: 'Команда', percent: 20, color: '#7B61FF', vesting: '24 мес., клифф 6 мес.' },
    { label: 'Маркетинг', percent: 10, color: '#00FFA3', vesting: null },
    { label: 'Резерв', percent: 5, color: '#FF6B9D', vesting: null }
  ].map(item => ({
    ...item,
    amount: Number.isFinite(tokenData.totalSupply) ? Math.round(tokenData.totalSupply * item.percent / 100) : null
  }));

  res.json({
    ok: true,
    data: {
      totalSupply: tokenData.totalSupply,
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
      network: TOKEN_META.network,
      standard: TOKEN_META.standard,
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

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || payload.message || `HTTP ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function withTimeout(promise, message) {
  let timeout;
  const timer = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), EXTERNAL_REQUEST_TIMEOUT);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(timeout));
}

async function getCasaTokenData() {
  const casaAddress = getToken('CASA').address;

  try {
    const data = await fetchJson(`https://tonapi.io/v2/jettons/${encodeURIComponent(casaAddress)}`);
    const decimals = parseInt(data.metadata?.decimals, 10) || TOKEN_META.decimals;
    return {
      totalSupply: unitsToDecimal(data.total_supply || '0', decimals),
      holders: numberOrNull(data.holders_count),
      decimals,
      mintable: Boolean(data.mintable),
      verification: data.verification || null,
      source: 'tonapi'
    };
  } catch (tonApiError) {
    const master = chainTonClient.open(JettonMaster.create(Address.parse(casaAddress)));
    const data = await master.getJettonData();
    const decimals = TOKEN_META.decimals;
    return {
      totalSupply: unitsToDecimal(data.totalSupply.toString(), decimals),
      holders: null,
      decimals,
      mintable: Boolean(data.mintable),
      verification: null,
      source: 'toncenter',
      warning: tonApiError.message
    };
  }
}

async function getCasaPools() {
  const casa = getToken('CASA').address;
  const pairAddresses = ['GRAMM', 'USDT']
    .map(symbol => getToken(symbol)?.address)
    .filter(Boolean);

  const settled = await Promise.allSettled(pairAddresses.map(assetAddress =>
    withTimeout(
      stonApi.getPoolsByAssetPair({ asset0Address: casa, asset1Address: assetAddress }),
      'STON.fi pools request timed out'
    )
  ));

  const pools = new Map();
  settled.forEach(result => {
    if (result.status !== 'fulfilled') return;
    result.value.forEach(pool => {
      if (!pool.deprecated) pools.set(pool.address, pool);
    });
  });

  return [...pools.values()];
}

async function updateStatsInBackground() {
  if (statsUpdatePromise) return statsUpdatePromise;
  
  statsUpdatePromise = (async () => {
    try {
      const [priceResult, tokenResult, assetResult, poolsResult] = await Promise.allSettled([
        getCasaPrice(),
        getCasaTokenData(),
        withTimeout(stonApi.getAsset(getToken('CASA').address), 'STON.fi asset request timed out'),
        getCasaPools()
      ]);

      const priceData = priceResult.status === 'fulfilled' ? priceResult.value : null;
      const tokenData = tokenResult.status === 'fulfilled' ? tokenResult.value : {};
      const assetData = assetResult.status === 'fulfilled' ? assetResult.value : {};
      const pools = poolsResult.status === 'fulfilled' ? poolsResult.value : [];
      const price = numberOrNull(priceData?.price);
      const totalSupply = numberOrNull(tokenData.totalSupply);
      const volume24h = pools.reduce((sum, pool) => sum + (numberOrNull(pool.volume24HUsd) || 0), 0);
      const liquidityUsd = pools.reduce((sum, pool) => sum + (numberOrNull(pool.lpTotalSupplyUsd) || 0), 0);
      const fdv = Number.isFinite(price) && Number.isFinite(totalSupply) ? Math.round(price * totalSupply) : null;

      casaStatsCache = {
        price,
        marketCap: null,
        fdv,
        volume24h,
        volumeChange24h: null,
        holders: numberOrNull(tokenData.holders),
        holdersGrowth24h: null,
        circulatingSupply: null,
        totalSupply,
        liquidityUsd,
        pools: pools.map(pool => ({
          address: pool.address,
          token0Address: pool.token0Address,
          token1Address: pool.token1Address,
          reserve0: pool.reserve0,
          reserve1: pool.reserve1,
          volume24HUsd: numberOrNull(pool.volume24HUsd),
          liquidityUsd: numberOrNull(pool.lpTotalSupplyUsd)
        })),
        network: TOKEN_META.network,
        standard: TOKEN_META.standard,
        decimals: numberOrNull(tokenData.decimals) || numberOrNull(assetData.decimals) || TOKEN_META.decimals,
        source: {
          price: priceData?.source || null,
          token: tokenData.source || null,
          asset: assetResult.status === 'fulfilled' ? 'stonfi' : null,
          pools: poolsResult.status === 'fulfilled' ? 'stonfi' : null
        },
        errors: {
          price: priceResult.status === 'rejected' ? priceResult.reason.message : null,
          token: tokenResult.status === 'rejected' ? tokenResult.reason.message : null,
          asset: assetResult.status === 'rejected' ? assetResult.reason.message : null,
          pools: poolsResult.status === 'rejected' ? poolsResult.reason.message : null
        },
        updatedAt: Date.now()
      };
    } catch (error) {
      console.error('Failed to update CASA stats in background:', error.message);
    } finally {
      statsUpdatePromise = null;
    }
  })();
  
  return statsUpdatePromise;
}

async function getCasaStats() {
  const now = Date.now();
  
  if (casaStatsCache) {
    if (now - casaStatsCache.updatedAt >= STATS_CACHE_TTL) {
      updateStatsInBackground().catch(() => {});
    }
    return casaStatsCache;
  }

  await updateStatsInBackground();
  if (casaStatsCache) return casaStatsCache;
  
  throw new Error('Failed to fetch initial stats');
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
    const simulation = await withTimeout(stonApi.simulateSwap({
      offerAddress: fromToken.address,
      askAddress: toToken.address,
      offerUnits,
      slippageTolerance: String(numericSlippage / 100),
      dexV2: true
    }), 'STON.fi quote request timed out');

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
    if (fromSymbol !== 'GRAMM' && toSymbol !== 'GRAMM') {
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

  const simulation = await withTimeout(stonApi.simulateSwap({
    offerAddress: fromToken.address,
    askAddress: toToken.address,
    offerUnits,
    slippageTolerance: String(numericSlippage / 100),
    dexV2: true
  }), 'STON.fi quote request timed out');

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
  if (fromSymbol === 'GRAMM') {
    txParams = await routerContract.getSwapTonToJettonTxParams({
      ...commonParams,
      proxyTon,
      askJettonAddress: toToken.address,
      askJettonWalletAddress: simulation.askJettonWallet
    });
  } else if (toSymbol === 'GRAMM') {
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
  const firstHop = await buildStonFiQuote({ from: fromSymbol, to: 'GRAMM', amount, slippage });
  if (firstHop.error) return firstHop;

  const secondHop = await buildStonFiQuote({
    from: 'GRAMM',
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
    route: [fromSymbol, 'GRAMM', toSymbol],
    provider: 'STON.fi',
    simulated: false,
    source: 'stonfi',
    hops: [firstHop, secondHop],
    updatedAt: Date.now()
  };
}

async function updatePriceInBackground() {
  if (priceUpdatePromise) return priceUpdatePromise;
  
  priceUpdatePromise = (async () => {
    try {
      const casaToken = getToken('CASA');
      if (getProvider() === 'stonfi' && casaToken.address) {
        const quote = await buildStonFiQuote({ from: 'CASA', to: 'USDT', amount: '1', slippage: DEFAULT_SLIPPAGE });
        if (!quote.error && Number.isFinite(quote.estimatedAmount) && quote.estimatedAmount > 0) {
          casaPriceCache = {
            price: quote.estimatedAmount,
            change24h: null,
            changePct24h: null,
            updatedAt: Date.now(),
            source: 'stonfi'
          };
        }
      }
    } catch (error) {
      console.error('Failed to update CASA price in background:', error.message);
    } finally {
      priceUpdatePromise = null;
    }
  })();
  
  return priceUpdatePromise;
}

async function getCasaPrice() {
  const now = Date.now();
  
  if (casaPriceCache) {
    if (now - casaPriceCache.updatedAt >= PRICE_CACHE_TTL) {
      updatePriceInBackground().catch(() => {});
    }
    return { ...casaPriceCache, stale: now - casaPriceCache.updatedAt >= PRICE_CACHE_TTL };
  }

  await updatePriceInBackground();
  if (casaPriceCache) return casaPriceCache;
  
  throw new Error('Production DEX provider is not configured or STON.fi quote returned no CASA price');
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
      supportedProviders: ['stonfi', 'dedust'],
      message: configured
        ? 'Production quotes are enabled.'
        : 'Production DEX quote provider is not fully configured. Set DEX_PROVIDER=stonfi and CASA_JETTON_ADDRESS.'
    }
  });
});

async function getQuote(params) {
  if (getProvider() === 'stonfi') return buildStonFiQuote(params);
  return {
    error: 'Production DEX quote provider is not configured',
    code: 'DEX_PROVIDER_NOT_CONFIGURED'
  };
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

  if (provider === 'stonfi') {
    if (quote.hops?.length) {
      res.status(501).json({
        ok: false,
        code: 'MULTIHOP_TX_PENDING',
        data: {
          quote,
          provider,
          walletAddress,
          nextStep: 'This quote uses multiple STON.fi hops. Execute direct GRAMM/CASA swaps first or implement multi-message route execution.'
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
  res.status(410).json({
    ok: false,
    code: 'SIMULATED_SWAP_REMOVED',
    error: 'Simulated swap execution is disabled. Use /api/swap/prepare and sign the real TON Connect transaction.'
  });
});

module.exports = router;
