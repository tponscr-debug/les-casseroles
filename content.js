// Les Casseroles — Content Script v2.0
// Responsabilité : détecter les noms de politiques sur n'importe quelle page
// et afficher leurs casseroles au survol.

const fontLink = document.createElement('link');
fontLink.href = 'https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Libre+Bodoni:wght@700&family=DM+Sans:wght@400;500;700&display=swap';
fontLink.rel = 'stylesheet';
document.head.appendChild(fontLink);

// Couleurs dynamiques uniquement (pills de partis — valeurs assignées par hash)
const PILL_COLORS = [
    { bg: '#1E3A5F', text: '#E8D5A3' }, // Bleu nuit / or
    { bg: '#8B1A1A', text: '#F5E6E6' }, // Rouge sombre / crème
    { bg: '#1A4731', text: '#C8E6C9' }, // Vert profond / vert clair
    { bg: '#4A3728', text: '#F5DEB3' }, // Brun / blé
];

let politiciansMap = new Map();
let highlightCount = 0;
let isEnabled = true;
let floatIcon = null;
let modalElement = null;

// --- HELPERS ---

const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const toTitleCase = (str) => str.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.substring(1).toLowerCase());

const getPillStyle = (partyName) => {
    if (!partyName) return { bg: '#3A3530', text: '#9A9088' };
    let hash = 0;
    for (let i = 0; i < partyName.length; i++) hash = partyName.charCodeAt(i) + ((hash << 5) - hash);
    return PILL_COLORS[Math.abs(hash) % PILL_COLORS.length];
};

// --- FLOAT BUBBLE ---
// position: fixed — ne dépend pas du scroll ni des conteneurs transformés

const createFloatIcon = () => {
    if (floatIcon) return;
    floatIcon = document.createElement('div');
    floatIcon.id = 'casseroles-float-bubble';
    floatIcon.textContent = '🍳 Voir les casseroles';
    document.body.appendChild(floatIcon);
    floatIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = floatIcon.dataset.name;
        if (name) openModal(name);
    });
};

const showFloatIcon = (element, name) => {
    if (!isEnabled) return;
    if (!floatIcon) createFloatIcon();
    floatIcon.dataset.name = name;
    floatIcon.style.display = 'block';
    // Forcer un repaint pour avoir offsetWidth
    const bw = floatIcon.offsetWidth;
    const rect = element.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - bw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
    floatIcon.style.left = `${left}px`;
    floatIcon.style.top = `${rect.top - 48}px`;
};

const hideFloatIcon = (force = false) => {
    if (!floatIcon) return;
    if (force) { floatIcon.style.display = 'none'; return; }
    setTimeout(() => {
        if (floatIcon && !floatIcon.matches(':hover')) floatIcon.style.display = 'none';
    }, 300);
};

// --- MODAL ---

const createModal = () => {
    if (modalElement) return;
    modalElement = document.createElement('div');
    modalElement.id = 'casseroles-modal';
    document.body.appendChild(modalElement);
};

const closeModal = () => {
    if (!modalElement || modalElement.style.display === 'none') return;
    modalElement.style.opacity = '0';
    modalElement.style.transform = 'translate(-50%, -50%) scale(0.95)';
    setTimeout(() => { if (modalElement) modalElement.style.display = 'none'; }, 200);
    hideFloatIcon(true);
};

