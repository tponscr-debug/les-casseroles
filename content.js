
// Import Google Font (Keep this as backup for fonts)
const fontLink = document.createElement('link');
fontLink.href = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;600;800;900&family=Inter:wght@400;500;600;800&display=swap';
fontLink.rel = 'stylesheet';
document.head.appendChild(fontLink);

// --- STRICT PALETTE (Awwwards Style) ---
const PALETTE = {
    orange: '#ff6b35',
    blue: '#54a0ff',
    yellow: '#feca57',
    lightYellow: '#fff4d3',
    green: '#1dd1a1',
    dark: '#2d3436',
    cream: '#fffbf2',
    white: '#ffffff',
    gray: '#636e72',
    lightGray: '#f1f2f6'
};

// Load politicians data
// Values: data objects. Keys: NORMALIZED names (lowercase, no accents).
let politiciansMap = new Map();
let isProcessing = false;
let floatIcon = null;
let modalElement = null;

// Helper: Remove accents and lowercase
const normalize = (str) => {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

const toTitleCase = (str) => {
    return str.replace(
        /\w\S*/g,
        text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
    );
};

// --- FLOAT BUBBLE (Hover) ---
const createFloatIcon = () => {
    if (floatIcon) return;
    floatIcon = document.createElement('div');
    floatIcon.id = 'casseroles-float-bubble';
    floatIcon.innerHTML = `Par ici les casseroles 🍳`;

    // NOTE: Styling moved to styles.css

    document.body.appendChild(floatIcon);

    floatIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = floatIcon.dataset.name;
        if (name) openModal(name, e);
    });
};

const showFloatIcon = (element, name) => {
    if (!floatIcon) createFloatIcon();
    floatIcon.dataset.name = name;

    const rect = element.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    floatIcon.style.display = 'block';

    let top = rect.top + scrollY - 50;
    let left = rect.left + scrollX + (rect.width / 2) - (floatIcon.offsetWidth / 2);

    floatIcon.style.top = `${top}px`;
    floatIcon.style.left = `${left}px`;
};

const hideFloatIcon = () => {
    if (floatIcon) setTimeout(() => {
        if (!floatIcon.matches(':hover')) floatIcon.style.display = 'none';
    }, 400);
};

