// Les Casseroles — Popup v3.0

let currentEnabled = true;

const toggleBtn   = document.getElementById('toggle-btn');
const toggleLabel = document.getElementById('toggle-label');
const pageText    = document.getElementById('page-text');
const pageDot     = document.getElementById('page-dot');
const statPage    = document.getElementById('stat-page');
const statPoliticians = document.getElementById('stat-politicians');

// 21st.dev: animated counter (0 → target)
const animateCounter = (el, target, duration = 800) => {
    if (!target || target === 0) { el.textContent = '0'; return; }
    const start = performance.now();
    const update = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        el.textContent = Math.round(eased * target);
        if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
};

// État
chrome.storage.local.get(['enabled'], (result) => {
    currentEnabled = result.enabled !== false;
    updateButton();
});

// Stats depuis le content script
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { action: 'getStats' }, (response) => {
        if (chrome.runtime.lastError || !response) {
            statPage.textContent = '—';
            pageText.textContent = 'Pas encore actif sur cette page.';
            return;
        }

        // Animer les compteurs
        animateCounter(statPoliticians, response.total, 600);
        animateCounter(statPage, response.count, 800);

        if (response.count > 0) {
            pageDot.classList.remove('inactive');
            pageText.innerHTML = `<strong>${response.count} nom${response.count > 1 ? 's' : ''}</strong> surligné${response.count > 1 ? 's' : ''} sur cette page.`;
        } else {
            pageText.textContent = 'Aucun politicien répertorié ici.';
        }
    });
});

// Toggle
toggleBtn.addEventListener('click', () => {
    currentEnabled = !currentEnabled;
    chrome.storage.local.set({ enabled: currentEnabled });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: 'toggle', enabled: currentEnabled });
    });
    if (!currentEnabled) {
        animateCounter(statPage, 0, 400);
        pageText.textContent = 'Extension désactivée.';
        pageDot.classList.add('inactive');
    } else {
        pageDot.classList.remove('inactive');
    }
    updateButton();
});

function updateButton() {
    if (currentEnabled) {
        toggleBtn.className = 'toggle-btn on';
        toggleLabel.textContent = 'Extension activée';
    } else {
        toggleBtn.className = 'toggle-btn off';
        toggleLabel.textContent = 'Extension désactivée';
    }
}
