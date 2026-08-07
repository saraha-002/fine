// ===============================
// FINEESCORTS PAYMENT LOGIC – Updated with reCAPTCHA & API Secret
// ===============================

// ---------- Shared secret (must match API_SECRET in Render) ----------
const API_SECRET = "103e07b75c0b3d874cd4376dd0e095729f66d4f26803361aa087df169acc4ac4";

// ---------- reCAPTCHA site key (from Google) ----------
const RECAPTCHA_SITE_KEY = "6LcKDGEtAAAAAJKAWjXB7j5bSIPvzz94wBWapTD5";

// ---------- Sarahapay API ----------
const SARAHAPAY_API = ''; // Use relative path to your server

// ===============================
// STATE
// ===============================
let escort = {
    id: '',
    name: '',
    fullNumber: '',
    maskedNumber: ''
};

let pollingInterval = null;
let pollingAttempts = 0;
let waitingTimer = null;
const MAX_ATTEMPTS = 20;
const POLL_INTERVAL = 1000;

// ===============================
// ANALYTICS TRACKING
// ===============================
function trackEvent(eventName, eventData = {}) {
    const escortId = document.getElementById('escortData')?.dataset.id || 'unknown';
    const payload = { profile_id: escortId, ...eventData };
    if (typeof gtag !== 'undefined') {
        gtag('event', eventName, payload);
    } else {
        console.warn('gtag not loaded. Event not sent:', eventName, payload);
    }
}

// ===============================
// ESCORT DATA
// ===============================
function initEscortData() {
    const dataEl = document.getElementById('escortData');
    if (dataEl) {
        escort = {
            id: dataEl.dataset.id || '',
            name: dataEl.dataset.name || '',
            fullNumber: dataEl.dataset.fullnumber || '',
            maskedNumber: dataEl.dataset.masked || ''
        };
    }
    const savedNumber = localStorage.getItem(`unlocked_${escort.id}`);
    if (savedNumber && savedNumber === escort.fullNumber) {
        revealNumber(savedNumber);
    }
}

// ===============================
// BIO "READ MORE" TOGGLE (FIXED)
// ===============================
function initBioToggle() {
    console.log('🔍 Initializing bio toggle...');
    
    const buttons = document.querySelectorAll('.toggle-bio-btn');
    console.log(`🔍 Found ${buttons.length} toggle buttons`);
    
    // Ensure initial state: preview visible, full hidden
    document.querySelectorAll('.bio-preview').forEach(el => {
        el.classList.remove('hidden');
    });
    document.querySelectorAll('.bio-full').forEach(el => {
        el.classList.remove('visible');
        el.style.display = ''; // Remove any inline style
    });

    buttons.forEach(btn => {
        btn.removeEventListener('click', handleToggle);
        btn.addEventListener('click', handleToggle);
        console.log(`✅ Attached toggle listener to button with slug: ${btn.dataset.slug}`);
    });
}

function handleToggle(e) {
    const btn = e.currentTarget;
    const slug = btn.dataset.slug;

    console.log(`🔘 Toggle button clicked for slug: "${slug}"`);

    if (!slug) {
        console.error('❌ No slug found on button!');
        return;
    }

    const preview = document.getElementById(`preview-${slug}`);
    const full = document.getElementById(`full-${slug}`);

    if (!preview || !full) {
        console.error(`❌ Elements not found for slug: ${slug}`);
        return;
    }

    // Toggle classes instead of inline styles
    const isHidden = full.classList.contains('visible');
    
    if (!isHidden) {
        full.classList.add('visible');
        preview.classList.add('hidden');
        btn.innerHTML = '▲ Read Less';
        console.log('✅ Showing full description');
    } else {
        full.classList.remove('visible');
        preview.classList.remove('hidden');
        btn.innerHTML = '▼ Read More';
        console.log('✅ Hiding full description');
    }
}

// ===============================
// GALLERY THUMBNAIL SWITCHING
// ===============================
function initGallery() {
    const thumbs = document.querySelectorAll('.thumb');
    const mains = document.querySelectorAll('.main');
    thumbs.forEach((thumb, i) => {
        thumb.addEventListener('click', () => {
            document.querySelector('.thumb.active')?.classList.remove('active');
            document.querySelector('.main.active')?.classList.remove('active');
            thumb.classList.add('active');
            mains[i].classList.add('active');
        });
    });
}

