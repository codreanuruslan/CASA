/**
 * priceEngine.js
 * Simulates CASA market price behavior in server memory.
 * Replace with STON.fi / DeDust API requests in production.
 */

const INITIAL_PRICE = parseFloat(process.env.INITIAL_PRICE || '0.001247');
const VOLATILITY = parseFloat(process.env.PRICE_VOLATILITY || '0.0003');
const UPDATE_INTERVAL = parseInt(process.env.PRICE_UPDATE_INTERVAL || '5000', 10);

const HISTORY_POINTS = 60;

let currentPrice = INITIAL_PRICE;
let openPrice24h = INITIAL_PRICE;
let priceHistory = [{ price: INITIAL_PRICE, ts: Date.now() }];
let started = false;

function nextPrice(base) {
  const drift = (Math.random() - 0.48) * VOLATILITY;
  const newPrice = Math.max(0.000001, base + drift);
  return parseFloat(newPrice.toFixed(9));
}

function tick() {
  currentPrice = nextPrice(currentPrice);
  priceHistory.push({ price: currentPrice, ts: Date.now() });
  if (priceHistory.length > HISTORY_POINTS) priceHistory.shift();
}

function start() {
  if (started) return;
  started = true;

  setInterval(() => {
    openPrice24h = currentPrice;
  }, 60 * 60 * 1000);

  setInterval(tick, UPDATE_INTERVAL);
}

function getPrice() {
  const change24h = currentPrice - openPrice24h;
  const changePct24h = openPrice24h > 0 ? (change24h / openPrice24h) * 100 : 0;

  return {
    price: currentPrice,
    change24h: parseFloat(change24h.toFixed(9)),
    changePct24h: parseFloat(changePct24h.toFixed(2)),
    updatedAt: Date.now()
  };
}

function getHistory() {
  return priceHistory.map(point => ({ price: point.price, ts: point.ts }));
}

module.exports = { start, getPrice, getHistory };