const openModal = (name) => {
    const data = politiciansMap.get(normalize(name));
    if (!data) return;
    if (!modalElement) createModal();

    const party = data.party || 'Sans étiquette';
    const casseroles = data.timeline || [];
    const pill = getPillStyle(party);
    const casseroleCount = casseroles.length;
    const potImageUrl = chrome.runtime.getURL('casserole_v3.png');

    const severityPct = Math.min(100, Math.round((casseroleCount / 15) * 100));

    let itemsHtml = '';
    if (casseroles.length > 0) {
        itemsHtml = '<div id="casseroles-items-container">';
        casseroles.forEach((item, index) => {
            const isJudicial = (item.type || '').toLowerCase().includes('jud');
            const tagClass   = isJudicial ? 'casseroles-tag-judicial' : 'casseroles-tag-polemique';
            const tagLabel   = isJudicial ? '⚖ Judiciaire' : '🔥 Polémique';
            const searchUrl  = `https://www.google.com/search?q=${encodeURIComponent(`${name} ${item.title}`)}`;
            itemsHtml += `
                <div class="casseroles-item" style="animation-delay:${index * 0.06}s">
                    <div class="casseroles-item-meta">
                        <span class="casseroles-tag-year">${(item.year || '?').substring(0, 4)}</span>
                        <span class="casseroles-tag-type ${tagClass}">${tagLabel}</span>
                    </div>
                    <div class="casseroles-item-title">${item.title}</div>
                    <a href="${searchUrl}" target="_blank" rel="noopener" class="casseroles-item-link">
                        Vérifier dans la presse ↗
                    </a>
                </div>`;
        });
        itemsHtml += '</div>';
    } else {
        itemsHtml = `
            <div class="casseroles-empty">
                <div class="casseroles-empty-icon">✨</div>
                <div class="casseroles-empty-title">Casier vierge</div>
                <div class="casseroles-empty-sub">Aucune affaire répertoriée à ce jour.</div>
            </div>`;
    }

    modalElement.innerHTML = `
        <div class="casseroles-modal-header">
            <button id="casseroles-close-btn" aria-label="Fermer">✕</button>
            <div class="casseroles-header-top">
                <span class="casseroles-dossier-label">Dossier confidentiel</span>
                <img src="${potImageUrl}" alt="" class="casseroles-pot-blend" aria-hidden="true">
            </div>
            <div class="casseroles-modal-name">${toTitleCase(name)}</div>
            <div class="casseroles-modal-meta">
                <span class="casseroles-role">${data.role || 'Homme politique'}</span>
                <span class="casseroles-party-pill" style="background:${pill.bg};color:${pill.text};">${party}</span>
            </div>
        </div>
        <div class="casseroles-severity">
            <div class="casseroles-severity-top">
                <div>
                    <span class="casseroles-count-number">${casseroleCount}</span>
                    <span class="casseroles-count-label"> affaire${casseroleCount > 1 ? 's' : ''} répertoriée${casseroleCount > 1 ? 's' : ''}</span>
                </div>
                <span class="casseroles-severity-pct">${severityPct >= 80 ? '🔴 Très grillé' : severityPct >= 50 ? '🟠 Bien grillé' : severityPct >= 20 ? '🟡 Légèrement grillé' : '🟢 Peu grillé'}</span>
            </div>
            <div class="casseroles-severity-track">
                <div class="casseroles-severity-fill" style="width:${severityPct}%"></div>
            </div>
        </div>
        ${itemsHtml}
        ${data.satirical_comment ? `
            <div class="casseroles-satirical">"${data.satirical_comment}"</div>` : ''}
        <div class="casseroles-modal-footer">
            <a href="mailto:lcasseroles@gmail.com?subject=Signalement Les Casseroles : ${encodeURIComponent(name)}&body=Bonjour,%0A%0AJe souhaite signaler une erreur ou un oubli concernant ${encodeURIComponent(name)} :%0A%0A[Précisez ici votre correction ou ajout]%0A%0AMerci !" class="casseroles-report-link">
                Signaler une erreur · Proposer un ajout
            </a>
        </div>`;

    // Reset scroll
    const container = modalElement.querySelector('#casseroles-items-container');
    if (container) container.scrollTop = 0;

    // Affichage centré fixe
    modalElement.style.display = 'flex';
    modalElement.style.opacity = '0';
    modalElement.style.transform = 'translate(-50%, -50%) scale(0.95)';

    requestAnimationFrame(() => {
        modalElement.style.opacity = '1';
        modalElement.style.transform = 'translate(-50%, -50%) scale(1)';
    });

    const closeBtn = document.getElementById('casseroles-close-btn');
    closeBtn.onclick = closeModal;
    closeBtn.onmouseenter = () => { closeBtn.style.backgroundColor = '#e6dbc5'; closeBtn.style.transform = 'rotate(90deg)'; };
    closeBtn.onmouseleave = () => { closeBtn.style.backgroundColor = '#f0e6d2'; closeBtn.style.transform = ''; };
};

// --- MOTEUR DE SURLIGNAGE ---

const createHighlightSpan = (matchedName) => {
    const span = document.createElement('span');
    span.className = 'casseroles-rough-highlight';
    span.textContent = matchedName;
    span.setAttribute('data-name', matchedName);
    // Survol → bulle flottante
    span.addEventListener('mouseenter', (e) => showFloatIcon(e.currentTarget, matchedName));
    span.addEventListener('mouseleave', () => hideFloatIcon());
    // Clic direct → modale
    span.addEventListener('click', (e) => { e.stopPropagation(); openModal(matchedName); });
    return span;
};

