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

    // ── Live price ticker ──────────────────────────────────────────────────────
    async function updatePrice() {
        const priceEl  = document.getElementById('price');
        const changeEl = document.getElementById('price-change');
        if (!priceEl) return;

        const response = await fetch('/api/price', { headers: { Accept: 'application/json' } });
        if (!response.ok) return;

        const payload = await response.json();
        const data = payload.data || payload;
        const changePct = Number(data.changePct24h) || 0;
        priceEl.textContent = '$' + Number(data.price).toFixed(6);
        if (changeEl) {
            changeEl.textContent = (changePct >= 0 ? '+' : '') + changePct.toFixed(2) + '%';
            changeEl.className   = 'stat-change ' + (changePct >= 0 ? 'positive' : 'negative');
        }
    }
    updatePrice().catch(() => {});
    setInterval(() => updatePrice().catch(() => {}), 5000);

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
        if (!window.TON_CONNECT_UI?.TonConnectUI) {
            if (walletStatus) walletStatus.textContent = 'TON Connect недоступен';
            return;
        }

        const configResponse = await fetch('/api/dapp/config', { headers: { Accept: 'application/json' } });
        const configPayload = await configResponse.json();
        const dappConfig = configPayload.data || {};
        if (dappConfig.warnings?.length) {
            setSwapStatus(dappConfig.warnings.join(' '), 'error');
        }

        tonConnectUI = new window.TON_CONNECT_UI.TonConnectUI({
            manifestUrl: dappConfig.manifestUrl || window.location.origin + '/tonconnect-manifest.json',
            buttonRootId: 'tonConnectButton',
            language: 'ru',
            uiPreferences: {
                theme: 'DARK',
                borderRadius: 'm'
            }
        });

        tonConnectUI.onStatusChange(wallet => updateWalletState(wallet));
        await tonConnectUI.connectionRestored;
        updateWalletState(tonConnectUI.wallet);
    }

    async function loadSwapConfig() {
        try {
            const response = await fetch('/api/swap/config', { headers: { Accept: 'application/json' } });
            const payload = await response.json();
            if (!response.ok || !payload.ok) return;
            if (dexProvider) dexProvider.textContent = payload.data.provider === 'demo' ? 'Demo Router' : payload.data.provider;
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

    if (swapForm) {
        initTonConnect().catch(() => {
            if (walletStatus) walletStatus.textContent = 'Ошибка TON Connect';
        });
        loadSwapConfig().catch(() => {});

        walletConnectAction.addEventListener('click', async () => {
            if (!tonConnectUI) {
                setSwapStatus('TON Connect еще не загружен.', 'error');
                return;
            }
            await tonConnectUI.openModal();
        });

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
                await tonConnectUI?.openModal();
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

    // ── Modal ──────────────────────────────────────────────────────────────────
    function openModal() {
        const modal = document.getElementById('modal');
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        modal.querySelector('.modal-close').focus();
    }

    function closeModal(e) {
        if (e && e.target !== e.currentTarget) return;
        const modal = document.getElementById('modal');
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeModal();
            setMobileMenu(false);
        }
    });

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
    const animatedItems = document.querySelectorAll('.feature-card, .distribution-item, .detail-card, .social-card, .roadmap-item, .faq-item, .trust-item');
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

    console.log('🏠 CASA Token — Built on TON Blockchain');
