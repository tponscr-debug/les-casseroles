// Les Casseroles — Service Worker
// Responsabilité : gérer le badge sur l'icône de l'extension.

// L'onglet peut avoir été fermé ou rechargé entre l'envoi du message et son traitement :
// chrome.action rejette alors la promesse ("No tab with id") — on l'ignore, ce n'est pas une erreur.
const ignore = (promise) => Promise.resolve(promise).catch(() => {});

const onMessage = (msg, sender) => {
    if (msg.action !== 'setBadge' || !sender.tab) return;
    const count = msg.count;
    const text = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
    ignore(chrome.action.setBadgeText({ text, tabId: sender.tab.id }));
    ignore(chrome.action.setBadgeBackgroundColor({ color: '#ff6b35', tabId: sender.tab.id }));
};

// Pendant un rechargement de l'extension, Chrome peut relancer ce script alors que `chrome.runtime` n'existe déjà plus :
// on n'enregistre l'écouteur que si l'API est là (le prochain démarrage, propre, le fera).
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(onMessage);
}

if (typeof module !== 'undefined') module.exports = { onMessage };   // tests Node (le service worker n'a pas `module`)
