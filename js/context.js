// Les Casseroles — vie du contexte d'extension.
// Quand l'extension est rechargée/mise à jour, le script déjà injecté dans les onglets ouverts devient ORPHELIN :
// tout appel chrome.* y lève « Extension context invalidated » (de façon SYNCHRONE : un .catch ne suffit pas).
// check() détecte l'orphelin une seule fois et prévient chaque module, qui retire ce qu'il a posé dans la page.
(() => {
    const NS = (globalThis.Casseroles = globalThis.Casseroles || {});
    const listeners = [];
    let dead = false;

    const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch { return false; } };
    const onDead = (fn) => { listeners.push(fn); };

    // true tant que le contexte est vivant ; au premier constat de mort, démonte tout (une seule fois).
    const check = () => {
        if (!dead && !alive()) {
            dead = true;
            for (const fn of listeners) { try { fn(); } catch { /* démontage au mieux */ } }
        }
        return !dead;
    };

    NS.context = { alive, check, onDead, isDead: () => dead };
})();
