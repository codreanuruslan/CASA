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
  let tonConnectInitPromise = null;
  let quoteTimer = null;
  let tonConnectScriptPromise = null;
  const tonConnectScriptUrls = [
    '/vendor/tonconnect-ui.min.js?v=3.0.0',
    'https://unpkg.com/@tonconnect/ui@3.0.0/dist/tonconnect-ui.min.js'
  ];

  function setStatus(message, type = '') {
    statusEl.textContent = message;
    statusEl.className = 'status' + (type ? ' ' + type : '');
  }

  function formatAmount(value, symbol) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '-';
    const displaySymbol = symbol === 'GRAMM' ? 'TON' : symbol;
    return number.toLocaleString('ru-RU', { maximumFractionDigits: symbol === 'CASA' ? 2 : 6 }) + ' ' + displaySymbol;
  }

  function displayTokenSymbol(symbol) {
    return symbol === 'GRAMM' ? 'TON' : symbol;
  }

  function createScopedStorage(scope) {
    return {
      getItem(key) {
        return Promise.resolve(window.localStorage.getItem(scope + key));
      },
      setItem(key, value) {
        window.localStorage.setItem(scope + key, value);
        return Promise.resolve();
      },
      removeItem(key) {
        window.localStorage.removeItem(scope + key);
        return Promise.resolve();
      }
    };
  }

  function waitForTonConnectGlobal() {
    if (window.TON_CONNECT_UI?.TonConnectUI) return Promise.resolve(true);
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const timer = setInterval(() => {
        if (window.TON_CONNECT_UI?.TonConnectUI) {
          clearInterval(timer);
          resolve(true);
          return;
        }
        if (Date.now() - startedAt > 3000) {
          clearInterval(timer);
          reject(new Error('TON Connect SDK не инициализировался.'));
        }
      }, 50);
    });
  }

  function loadTonConnectScript() {
    if (window.TON_CONNECT_UI?.TonConnectUI) return Promise.resolve(true);
    if (tonConnectScriptPromise) return tonConnectScriptPromise;

    function loadScript(url) {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.async = true;
        script.onload = () => waitForTonConnectGlobal().then(resolve, reject);
        script.onerror = () => reject(new Error('TON Connect SDK не загрузился.'));
        document.head.appendChild(script);
      });
    }

    tonConnectScriptPromise = tonConnectScriptUrls.reduce((chain, url) => {
      return chain.catch(() => loadScript(url));
    }, Promise.reject());

    tonConnectScriptPromise = tonConnectScriptPromise.catch(error => {
      tonConnectScriptPromise = null;
      throw error;
    });

    return tonConnectScriptPromise;
  }

  async function initTonConnect() {
    if (tonConnectUI) return tonConnectUI;
    if (tonConnectInitPromise) return tonConnectInitPromise;

    tonConnectInitPromise = (async () => {
    await loadTonConnectScript();
    if (!window.TON_CONNECT_UI?.TonConnectUI) {
      throw new Error('TON Connect SDK не найден после загрузки.');
    }

    const connector = new window.TON_CONNECT_UI.TonConnect({
      manifestUrl: window.location.origin + '/tonconnect-miniapp-manifest.json',
      storage: createScopedStorage('casa-miniapp:')
    });

    tonConnectUI = new window.TON_CONNECT_UI.TonConnectUI({
      connector,
      buttonRootId: 'tonConnectButton',
      language: 'ru',
      restoreConnection: false,
      walletsListConfiguration: {
        walletsListSource: window.location.origin + '/wallets-mini.json?v=20260527-2'
      },
      uiPreferences: { theme: 'DARK', borderRadius: 'm' }
    });

    tonConnectUI.onStatusChange(updateWallet);
    if (typeof tonConnectUI.onModalStateChange === 'function') {
      tonConnectUI.onModalStateChange(state => {
        if (state?.status === 'opened') {
          setStatus('Выберите кошелек и подтвердите подключение.');
        }
      });
    }
    updateWallet(tonConnectUI.wallet);
    return tonConnectUI;
    })();

    try {
      return await tonConnectInitPromise;
    } catch (error) {
      tonConnectInitPromise = null;
      throw error;
    }
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
      ui.openModal().catch(error => {
        setStatus(error.message || 'Не удалось открыть TON Connect.', 'error');
      });
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
      from: 'GRAMM',
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
      quoteRoute.textContent = quote.route.map(displayTokenSymbol).join(' → ');
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
          from: 'GRAMM',
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

  window.setTimeout(() => initTonConnect().catch(() => {}), 250);
  loadQuote().catch(() => {});
})();
