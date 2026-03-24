// Les Casseroles — Service Worker
// Responsabilité : gérer le badge sur l'icône de l'extension.

chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg.action === 'setBadge' && sender.tab) {
        const count = msg.count;
        const text = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
        chrome.action.setBadgeText({ text, tabId: sender.tab.id });
        chrome.action.setBadgeBackgroundColor({ color: '#ff6b35', tabId: sender.tab.id });
    }
});
