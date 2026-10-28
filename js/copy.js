// Les Casseroles — micro-textes. Deux registres : « funny » (brasserie) et « serious » (même contenu, sans blagues).
// RÈGLE : on rigole du décor, jamais du verdict. Les lignes de statut juridique ne passent PAS par ce fichier
// (elles sont dans ui-render.js::statusInfo, sobres dans les deux modes).
(() => {
    const NS = (globalThis.Casseroles = globalThis.Casseroles || {});

    const FUNNY = {
        brand: '*** LA CASSEROLE ***', sub: 'Brasserie de la Transparence', sub2: 'Cuisine ouverte 7j/7 · Toques : 0',
        table: 'TABLE 4 · SERVEUR : LE PUBLIC',
        bubbles: ['🧾 Voir l’addition', '🧾 Demander la note', '🧾 Une note vous attend'],
        total: 'TOTAL À LA CASSEROLE', judicial: 'dont judiciaires',
        tva: "TVA (Tout Vient d'Appel)", tvaValue: '—',
        service: 'SERVICE', serviceValue: "présomption d'innocence COMPRISE",
        cuisson: 'CUISSON', levels: { none: 'CRU', polemic: 'SAIGNANT', proc: 'À MIJOTER', convict: 'SUR LE FEU', final: 'BIEN CUIT' },
        side: { final: 'RÉGLÉE', convict: 'EN COURS', proc: 'EN COURS', clear: 'ANNULÉE ✓', polem: '1×' },
        waiter: 'NOTE DU SERVEUR',
        thanks: 'MERCI DE VOTRE VISITE', thanksSub: "Revenez quand c'est prescrit.",
        thanksJudicial: 'PAS DE POURBOIRE', thanksJudicialSub: 'Les faits sont gratuits.',
        guarantee: 'Aucune affirmation sans preuve.', foot: 'Ticket non échangeable, comme les voix.',
        reply: 'Droit de réponse : au dos du ticket',
        empty: 'Note à zéro. Le serveur soupçonne une erreur de caisse.',
        popup: { on: 'Caisse ouverte', off: 'Caisse fermée', pageLabel: 'NOMS SUR CETTE PAGE', totalLabel: 'DOSSIERS EN BASE',
                 none: 'Rien à facturer ici.', off_text: 'Caisse fermée : on ne facture plus.', idle: 'Impression du ticket…',
                 count: (n) => `${n} note${n > 1 ? 's' : ''} sur cette page.`, thanks: "Revenez quand c'est prescrit.", inactive: 'Pas encore actif sur cette page.' },
    };

    const SERIOUS = {
        brand: 'LES CASSEROLES', sub: 'Base publique · sources citées', sub2: '', table: '',
        bubbles: ['Voir le dossier'],
        total: 'AFFAIRES DOCUMENTÉES', judicial: 'dont judiciaires', tva: '', tvaValue: '',
        service: 'PRÉSOMPTION D’INNOCENCE', serviceValue: 'tant que la décision n’est pas définitive',
        cuisson: 'PLUS HAUT STATUT', levels: { none: 'Aucune', polemic: 'Polémiques', proc: 'Procédure en cours', convict: 'Condamnation non définitive', final: 'Condamnation définitive' },
        side: { final: '1×', convict: '1×', proc: '1×', clear: '1×', polem: '1×' },
        waiter: '',
        thanks: 'SOURCES CITÉES', thanksSub: 'Aucune affirmation sans preuve.',
        thanksJudicial: 'SOURCES CITÉES', thanksJudicialSub: 'Aucune affirmation sans preuve.',
        guarantee: '', foot: '',
        reply: 'Signaler une erreur · droit de réponse',
        empty: 'Aucune affaire vérifiée à ce jour.',
        popup: { on: 'Activée', off: 'Désactivée', pageLabel: 'NOMS SUR CETTE PAGE', totalLabel: 'DOSSIERS EN BASE',
                 none: 'Aucun nom répertorié ici.', off_text: 'Extension désactivée.', idle: 'Analyse en cours…',
                 count: (n) => `${n} nom${n > 1 ? 's' : ''} surligné${n > 1 ? 's' : ''} sur cette page.`, thanks: 'Sources citées sur chaque fiche.', inactive: 'Pas encore actif sur cette page.' },
    };

    const get = (humor) => (humor === 'serious' ? SERIOUS : FUNNY);
    const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
    // Texte de la bulle : stable pour un nom donné (pas de scintillement au survol).
    const bubble = (humor, name) => { const b = get(humor).bubbles; return b[hash(name) % b.length]; };

    NS.copy = { get, hash, bubble };
})();
