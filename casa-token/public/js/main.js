// ── Particles ──────────────────────────────────────────────────────────────
    const canvas = document.getElementById('particles');
    const ctx = canvas.getContext('2d');
    let particles = [];
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function resizeCanvas() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    class Particle {
        constructor() { this.reset(); }
        reset() {
            this.x       = Math.random() * canvas.width;
            this.y       = Math.random() * canvas.height;
            this.size    = Math.random() * 2 + 0.5;
            this.speedX  = (Math.random() - 0.5) * 0.3;
            this.speedY  = (Math.random() - 0.5) * 0.3;
            this.opacity = Math.random() * 0.5 + 0.1;
            this.color   = Math.random() > 0.5 ? '0, 152, 234' : '123, 97, 255';
        }
        update() {
            this.x += this.speedX;
            this.y += this.speedY;
            if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) this.reset();
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${this.color}, ${this.opacity})`;
            ctx.fill();
        }
    }

    for (let i = 0; i < (reduceMotion ? 18 : 60); i++) particles.push(new Particle());

    function drawConnections() {
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx   = particles[i].x - particles[j].x;
                const dy   = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 120) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(0, 152, 234, ${0.08 * (1 - dist / 120)})`;
                    ctx.lineWidth   = 0.5;
                    ctx.stroke();
                }
            }
        }
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => { p.update(); p.draw(); });
        drawConnections();
        if (!reduceMotion) requestAnimationFrame(animate);
    }
    animate();

    // ── Mobile menu ────────────────────────────────────────────────────────────
    const telegramWebApp = window.Telegram?.WebApp;
    if (telegramWebApp) {
        telegramWebApp.ready();
        telegramWebApp.expand();
    }

    const burger     = document.querySelector('.burger');
    const mobileMenu = document.querySelector('.mobile-menu');
    function setMobileMenu(open) {
        burger.classList.toggle('active', open);
        mobileMenu.classList.toggle('active', open);
        burger.setAttribute('aria-expanded', String(open));
        mobileMenu.setAttribute('aria-hidden', String(!open));
    }
    burger.addEventListener('click', () => {
        setMobileMenu(!mobileMenu.classList.contains('active'));
    });
    document.querySelectorAll('.mobile-menu a').forEach(link => {
        link.addEventListener('click', () => {
            setMobileMenu(false);
        });
    });

    // ── Smooth scroll ──────────────────────────────────────────────────────────
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#') return;
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                window.scrollTo({ top: target.getBoundingClientRect().top + window.pageYOffset - 80, behavior: 'smooth' });
            }
        });
    });

    function scrollToSection(id) {
        const el = document.getElementById(id);
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 80, behavior: 'smooth' });
    }
    window.scrollToSection = scrollToSection;

    // ── Live price ticker ──────────────────────────────────────────────────────
    async function updatePrice() {
        const priceEl  = document.getElementById('price');
        const changeEl = document.getElementById('price-change');
        if (!priceEl) return;

        const response = await fetch('/api/price', { headers: { Accept: 'application/json' } });
        if (!response.ok) return;

        const payload = await response.json();
        const data = payload.data || payload;
        const price = Number(data.price);
        const changePct = Number(data.changePct24h);
        priceEl.textContent = Number.isFinite(price) ? '$' + price.toFixed(6) : '-';
        if (changeEl) {
            changeEl.textContent = Number.isFinite(changePct) ? (changePct >= 0 ? '+' : '') + changePct.toFixed(2) + '%' : '-';
            changeEl.className   = 'stat-change' + (Number.isFinite(changePct) ? ' ' + (changePct >= 0 ? 'positive' : 'negative') : '');
        }
    }

    function formatUsdCompact(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return '-';
        return '$' + numeric.toLocaleString('en-US', {
            notation: 'compact',
            maximumFractionDigits: 2
        });
    }

    function formatNumberCompact(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return '-';
        return numeric.toLocaleString('en-US', {
            notation: 'compact',
            maximumFractionDigits: 2
        });
    }

    function setChangeValue(element, value, suffix = '%') {
        if (!element) return;
        const numeric = Number(value);
        element.textContent = Number.isFinite(numeric) ? (numeric >= 0 ? '+' : '') + numeric.toFixed(2) + suffix : '-';
        element.className = 'stat-change' + (Number.isFinite(numeric) ? ' ' + (numeric >= 0 ? 'positive' : 'negative') : '');
    }

    async function updateStats() {
        const response = await fetch('/api/stats', { headers: { Accept: 'application/json' } });
        if (!response.ok) return;

        const payload = await response.json();
        const data = payload.data || payload;
        const marketCapEl = document.getElementById('marketCap');
        const holdersEl = document.getElementById('holdersCount');
        const volumeEl = document.getElementById('volume24h');

        if (marketCapEl) marketCapEl.textContent = formatUsdCompact(data.marketCap || data.fdv);
        if (holdersEl) holdersEl.textContent = formatNumberCompact(data.holders);
        if (volumeEl) volumeEl.textContent = formatUsdCompact(data.volume24h);
        setChangeValue(document.getElementById('market-cap-change'), data.marketCapChange24h);
        setChangeValue(document.getElementById('holders-change'), data.holdersGrowth24h, '');
        setChangeValue(document.getElementById('volume-change'), data.volumeChange24h);
    }
    updatePrice().catch(() => {});
    updateStats().catch(() => {});
    setInterval(() => updatePrice().catch(() => {}), 5000);
    setInterval(() => updateStats().catch(() => {}), 30000);

    // ── Swap widget ───────────────────────────────────────────────────────────
    let tonConnectUI = null;
    let connectedWallet = null;
    const swapForm = document.getElementById('swapForm');
    const swapFromAmount = document.getElementById('swapFromAmount');
    const swapFromToken = document.getElementById('swapFromToken');
    const swapToToken = document.getElementById('swapToToken');
    const swapToAmount = document.getElementById('swapToAmount');
    const swapSlippage = document.getElementById('swapSlippage');
    const swapSwitch = document.getElementById('swapSwitch');
    const swapStatus = document.getElementById('swapStatus');
    const quoteRate = document.getElementById('quoteRate');
    const quoteMinimum = document.getElementById('quoteMinimum');
    const quoteFee = document.getElementById('quoteFee');
    const quoteImpact = document.getElementById('quoteImpact');
    const quoteRoute = document.getElementById('quoteRoute');
    const walletStatus = document.getElementById('walletStatus');
    const walletConnectAction = document.getElementById('walletConnectAction');
    const swapSubmit = document.getElementById('swapSubmit');
    const dexProvider = document.getElementById('dexProvider');
    const dexStatus = document.getElementById('dexStatus');
    let latestQuote = null;
    let quoteTimer = null;
    let tonConnectInitPromise = null;
    let tonConnectScriptPromise = null;
    let dappConfigPromise = null;
    const tonConnectScriptUrls = [
        '/vendor/tonconnect-ui.min.js?v=3.0.0',
        'https://unpkg.com/@tonconnect/ui@3.0.0/dist/tonconnect-ui.min.js'
    ];

    function waitForTonConnectGlobal() {
        if (window.TON_CONNECT_UI?.TonConnectUI) return Promise.resolve(true);
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 20;
            function check() {
                if (window.TON_CONNECT_UI?.TonConnectUI) { resolve(true); return; }
                if (++attempts >= maxAttempts) { reject(new Error('TON Connect SDK не инициализировался.')); return; }
                setTimeout(check, 100);
            }
            requestAnimationFrame(check);
        });
    }

    function loadTonConnectScript() {
        if (window.TON_CONNECT_UI?.TonConnectUI) return Promise.resolve(true);
        if (tonConnectScriptPromise) return tonConnectScriptPromise;

        function loadScript(url) {
            return new Promise((resolve, reject) => {
                const existing = document.querySelector('script[src="' + url.split('?')[0] + '"]');
                if (existing) {
                    existing.addEventListener('load', () => waitForTonConnectGlobal().then(resolve, reject), { once: true });
                    if (existing.dataset.loaded === '1') waitForTonConnectGlobal().then(resolve, reject);
                    return;
                }
                const script = document.createElement('script');
                script.src = url;
                script.async = true;
                script.onload = () => { script.dataset.loaded = '1'; waitForTonConnectGlobal().then(resolve, reject); };
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

    function prefetchDappConfig() {
        if (dappConfigPromise) return dappConfigPromise;
        dappConfigPromise = fetch('/api/dapp/config', { headers: { Accept: 'application/json' } })
            .then(r => r.json())
            .then(p => p.data || {})
            .catch(() => ({}));
        return dappConfigPromise;
    }

    function preloadTonConnectScript() {
        if (window.TON_CONNECT_UI?.TonConnectUI || tonConnectScriptPromise) return;
        const link = document.createElement('link');
        link.rel = 'preload';
        link.href = tonConnectScriptUrls[0];
        link.as = 'script';
        document.head.appendChild(link);
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

    // Always preload SDK; on /buy flows start loading immediately
    if (shouldAutoOpenBuy()) {
        loadTonConnectScript().catch(() => {});
        prefetchDappConfig();
    } else {
        // Preload SDK when swap section enters viewport
        const swapSection = document.getElementById('swap');
        if (swapSection && 'IntersectionObserver' in window) {
            const swapObserver = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting) {
                    loadTonConnectScript().catch(() => {});
                    prefetchDappConfig();
                    swapObserver.disconnect();
                }
            }, { rootMargin: '200px' });
            swapObserver.observe(swapSection);
        }
        // Fallback: preload after idle
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => preloadTonConnectScript(), { timeout: 3000 });
        } else {
            setTimeout(preloadTonConnectScript, 2000);
        }
    }

    function shortAddress(address) {
        if (!address) return 'Не подключен';
        return address.slice(0, 6) + '...' + address.slice(-6);
    }

    function updateWalletState(wallet) {
        connectedWallet = wallet || null;
        const address = connectedWallet?.account?.address || '';
        if (walletStatus) walletStatus.textContent = address ? shortAddress(address) : 'Не подключен';
        if (walletConnectAction) walletConnectAction.textContent = address ? 'Открыть кошелек' : 'Подключить';
        if (swapSubmit) swapSubmit.textContent = address ? 'Подготовить swap' : 'Подключить и подготовить';
    }

    async function initTonConnect() {
        if (tonConnectUI) return tonConnectUI;
        if (tonConnectInitPromise) return tonConnectInitPromise;

        tonConnectInitPromise = (async () => {
        // Parallel: load SDK script AND fetch dapp config simultaneously
        const [, dappConfig] = await Promise.all([
            loadTonConnectScript(),
            prefetchDappConfig()
        ]);

        if (!window.TON_CONNECT_UI?.TonConnectUI) {
            if (walletStatus) walletStatus.textContent = 'TON Connect недоступен';
            throw new Error('TON Connect SDK не найден после загрузки.');
        }

        if (dappConfig.warnings?.length) {
            setSwapStatus(dappConfig.warnings.join(' '), 'error');
        }

        const connector = new window.TON_CONNECT_UI.TonConnect({
            manifestUrl: dappConfig.manifestUrl || window.location.origin + '/tonconnect-site-manifest.json',
            storage: createScopedStorage('casa-site:')
        });

        tonConnectUI = new window.TON_CONNECT_UI.TonConnectUI({
            connector,
            buttonRootId: 'tonConnectButton',
            language: 'ru',
            restoreConnection: false,
            walletsListConfiguration: {
                walletsListSource: window.location.origin + '/wallets-mini.json?v=20260527-2'
            },
            uiPreferences: {
                theme: 'DARK',
                borderRadius: 'm'
            }
        });

        tonConnectUI.onStatusChange(wallet => updateWalletState(wallet));
        updateWalletState(tonConnectUI.wallet);
        return tonConnectUI;
        })();

        try {
            return await tonConnectInitPromise;
        } catch (error) {
            tonConnectInitPromise = null;
            throw error;
        }
    }

    async function openWalletConnect() {
        try {
            const ui = tonConnectUI || await initTonConnect();
            setSwapStatus('Открываем TON Connect...');
            await ui.openModal();
            setSwapStatus('Выберите кошелек в TON Connect.');
            return true;
        } catch (error) {
            setSwapStatus(error?.message || 'Не удалось открыть TON Connect.', 'error');
            return false;
        }
    }

    async function loadSwapConfig() {
        try {
            const response = await fetch('/api/swap/config', { headers: { Accept: 'application/json' } });
            const payload = await response.json();
            if (!response.ok || !payload.ok) return;
            if (dexProvider) dexProvider.textContent = payload.data.provider;
            if (dexStatus) dexStatus.textContent = payload.data.message;
        } catch (error) {
            if (dexStatus) dexStatus.textContent = 'Не удалось загрузить конфигурацию DEX.';
        }
    }

    function formatTokenAmount(value, symbol) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return '-';
        const decimals = symbol === 'CASA' ? 2 : 6;
        return numeric.toLocaleString('ru-RU', { maximumFractionDigits: decimals }) + ' ' + symbol;
    }

    function setSwapStatus(message, type = '') {
        if (!swapStatus) return;
        swapStatus.textContent = message;
        swapStatus.className = 'swap-status' + (type ? ' ' + type : '');
    }

    async function loadSwapQuote() {
        if (!swapForm) return;
        const amount = Number(swapFromAmount.value);
        if (!Number.isFinite(amount) || amount <= 0) {
            latestQuote = null;
            swapToAmount.value = '0.00';
            setSwapStatus('Введите сумму для расчета.');
            return;
        }

        const params = new URLSearchParams({
            from: swapFromToken.value,
            to: swapToToken.value,
            amount: String(amount),
            slippage: swapSlippage.value
        });

        try {
            const response = await fetch('/api/swap/quote?' + params.toString(), {
                headers: { Accept: 'application/json' }
            });
            const payload = await response.json();
            if (!response.ok || !payload.ok) throw new Error(payload.error || 'Не удалось получить котировку');

            latestQuote = payload.data;
            swapToAmount.value = Number(latestQuote.estimatedAmount).toFixed(swapToToken.value === 'CASA' ? 2 : 6);
            quoteRate.textContent = '1 ' + latestQuote.from + ' ≈ ' +
                formatTokenAmount(latestQuote.estimatedAmount / latestQuote.amount, latestQuote.to);
            quoteMinimum.textContent = formatTokenAmount(latestQuote.minimumReceived, latestQuote.to);
            quoteFee.textContent = formatTokenAmount(latestQuote.feeAmount, latestQuote.to);
            quoteImpact.textContent = latestQuote.priceImpact.toFixed(2) + '%';
            quoteRoute.textContent = latestQuote.route.join(' → ');
            setSwapStatus('Котировка обновлена.');
        } catch (error) {
            latestQuote = null;
            swapToAmount.value = '0.00';
            quoteRate.textContent = '-';
            quoteMinimum.textContent = '-';
            quoteFee.textContent = '-';
            quoteImpact.textContent = '-';
            setSwapStatus(error.message, 'error');
        }
    }

    function queueSwapQuote() {
        clearTimeout(quoteTimer);
        quoteTimer = setTimeout(() => loadSwapQuote().catch(() => {}), 250);
    }

    function shouldAutoOpenBuy() {
        const params = new URLSearchParams(window.location.search);
        return window.location.pathname === '/buy' || params.get('connect') === '1' || params.get('buy') === 'casa';
    }

    async function startBuyFlow() {
        if (!swapForm || !shouldAutoOpenBuy()) return;
        const swapSection = document.getElementById('swap');
        if (swapSection) {
            window.setTimeout(() => scrollToSection('swap'), 250);
        }
        if (swapFromToken && swapToToken) {
            swapFromToken.value = 'GRAMM';
            swapToToken.value = 'CASA';
        }
        queueSwapQuote();
        await openWalletConnect();
    }

    if (swapForm) {
        loadSwapConfig().catch(() => {});

        walletConnectAction.addEventListener('click', openWalletConnect);

        [swapFromAmount, swapFromToken, swapToToken, swapSlippage].forEach(control => {
            control.addEventListener('input', queueSwapQuote);
            control.addEventListener('change', queueSwapQuote);
        });

        swapSwitch.addEventListener('click', () => {
            const from = swapFromToken.value;
            swapFromToken.value = swapToToken.value;
            swapToToken.value = from;
            queueSwapQuote();
        });

        swapForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!tonConnectUI?.connected) {
                setSwapStatus('Подключите TON-кошелек для подготовки обмена.');
                await openWalletConnect();
                return;
            }

            setSwapStatus('Готовим DEX-транзакцию...');

            const body = {
                from: swapFromToken.value,
                to: swapToToken.value,
                amount: Number(swapFromAmount.value),
                slippage: Number(swapSlippage.value),
                walletAddress: tonConnectUI.account?.address
            };

            try {
                const response = await fetch('/api/swap/prepare', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify(body)
                });
                const payload = await response.json();
                if (!response.ok || !payload.ok) {
                    if (payload.code === 'DEX_NOT_CONFIGURED' || payload.code === 'DEX_PROVIDER_PENDING') {
                        setSwapStatus(payload.error + ': ' + payload.data.nextStep, 'error');
                        return;
                    }
                    throw new Error(payload.error || 'Обмен не выполнен');
                }

                if (payload.data.transaction) {
                    await tonConnectUI.sendTransaction(payload.data.transaction);
                    setSwapStatus('Транзакция отправлена в кошелек для подписи.', 'success');
                } else {
                    setSwapStatus('DEX подготовил ответ без транзакции.', 'error');
                }
            } catch (error) {
                setSwapStatus(error.message, 'error');
            }
        });

        loadSwapQuote().catch(() => {});
        startBuyFlow().catch(() => {});
    }

    // ── Copy contract address ──────────────────────────────────────────────────
    async function writeClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
    }

    function copyContract() {
        const address = 'EQBWK_VVEBJWiIQIIXOckUVw0HdF24buJiNiiR0dUHEe2xs4';
        writeClipboard(address).then(() => {
            const btn = document.querySelector('.copy-btn');
            const original = btn.innerHTML;
            const originalLabel = btn.getAttribute('aria-label');
            btn.innerHTML = '✓';
            btn.setAttribute('aria-label', 'Контракт скопирован');
            btn.style.background = 'rgba(0,255,163,.2)';
            btn.style.color      = '#00FFA3';
            setTimeout(() => {
                btn.innerHTML        = original;
                btn.setAttribute('aria-label', originalLabel);
                btn.style.background = '';
                btn.style.color      = '';
            }, 1500);
        });
    }

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            setMobileMenu(false);
        }
    });

    // Mutual financing group charter
    function publishCharter() {
        if (document.getElementById('charter')) return;

        const charter = document.createElement('section');
        charter.id = 'charter';
        charter.className = 'section charter-section';
        charter.innerHTML = `
            <div class="container">
                <div class="section-header">
                    <span class="section-tag">Правила сообщества</span>
                    <h2>Устав группы взаимного финансирования CASA</h2>
                    <p class="section-desc">Правила добровольного участия, учета взносов и операций с токеном CASA.</p>
                </div>

                <div class="charter-notice" role="note">
                    <strong>Важно:</strong> участие добровольное. CASA является криптоактивом: его цена может как вырасти, так и снизиться, вплоть до существенной потери вложенных средств. Доходность и возможность продажи по желаемой цене не гарантируются.
                </div>

                <div class="charter-grid">
                    <article class="charter-card">
                        <span class="charter-number">01</span>
                        <h3>Общие положения</h3>
                        <ul>
                            <li>Цель группы - добровольное объединение средств участников для взаимной финансовой поддержки и приобретения токена CASA без начисления процентов между участниками.</li>
                            <li>Фиксированного максимального количества участников нет. Новый участник принимается только при единогласном согласии действующих участников.</li>
                            <li>До первого взноса участник должен ознакомиться с правилами и подтвердить согласие с ними.</li>
                        </ul>
                    </article>

                    <article class="charter-card">
                        <span class="charter-number">02</span>
                        <h3>Взносы</h3>
                        <ul>
                            <li>Размер регулярного взноса и валюта заранее согласуются участниками и фиксируются в <a href="https://t.me/casafond_bot" target="_blank" rel="noopener">@casafond_bot</a>.</li>
                            <li>Обязательный взнос вносится ежемесячно с 1-го по 5-е число включительно. Дополнительные добровольные взносы допускаются в любое время.</li>
                            <li>Взнос считается внесенным после подтверждения платежа или зачисления купленных токенов CASA на указанный кошелек.</li>
                            <li>Комиссии банка, платежной системы, P2P-сервиса, биржи или блокчейна оплачивает отправитель.</li>
                        </ul>
                    </article>

                    <article class="charter-card">
                        <span class="charter-number">03</span>
                        <h3>Учет и общий фонд</h3>
                        <ul>
                            <li>Все взносы и операции отражаются в отчете бота: дата, участник, сумма, валюта, количество CASA, курс операции, комиссия и идентификатор транзакции.</li>
                            <li>Средства могут направляться на покупку CASA только по заранее утвержденному порядку. Остаток фонда и адрес кошелька должны быть доступны участникам для проверки.</li>
                            <li>Покупка CASA не означает гарантированного увеличения общего фонда. Его стоимость меняется вместе с рыночной ценой токена.</li>
                        </ul>
                    </article>

                    <article class="charter-card">
                        <span class="charter-number">04</span>
                        <h3>Получение и вывод средств</h3>
                        <ul>
                            <li>Очередность и условия получения средств утверждаются участниками и публикуются в закрепленном сообщении <a href="https://t.me/casafond_bot" target="_blank" rel="noopener">@casafond_bot</a>.</li>
                            <li>Изменение графика, досрочный вывод или продажа CASA допускаются только по решению, принятому в порядке, заранее согласованном всеми участниками.</li>
                            <li>Участник, получивший выплату, продолжает вносить обязательные взносы до завершения текущего цикла, пока право на выплату не будет реализовано всеми его участниками.</li>
                            <li>Фактическая сумма выплаты зависит от количества CASA, рыночного курса, доступной ликвидности и комиссий на момент продажи.</li>
                        </ul>
                    </article>

                    <article class="charter-card">
                        <span class="charter-number">05</span>
                        <h3>Управление и дисциплина</h3>
                        <ul>
                            <li>Администратор: <a href="https://t.me/casafond_bot" target="_blank" rel="noopener">@casafond_bot</a> и назначенный организатор группы.</li>
                            <li>Администратор ведет учет, публикует отчетность, уведомляет о сроках и исполняет утвержденные решения. Он не вправе единолично менять график, сумму взноса или назначение средств.</li>
                            <li>Просрочка и порядок ее урегулирования фиксируются в отчете. Исключение участника и возврат средств возможны только по заранее утвержденной процедуре.</li>
                        </ul>
                    </article>

                    <article class="charter-card charter-example">
                        <span class="charter-number">06</span>
                        <h3>Пример расчета</h3>
                        <p>Если участник купил 862 CASA по цене около $1,16, затраты составят примерно $1 000. При цене $2,17 стоимость 862 CASA составит около $1 870 до вычета комиссий. При снижении цены, например до $0,80, их стоимость составит около $690.</p>
                        <p><strong>Это только иллюстрация расчета, а не прогноз и не обещание прибыли.</strong> Спрос участников сам по себе не гарантирует рост цены.</p>
                    </article>
                </div>

                <div class="charter-consent">
                    <h3>Согласие с правилами</h3>
                    <p>Вступая в группу и делая первый взнос, участник подтверждает согласие с уставом, принимает рыночные и операционные риски и несет личную ответственность за свои финансовые решения.</p>
                    <p>Если взносы принимаются в разных валютах, источник обменного курса и момент его фиксации должны быть заранее указаны в закрепленном сообщении.</p>
                </div>
            </div>`;

        const insertionPoint = document.getElementById('faq') || document.getElementById('community');
        if (insertionPoint) insertionPoint.before(charter);
        else document.querySelector('footer')?.before(charter);

        document.querySelectorAll('.nav-links, .mobile-menu ul').forEach(menu => {
            const item = document.createElement('li');
            item.innerHTML = '<a href="#charter">Устав</a>';
            item.querySelector('a').addEventListener('click', event => {
                event.preventDefault();
                setMobileMenu(false);
                scrollToSection('charter');
            });
            const communityLink = Array.from(menu.children).find(child => child.querySelector('a[href="#community"]'));
            if (communityLink) menu.insertBefore(item, communityLink);
            else menu.appendChild(item);
        });
    }
    publishCharter();

    // ── Token distribution colors ──────────────────────────────────────────────
    document.querySelectorAll('.distribution-item').forEach(item => {
        const color = item.dataset.color;
        if (color) {
            const dot  = item.querySelector('.dist-dot');
            const fill = item.querySelector('.dist-fill');
            if (dot)  dot.style.background  = color;
            if (fill) fill.style.background = color;
        }
    });

    // ── Scroll-in animations ───────────────────────────────────────────────────
    const animatedItems = document.querySelectorAll('.feature-card, .distribution-item, .detail-card, .social-card, .roadmap-item, .faq-item, .trust-item, .charter-card, .charter-consent');
    if (!reduceMotion) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry, idx) => {
                if (entry.isIntersecting) {
                    setTimeout(() => {
                        entry.target.style.opacity   = '1';
                        entry.target.style.transform = 'translateY(0)';
                    }, idx * 60);
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

        animatedItems.forEach(el => {
            el.style.opacity    = '0';
            el.style.transform  = 'translateY(20px)';
            el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            observer.observe(el);
        });
    }

    // ── Header background on scroll ────────────────────────────────────────────
    const header = document.querySelector('.header');
    window.addEventListener('scroll', () => {
        header.style.background = window.pageYOffset > 100
            ? 'rgba(7, 12, 24, 0.95)'
            : 'rgba(7, 12, 24, 0.70)';
    });

    console.log('🏠 CASA Token — Built on GRAMM Blockchain');