// ===============================
// REVIEWS CAROUSEL
// ===============================
function initCarousel() {
    const track = document.getElementById('reviewsTrack');
    const prevBtn = document.getElementById('reviewPrevBtn');
    const nextBtn = document.getElementById('reviewNextBtn');

    if (!track) return;

    function scrollCarousel(direction) {
        const card = track.querySelector('.review-card');
        if (!card) return;
        const cardWidth = card.offsetWidth + 24;
        track.scrollBy({ left: direction * cardWidth, behavior: 'smooth' });
    }

    if (prevBtn && nextBtn) {
        prevBtn.addEventListener('click', () => scrollCarousel(-1));
        nextBtn.addEventListener('click', () => scrollCarousel(1));
    }

    let startX = 0;
    track.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    track.addEventListener('touchend', (e) => {
        if (!startX) return;
        const endX = e.changedTouches[0].clientX;
        const diff = startX - endX;
        if (Math.abs(diff) > 50) scrollCarousel(diff > 0 ? 1 : -1);
        startX = 0;
    });

    let autoPlayInterval;

    function startAutoPlay() {
        if (autoPlayInterval) clearInterval(autoPlayInterval);
        autoPlayInterval = setInterval(() => {
            const card = track.querySelector('.review-card');
            if (!card) return;
            const cardWidth = card.offsetWidth + 24;
            const maxScroll = track.scrollWidth - track.clientWidth;
            if (track.scrollLeft + cardWidth >= maxScroll - 5) {
                track.scrollTo({ left: 0, behavior: 'smooth' });
            } else {
                track.scrollBy({ left: cardWidth, behavior: 'smooth' });
            }
        }, 4000);
    }

    function stopAutoPlay() { clearInterval(autoPlayInterval); }

    track.addEventListener('mouseenter', stopAutoPlay);
    track.addEventListener('mouseleave', startAutoPlay);
    startAutoPlay();
}

// ===============================
// PHONE NUMBER DISPLAY
// ===============================
function revealNumber(fullNumber = null) {
    const number = fullNumber || escort.fullNumber;
    const maskedDiv = document.getElementById('maskedPhone');
    const contactSection = document.getElementById('contactSection');

    if (!maskedDiv || !contactSection) return;

    const displayNumber = number.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');

    maskedDiv.innerHTML = displayNumber;
    maskedDiv.classList.add('revealed-number');

    const revealBtn = document.getElementById('revealBtn');
    if (revealBtn) revealBtn.remove();

    const whatsappMessage = encodeURIComponent(
        `Hi, I'm interested in your services. I unlocked your number from FineEscorts Kenya. Are you available?`
    );
    const whatsappUrl = `https://wa.me/${number.replace(/^0/, '254')}?text=${whatsappMessage}`;

    const callButtons = document.createElement('div');
    callButtons.className = 'call-buttons';
    callButtons.innerHTML = `
        <a href="tel:${number}" class="call-btn call">
            <i class="fas fa-phone"></i> Call
        </a>
        <a href="${whatsappUrl}" class="call-btn whatsapp" target="_blank">
            <i class="fab fa-whatsapp"></i> WhatsApp
        </a>
    `;
    maskedDiv.insertAdjacentElement('afterend', callButtons);

    localStorage.setItem(`unlocked_${escort.id}`, number);
    trackEvent('payment_completed', { profile_name: escort.name });
}

// ===============================
// PAYMENT MODAL
// ===============================
function openPaymentModal() {
    trackEvent('modal_opened', { profile_name: escort.name });
    document.getElementById('paymentModal').style.display = 'flex';
    document.getElementById('phoneNumber').value = '';
    document.getElementById('paymentStatus').style.display = 'none';
    const payBtn = document.getElementById('payNowBtn');
    if (payBtn) {
        payBtn.disabled = false;
        payBtn.innerHTML = '<i class="fas fa-lock"></i> Pay 50 KES';
    }
}

function closePaymentModal() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    document.getElementById('paymentModal').style.display = 'none';
}

// ===============================
// PAYMENT INTEGRATION
// ===============================
async function initiatePayment() {
    const userPhone = document.getElementById('phoneNumber').value.trim();

    if (!userPhone) {
        showStatus('Please enter your M-Pesa phone number', 'error');
        return;
    }

    let formattedPhone = userPhone.replace(/[^0-9]/g, '');
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '254' + formattedPhone.substring(1);
    }
    if (!formattedPhone.startsWith('254')) {
        formattedPhone = '254' + formattedPhone;
    }

    if (formattedPhone.length !== 12) {
        showStatus('Enter valid phone number (e.g., 0712345678)', 'error');
        return;
    }

    const payBtn = document.getElementById('payNowBtn');
    const originalText = payBtn.innerHTML;
    payBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending prompt...';
    payBtn.disabled = true;

    showStatus('Initiating M-Pesa payment...', 'info');

    let recaptchaToken = '';
    try {
        if (typeof grecaptcha !== 'undefined') {
            recaptchaToken = await grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: 'payment' });
        } else {
            await new Promise(resolve => setTimeout(resolve, 2000));
            if (typeof grecaptcha !== 'undefined') {
                recaptchaToken = await grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: 'payment' });
            } else {
                throw new Error('reCAPTCHA not loaded');
            }
        }
    } catch (err) {
        console.error('reCAPTCHA error:', err);
        showStatus('Security verification failed. Please refresh and try again.', 'error');
        payBtn.innerHTML = originalText;
        payBtn.disabled = false;
        return;
    }

    if (!recaptchaToken) {
        showStatus('Security verification failed. Please refresh and try again.', 'error');
        payBtn.innerHTML = originalText;
        payBtn.disabled = false;
        return;
    }

    try {
        const response = await fetch('/api/pay', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Secret': API_SECRET,
                'X-Recaptcha-Token': recaptchaToken
            },
            body: JSON.stringify({
                name: `Unlock ${escort.name}'s number`,
                phone: formattedPhone,
                amount: 50
            })
        });

        const data = await response.json();

        if (response.ok && data.transactionId) {
            const transactionId = data.transactionId;
            sessionStorage.setItem(`payment_tx_${escort.id}`, transactionId);

            trackEvent('payment_sent', { profile_name: escort.name, transaction_id: transactionId });

            showStatus('✅ M-Pesa prompt sent! Check your phone and enter PIN.', 'success');
            payBtn.innerHTML = '<i class="fas fa-hourglass-half"></i> Waiting for PIN...';
            startPaymentPolling(transactionId);
        } else {
            throw new Error(data.error || data.details || data.message || 'Payment initiation failed');
        }
    } catch (error) {
        console.error('Payment error:', error);
        showStatus(error.message || 'Payment failed. Please try again.', 'error');
        payBtn.innerHTML = originalText;
        payBtn.disabled = false;
    }
}