const getPillStyle = (partyName) => {
    const palettes = [
        { bg: PALETTE.orange, text: '#fff', icon: '★' },
        { bg: PALETTE.blue, text: '#fff', icon: '☀' },
        { bg: PALETTE.green, text: '#fff', icon: '☘' },
        { bg: PALETTE.yellow, text: PALETTE.dark, icon: '✦' }
    ];

    if (!partyName) return { bg: '#b2bec3', text: '#fff', icon: '?' };

    let hash = 0;
    for (let i = 0; i < partyName.length; i++) {
        hash = partyName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % palettes.length;
    return palettes[index];
};

const createModal = () => {
    if (modalElement) return;
    modalElement = document.createElement('div');
    modalElement.id = 'casseroles-modal';

    // NOTE: Styling moved to styles.css

    document.body.appendChild(modalElement);
};

const openModal = (name, event) => {
    const data = politiciansMap.get(normalize(name));
    if (!data) return;

    if (!modalElement) createModal();

    const cleanRole = data ? (data.role || 'Homme politique') : 'Homme politique';
    const party = data ? (data.party || 'Sans étiquette') : 'Sans étiquette';
    const casseroles = data ? (data.timeline || []) : [];
    const satirical = data ? (data.satirical_comment || '') : '';
    const pill = getPillStyle(party);
    const potImageUrl = chrome.runtime.getURL('casserole_v3.png');

    const casseroleCount = casseroles.length;
    const casseroleText = `${casseroleCount} Casserole${casseroleCount > 1 ? 's' : ''}`;

    let itemsHtml = '';

    if (casseroles.length > 0) {
        itemsHtml = `<div id="casseroles-items-container" style="overflow-y:auto; padding:0 30px 30px 30px; flex:1;">`;
        casseroles.forEach(item => {
            const year = item.year || '?';
            const isJudicial = (item.type || '').toLowerCase().includes('jud');

            const tagLabel = isJudicial ? 'JUDICIAIRE' : 'POLÉMIQUE';
            const tagBg = isJudicial ? PALETTE.dark : PALETTE.yellow;
            const tagText = isJudicial ? '#fff' : PALETTE.dark;

            const query = encodeURIComponent(`${name} ${item.title}`);
            const searchUrl = `https://www.google.com/search?q=${query}`;

            itemsHtml += `
                <div style="background:#fff; border-radius:12px; padding:15px; margin-bottom:10px; box-shadow:0 3px 8px rgba(0,0,0,0.02); border:1px solid rgba(0,0,0,0.03); display:flex; flex-direction:column; gap:6px;">
                    <div style="display:flex; gap:6px; align-items:center;">
                        <span style="background:${PALETTE.lightGray}; color:${PALETTE.dark}; font-size:10px; font-weight:700; padding:3px 8px; border-radius:6px; font-family:'Inter', sans-serif;">
                            ${year.substring(0, 4)}
                        </span>
                        <span style="background:${tagBg}; color:${tagText}; font-size:9px; font-weight:800; padding:3px 8px; border-radius:6px; letter-spacing:0.4px; font-family:'Inter', sans-serif;">
                            ${tagLabel}
                        </span>
                    </div>
                    <div style="font-family:'Inter', sans-serif; font-size:14px; font-weight:500; line-height:1.4; color:${PALETTE.dark}; width:100%;">
                        ${item.title}
                    </div>
                    <a href="${searchUrl}" target="_blank" style="font-family:'Inter', sans-serif; font-size:10px; font-weight:800; color:#b2bec3; text-decoration:none; display:inline-flex; align-items:center; text-transform:uppercase; letter-spacing:0.8px; transition:color 0.2s; margin-top:2px; height:12px;">
                        Vérifier la source <span style="margin-left:3px;">↗</span>
                    </a>
                </div>
            `;
        });
        itemsHtml += `</div>`;
    } else {
        itemsHtml = `
            <div style="padding:40px; text-align:center; color:${PALETTE.green}; display:flex; flex-direction:column; align-items:center;">
                <div style="font-size:24px; font-weight:700;">Rien à signaler ! ✨</div>
                <div style="font-family:'Inter', sans-serif; font-size:14px; opacity:0.6; margin-top:5px;">L'encyclopédie n'a rien trouvé.</div>
            </div>`;
    }

    modalElement.innerHTML = `
        <div style="padding:40px 30px 20px 30px; display:flex; flex-direction:column; align-items:center; text-align:center; position:relative;">
             <button id="casseroles-close-btn" style="position:absolute; top:20px; right:20px; background:#f0e6d2; border:none; color:${PALETTE.dark}; width:36px; height:36px; border-radius:50%; font-size:20px; cursor:pointer; display:flex; justify-content:center; align-items:center; transition:all 0.2s;">&times;</button>
             
             <div style="margin-bottom:-10px; position:relative;">
                <img src="${potImageUrl}" alt="Pot" class="casseroles-pot-blend">
             </div>

             <div style="font-size:38px; font-weight:900; color:${PALETTE.dark}; line-height:1.1; letter-spacing:-0.04em; margin-bottom:8px; position:relative; z-index:2; text-shadow: 3px 3px 0px #fff; font-variation-settings: 'SOFT' 100, 'WONK' 1;">
                ${toTitleCase(name)}
             </div>
             
             <div style="margin-bottom:12px;">
                 <span style="background:${PALETTE.lightYellow}; color:${PALETTE.orange}; font-family:'Inter', sans-serif; font-size:12px; font-weight:800; padding:4px 12px; border-radius:20px; letter-spacing:0.5px; border:1px solid rgba(254,202,87,0.3);">
                    ${casseroleText}
                 </span>
             </div>

             <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:center;">
                 <div style="font-family:'Inter', sans-serif; font-size:13px; font-weight:500; color:#636e72;">
                    ${cleanRole}
                 </div>
                 <div style="background:${pill.bg}; color:${pill.text}; padding:6px 14px; border-radius:30px; font-family:'Inter', sans-serif; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; display:inline-flex; align-items:center; gap:6px; box-shadow:0 3px 6px rgba(0,0,0,0.05);">
                    <span style="font-size:14px;">${pill.icon}</span> ${party}
                 </div>
             </div>
        </div>

        ${itemsHtml}

        ${satirical ? `
            <div style="padding:24px 30px; background:#f9f5eb; border-top:1px solid rgba(0,0,0,0.03);">
                <div style="font-family:'Fraunces', serif; font-size:16px; font-style:italic; color:#636e72; line-height:1.5;">"${satirical}"</div>
            </div>
        ` : ''}

        <div class="casseroles-modal-footer">
            <a href="mailto:lcasseroles@gmail.com?subject=Signalement Les Casseroles : ${encodeURIComponent(name)}&body=Bonjour,%0A%0AJe souhaite signaler une erreur ou un oubli concernant ${encodeURIComponent(name)} :%0A%0A[Précisez ici votre correction ou ajout]%0A%0AMerci !" class="casseroles-report-link">
                🚨 Signaler une erreur ou suggérer un ajout
            </a>
        </div>
    `;

    modalElement.style.display = 'flex';
    modalElement.style.opacity = '0';

    if (event) {
        const modalWidth = 460;
        const modalHeight = Math.min(modalElement.offsetHeight, window.innerHeight * 0.9);
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const margin = 20;

        let left = event.clientX + 20;
        let top = event.clientY;

        if (left + modalWidth > viewportWidth - margin) {
            left = event.clientX - modalWidth - 20;
            if (left < margin) {
                left = viewportWidth - modalWidth - margin;
            }
        }

        const renderedHeight = modalElement.getBoundingClientRect().height;
        if (top + renderedHeight > viewportHeight - margin) {
            top = viewportHeight - renderedHeight - margin;
        }
        if (top < margin) {
            top = margin;
        }

        modalElement.style.left = `${left}px`;
        modalElement.style.top = `${top}px`;
        modalElement.style.transformOrigin = (left > event.clientX) ? 'top left' : 'top right';
    } else {
        modalElement.style.left = '50%';
        modalElement.style.top = '50%';
        modalElement.style.transform = 'translate(-50%, -50%)';
    }

    requestAnimationFrame(() => {
        if (event) modalElement.style.transform = 'scale(1)';
        else modalElement.style.transform = 'translate(-50%, -50%) scale(1)';
        modalElement.style.opacity = '1';
    });

    // Wire up events
    document.getElementById('casseroles-close-btn').onclick = () => {
        modalElement.style.opacity = '0';
        modalElement.style.transform = 'scale(0.95)';
        setTimeout(() => {
            modalElement.style.display = 'none';
        }, 200);
        hideFloatIcon();
    };

    const btn = document.getElementById('casseroles-close-btn');
    btn.onmouseenter = () => { btn.style.backgroundColor = '#e6dbc5'; btn.style.transform = 'rotate(90deg)'; };
    btn.onmouseleave = () => { btn.style.backgroundColor = '#f0e6d2'; btn.style.transform = 'rotate(0deg)'; };
};

const loadPoliticians = async () => {
    const url = chrome.runtime.getURL('casseroles_encyclopedia.json');
    try {
        const response = await fetch(url);
        const data = await response.json();
        Object.keys(data).forEach(key => {
            // Store NORMALIZED keys for lookup
            politiciansMap.set(normalize(key), data[key]);
        });
    } catch (e) {
        console.error("Transparency-FR: Failed to load encyclopedia", e);
    }
};

const highlightInNode = (node) => {
    if (node.nodeType === 3) {
        const text = node.nodeValue;
        if (!text || text.trim().length < 4) return;
        let parent = node.parentNode;

        if (!parent || parent.closest('#casseroles-modal')) return;

        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT'].includes(parent.nodeName) ||
            parent.isContentEditable || parent.classList.contains('casseroles-rough-highlight')) {
            return;
        }

        // Normalize text once for searching
        const textNorm = normalize(text);

        for (let [normKey, data] of politiciansMap) {
            // normKey is already normalized ("edouard philippe")

            const index = textNorm.indexOf(normKey);

            if (index !== -1) {
                const nameLength = normKey.length; // Approximate length in chars
                // Verify boundary chars on the ORIGINAL text but using the index found in Normalized?
                // Caution: "É" is 1 char in strings but normalize might change length?
                // "É" -> "E". Length is same (1).
                // "œ" -> "oe". Length changes! (1 -> 2).
                // "Å" -> "A". Same.
                // "ç" -> "c". Same.
                // In French, most accents (é, è, à, ê, î, ô, ù, ç) preserve length when decomposed+removed IF they are single chars.
                // NFD "É" is "E" + "combining acute". Length 2.
                // Replace removes the combining mark. Result "E" length 1.
                // So length SHOULD be preserved for standard french text.
                // Except maybe ligatures like "œ". normalize("NFD") doesn't decompose "œ" -> "oe" automatically?
                // "œ".normalize("NFD") is "œ". It stays.
                // So we might miss "Cœur".
                // But generally "Édouard" -> "Edouard" works.

                // We use normKey.length to slice the ORIGINAL string.
                // If length matches, we are good.

                // Let's rely on the found index for now.

                const before = text.charAt(index - 1);
                const after = text.charAt(index + nameLength);
                const isBoundary = (!before || !before.match(/[a-zà-ÿ0-9]/i)) &&
                    (!after || !after.match(/[a-zà-ÿ0-9]/i));

                if (isBoundary) {
                    const matchedName = text.substr(index, nameLength);
                    const afterText = text.substr(index + nameLength);
                    const beforeText = text.substr(0, index);

                    node.nodeValue = beforeText;

                    const highlightSpan = document.createElement('span');
                    highlightSpan.className = 'casseroles-rough-highlight';
                    highlightSpan.textContent = '🍳 ' + matchedName;

                    // IMPORTANT: Pass the ORIGINAL name (derived from key? or just the matched text?)
                    // openModal needs to lookup by key. 
                    // We stored keys as NORMALIZED.
                    // So we can pass `normKey` as data-name, and openModal should normalize it (it's already normalized).
                    // Or we pass `matchedName`. `openModal` normalizes input.
                    highlightSpan.setAttribute('data-name', matchedName);

                    highlightSpan.addEventListener('mouseenter', (e) => {
                        showFloatIcon(e.target, matchedName);
                    });

                    parent.insertBefore(highlightSpan, node.nextSibling);

                    if (afterText) {
                        const afterNode = document.createTextNode(afterText);
                        parent.insertBefore(afterNode, highlightSpan.nextSibling);
                    }
                    return;
                }
            }
        }
    } else if (node.nodeType === 1 && node.childNodes && !node.classList.contains('casseroles-rough-highlight')) {
        Array.from(node.childNodes).forEach(highlightInNode);
    }
};

const runHighlighter = () => {
    if (isProcessing || politiciansMap.size === 0) return;
    isProcessing = true;
    highlightInNode(document.body);
    isProcessing = false;
};

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
};

const debouncedHighlighter = debounce(runHighlighter, 250);

(async () => {
    await loadPoliticians();
    runHighlighter();
    setTimeout(runHighlighter, 1000);
    setTimeout(runHighlighter, 2500);
    setTimeout(runHighlighter, 4000);
    const observer = new MutationObserver((mutations) => {
        let shouldRun = false;
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                shouldRun = true;
            } else if (mutation.type === 'characterData') {
                shouldRun = true;
            }
        });
        if (shouldRun) debouncedHighlighter();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    document.addEventListener('click', (e) => {
        if (floatIcon && e.target !== floatIcon && !e.target.classList.contains('casseroles-rough-highlight')) {
            hideFloatIcon();
        }
        if (modalElement && e.target !== modalElement && !modalElement.contains(e.target) && e.target !== floatIcon) {
            if (modalElement.style.opacity === '1') {
                document.getElementById('casseroles-close-btn').click();
            }
        }
    });
})();