// FIX: récursion sur afterNode pour trouver plusieurs politiques dans le même nœud texte
const processTextNode = (node) => {
    if (!node.parentNode || !node.nodeValue) return;
    const text = node.nodeValue;
    if (text.trim().length < 4) return;

    const textNorm = normalize(text);

    for (const [normKey] of politiciansMap) {
        const index = textNorm.indexOf(normKey);
        if (index === -1) continue;

        const nameLength = normKey.length;
        const before = text.charAt(index - 1);
        const after  = text.charAt(index + nameLength);
        const isBoundary = (!before || !/[a-zà-ÿ0-9]/i.test(before)) &&
                           (!after  || !/[a-zà-ÿ0-9]/i.test(after));

        if (!isBoundary) continue;

        const parent = node.parentNode;
        if (!parent) return;

        const matchedName = text.substr(index, nameLength);
        const beforeText  = text.substr(0, index);
        const afterText   = text.substr(index + nameLength);

        node.nodeValue = beforeText;

        const span = createHighlightSpan(matchedName);
        parent.insertBefore(span, node.nextSibling);

        if (afterText) {
            const afterNode = document.createTextNode(afterText);
            parent.insertBefore(afterNode, span.nextSibling);
            processTextNode(afterNode); // ← FIX: scanner la suite pour d'autres politiques
        }

        highlightCount++;
        return;
    }
};

// PERF: TreeWalker (natif C++) au lieu d'une récursion JS
const runHighlighter = () => {
    if (politiciansMap.size === 0 || !isEnabled) return;

    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node) => {
                const p = node.parentNode;
                if (!p) return NodeFilter.FILTER_REJECT;
                if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT'].includes(p.nodeName))
                    return NodeFilter.FILTER_REJECT;
                if (p.isContentEditable) return NodeFilter.FILTER_REJECT;
                if (p.closest && p.closest('#casseroles-modal, #casseroles-float-bubble, .casseroles-rough-highlight'))
                    return NodeFilter.FILTER_REJECT;
                if (!node.nodeValue || node.nodeValue.trim().length < 4)
                    return NodeFilter.FILTER_SKIP;
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    // Snapshot des nœuds avant modification du DOM
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(processTextNode);

    // Badge sur l'icône extension
    chrome.runtime.sendMessage({ action: 'setBadge', count: highlightCount }).catch(() => {});
};

// --- TOGGLE (depuis le popup) ---

const disableHighlights = () => {
    document.querySelectorAll('.casseroles-rough-highlight').forEach(span => {
        const text = document.createTextNode(span.textContent);
        span.parentNode.replaceChild(text, span);
    });
    hideFloatIcon(true);
    closeModal();
    highlightCount = 0;
    chrome.runtime.sendMessage({ action: 'setBadge', count: 0 }).catch(() => {});
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'toggle') {
        isEnabled = msg.enabled;
        chrome.storage.local.set({ enabled: isEnabled });
        if (!isEnabled) disableHighlights();
        else runHighlighter();
    }
    if (msg.action === 'getStats') {
        sendResponse({ count: highlightCount, total: politiciansMap.size });
        return true;
    }
});

// --- ÉVÉNEMENTS GLOBAUX ---

// FIX: Echap pour fermer la modale
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

document.addEventListener('click', (e) => {
    if (floatIcon && !e.target.closest('#casseroles-float-bubble') && !e.target.closest('.casseroles-rough-highlight')) {
        hideFloatIcon(true);
    }
    if (modalElement && modalElement.style.display !== 'none' &&
        !modalElement.contains(e.target) &&
        !e.target.closest('.casseroles-rough-highlight') &&
        e.target !== floatIcon) {
        closeModal();
    }
});

// --- CHARGEMENT & INIT ---

const loadPoliticians = async () => {
    try {
        const url = chrome.runtime.getURL('casseroles_encyclopedia.json');
        const data = await (await fetch(url)).json();
        // FIX: exclure les politiques sans aucune casserole de la Map (pas de sursurlignage inutile)
        Object.keys(data).forEach(key => {
            const entry = data[key];
            if (entry.timeline && entry.timeline.length > 0) {
                politiciansMap.set(normalize(key), entry);
            }
        });
        console.log(`Les Casseroles: ${politiciansMap.size} politiques chargés avec des affaires.`);
    } catch (e) {
        console.error('Les Casseroles: Échec du chargement de l\'encyclopédie', e);
    }
};

(async () => {
    // Lire l'état activé/désactivé depuis le storage
    const stored = await chrome.storage.local.get(['enabled']);
    isEnabled = stored.enabled !== false;

    await loadPoliticians();

    if (isEnabled) runHighlighter();

    const debounce = (fn, wait) => {
        let t;
        return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
    };

    const debouncedRun = debounce(runHighlighter, 400);

    // FIX: observer uniquement childList (pas characterData → évite les boucles)
    const observer = new MutationObserver((mutations) => {
        if (!isEnabled) return;
        const hasNew = mutations.some(m => m.type === 'childList' && m.addedNodes.length > 0);
        if (hasNew) debouncedRun();
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