function startPaymentPolling(transactionId) {
    if (pollingInterval) clearInterval(pollingInterval);
    if (waitingTimer) clearTimeout(waitingTimer);
    pollingAttempts = 0;

    waitingTimer = setTimeout(() => {
        showStatus('⏳ Still waiting for payment confirmation. If you cancelled the prompt, please try again.', 'info');
    }, 10000);

    pollingInterval = setInterval(async () => {
        pollingAttempts++;
        const result = await checkPaymentStatus(transactionId);

        if (result.status === 'SUCCESS' || result.status === 'COMPLETED' || result.status === 'Success') {
            clearInterval(pollingInterval);
            clearTimeout(waitingTimer);
            showStatus('✅ Payment successful! Revealing number...', 'success');
            const payBtn = document.getElementById('payNowBtn');
            if (payBtn) payBtn.innerHTML = '<i class="fas fa-check"></i> Payment Complete!';
            setTimeout(() => {
                closePaymentModal();
                revealNumber();
            }, 1000);
            return;
        }

        if (result.status === 'FAILED' || result.status === 'CANCELLED' || result.status === 'REVERSED' || result.status === 'TIMEOUT' || result.status === 'Failed') {
            clearInterval(pollingInterval);
            clearTimeout(waitingTimer);
            showStatus('❌ Payment failed or was cancelled. Please try again.', 'error');
            resetPayButton();
            return;
        }

        if (pollingAttempts >= MAX_ATTEMPTS) {
            clearInterval(pollingInterval);
            clearTimeout(waitingTimer);
            trackEvent('payment_timeout', {
                profile_name: escort.name,
                transaction_id: transactionId
            });
            showStatus('❌ Payment not completed. You did not enter your M‑Pesa PIN or cancelled the prompt. Please try again.', 'error');
            resetPayButton();
            return;
        }
    }, POLL_INTERVAL);
}

function resetPayButton() {
    const payBtn = document.getElementById('payNowBtn');
    if (payBtn) {
        payBtn.innerHTML = '<i class="fas fa-lock"></i> Pay 50 KES';
        payBtn.disabled = false;
    }
}

async function checkPaymentStatus(transactionId) {
    try {
        const response = await fetch(`/api/transaction/${transactionId}`);
        if (!response.ok) {
            return { status: 'PENDING' };
        }
        const data = await response.json();
        return { status: data.status, data };
    } catch (e) {
        console.warn('Status check error:', e);
        return { status: 'ERROR' };
    }
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('paymentStatus');
    if (!statusDiv) return;
    statusDiv.textContent = message;
    statusDiv.className = `payment-status ${type}`;
    statusDiv.style.display = 'block';
}

// ===============================
// INITIALIZATION
// ===============================
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM loaded, initializing...');

    initEscortData();
    initBioToggle();
    initGallery();
    initCarousel();

    const revealBtn = document.getElementById('revealBtn');
    if (revealBtn) {
        revealBtn.addEventListener('click', () => {
            trackEvent('unlock_clicked', { profile_name: escort.name });
            openPaymentModal();
        });
    }

    const payBtn = document.getElementById('payNowBtn');
    if (payBtn) {
        payBtn.addEventListener('click', initiatePayment);
    }

    const phoneInput = document.getElementById('phoneNumber');
    if (phoneInput) {
        phoneInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') initiatePayment();
        });
    }
});

// Global functions for inline onclick/attributes
window.closePaymentModal = closePaymentModal;
window.revealNumber = revealNumber;

window.onclick = function(e) {
    const modal = document.getElementById('paymentModal');
    if (e.target === modal) closePaymentModal();
};