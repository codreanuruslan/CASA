(function () {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  const amountInput = document.getElementById('swapFromAmount');
  const toAmountInput = document.getElementById('swapToAmount');
  const quoteRate = document.getElementById('quoteRate');
  const quoteMinimum = document.getElementById('quoteMinimum');
  const quoteRoute = document.getElementById('quoteRoute');
  const connectButton = document.getElementById('connectButton');
  const swapButton = document.getElementById('swapButton');
  const form = document.getElementById('miniSwapForm');
  const statusEl = document.getElementById('status');
  let tonConnectUI = null;
  let quoteTimer = null;

  function setStatus(message, type = '') {
    statusEl.textContent = message;
    statusEl.className = 'status' + (type ? ' ' + type : '');
  }

  function formatAmount(value, symbol) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '-';
    return number.toLocaleString('ru-RU', { maximumFractionDigits: symbol === 'CASA' ? 2 : 6 }) + ' ' + symbol;
  }

  async function initTonConnect() {
    if (tonConnectUI) return tonConnectUI;
    if (!window.TON_CONNECT_UI?.TonConnectUI) {
      setStatus('TON Connect еще загружается...', 'error');
      return null;
    }

    tonConnectUI = new window.TON_CONNECT_UI.TonConnectUI({
      manifestUrl: window.location.origin + '/tonconnect-manifest.json',
      buttonRootId: 'tonConnectButton',
      language: 'ru',
      restoreConnection: false,
      walletsListConfiguration: {
        walletsListSource: window.location.origin + '/wallets-v2.json'
      },
      uiPreferences: { theme: 'DARK', borderRadius: 'm' }
    });

    tonConnectUI.onStatusChange(updateWallet);
    updateWallet(tonConnectUI.wallet);
    return tonConnectUI;
  }

  function updateWallet(wallet) {
    const connected = Boolean(wallet?.account?.address);
    connectButton.textContent = connected ? 'Кошелек подключен' : 'Подключить кошелек';
    swapButton.textContent = connected ? 'Подготовить swap' : 'Подключить и подготовить';
  }

  async function openWallet() {
    const ui = await initTonConnect();
    if (!ui) return false;
    setStatus('Открываем TON Connect...');
    try {
      await ui.openModal();
      return true;
    } catch (error) {
      setStatus(error.message || 'Не удалось открыть TON Connect.', 'error');
      return false;
    }
  }

  async function loadQuote() {
    const amount = Number(amountInput.value);
    if (!Number.isFinite(amount) || amount <= 0) {
      toAmountInput.value = '0.00';
      quoteRate.textContent = '-';
      quoteMinimum.textContent = '-';
      return;
    }

    const params = new URLSearchParams({
      from: 'TON',
      to: 'CASA',
      amount: String(amount),
      slippage: '0.5'
    });

    try {
      const response = await fetch('/api/swap/quote?' + params.toString(), {
        headers: { Accept: 'application/json' }
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Котировка недоступна');

      const quote = payload.data;
      toAmountInput.value = Number(quote.estimatedAmount).toFixed(2);
      quoteRate.textContent = '1 TON ≈ ' + formatAmount(quote.estimatedAmount / quote.amount, 'CASA');
      quoteMinimum.textContent = formatAmount(quote.minimumReceived, 'CASA');
      quoteRoute.textContent = quote.route.join(' → ');
      setStatus('Котировка обновлена.');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  function queueQuote() {
    clearTimeout(quoteTimer);
    quoteTimer = setTimeout(() => loadQuote().catch(() => {}), 250);
  }

  connectButton.addEventListener('click', () => openWallet().catch(() => {}));
  amountInput.addEventListener('input', queueQuote);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const ui = await initTonConnect();
    if (!ui?.connected) {
      await openWallet();
      return;
    }

    setStatus('Готовим DEX-транзакцию...');
    try {
      const response = await fetch('/api/swap/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          from: 'TON',
          to: 'CASA',
          amount: Number(amountInput.value),
          slippage: 0.5,
          walletAddress: ui.account?.address
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Swap недоступен');
      await ui.sendTransaction(payload.data.transaction);
      setStatus('Транзакция отправлена в кошелек для подписи.', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });

  initTonConnect().then(() => openWallet()).catch(() => {});
  loadQuote().catch(() => {});
})();
