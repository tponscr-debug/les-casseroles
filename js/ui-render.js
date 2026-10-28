// Les Casseroles — rendu HTML de la modale (fonctions pures, testables sous Node).
// Toute valeur issue des données passe par escapeHtml / safeUrl : aucune injection possible.
(() => {
    const NS = (globalThis.Casseroles = globalThis.Casseroles || {});
    const { escapeHtml: esc, safeUrl, toTitleCase } = NS.text;
    const { affairsOf } = NS.data;

    const PILL_COLORS = [
        { bg: '#1E3A5F', text: '#E8D5A3' }, { bg: '#8B1A1A', text: '#F5E6E6' },
        { bg: '#1A4731', text: '#C8E6C9' }, { bg: '#4A3728', text: '#F5DEB3' },
    ];
    const pillStyle = (party) => {
        if (!party) return { bg: '#3A3530', text: '#9A9088' };
        let hash = 0;
        for (let i = 0; i < party.length; i++) hash = party.charCodeAt(i) + ((hash << 5) - hash);
        return PILL_COLORS[Math.abs(hash) % PILL_COLORS.length];
    };

    // Libellés juridiquement prudents : présomption d'innocence explicite, définitivité jamais présumée.
    const statusInfo = (item) => {
        switch (item.status) {
            case 'condamne':
                if (item.final === true)  return { cls: 'final',   label: '⚖ Condamnation définitive', rank: 5 };
                if (item.final === false) return { cls: 'convict', label: '⚖ Condamné · non définitif', rank: 4 };
                return { cls: 'convict', label: '⚖ Condamné · caractère définitif non établi', rank: 4 };
            case 'mis_en_examen': return { cls: 'proc',  label: '⚖ Mis en examen · présumé innocent', rank: 3 };
            case 'renvoye':       return { cls: 'proc',  label: '⚖ Renvoyé en procès · présumé innocent', rank: 3 };
            case 'enquete':       return { cls: 'proc',  label: '⚖ Enquête · présumé innocent', rank: 2 };
            case 'mise_en_cause': return { cls: 'proc',  label: '⚖ Mise en cause · présumé innocent', rank: 2 };
            case 'relaxe':        return { cls: 'clear', label: '✓ Relaxé', rank: 1 };
            case 'non_lieu':      return { cls: 'clear', label: '✓ Non-lieu', rank: 1 };
            default:              return { cls: 'polem', label: '🔥 Polémique', rank: 0 };
        }
    };

    const summarize = (items) => {
        const c = { definitive: 0, convicted: 0, procedures: 0, cleared: 0, polemics: 0 };
        for (const it of items) {
            const { cls } = statusInfo(it);
            if (cls === 'final') c.definitive++;
            else if (cls === 'convict') c.convicted++;
            else if (cls === 'proc') c.procedures++;
            else if (cls === 'clear') c.cleared++;
            else c.polemics++;
        }
        const score = 5 * c.definitive + 3 * c.convicted + 1.5 * c.procedures + 0.5 * c.polemics;
        const label = c.definitive ? '🔴 Très grillé' : c.convicted ? '🟠 Bien grillé'
            : c.procedures ? '🟡 Sur le feu' : '🟢 Peu grillé';
        const parts = [
            [c.definitive, 'condamnation définitive', 'condamnations définitives'],
            [c.convicted, 'condamnation non définitive', 'condamnations non définitives'],
            [c.procedures, 'procédure en cours', 'procédures en cours'],
            [c.cleared, 'relaxe / non-lieu', 'relaxes / non-lieux'],
            [c.polemics, 'polémique', 'polémiques'],
        ].filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n > 1 ? many : one}`);
        return { ...c, score, pct: Math.min(100, Math.round((score / 12) * 100)), label, breakdown: parts.join(' · ') };
    };

    const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

    const renderSources = (item, name) => {
        const seen = new Set();
        const links = (item.sources || []).map((s) => ({ url: safeUrl(s.url), label: s.kind === 'wikipedia' ? 'Wikipédia (révision citée)' : (s.outlet || hostOf(s.url)) }))
            .filter((s) => s.url && !seen.has(s.url) && seen.add(s.url)).slice(0, 4)
            .map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" class="casseroles-item-link">${esc(s.label)} ↗</a>`);
        if (links.length) return `<div class="casseroles-sources"><span>Sources</span>${links.join('')}</div>`;
        const q = `https://www.google.com/search?q=${encodeURIComponent(`${name} ${item.title}`)}`;
        return `<div class="casseroles-sources"><span class="casseroles-unsourced">Non sourcé</span>` +
               `<a href="${esc(q)}" target="_blank" rel="noopener noreferrer" class="casseroles-item-link">Chercher dans la presse ↗</a></div>`;
    };

    const renderItem = (item, index, name) => {
        const info = statusInfo(item);
        const verif = item.verification === 'verified' ? '<span class="casseroles-verif ok">✓ Vérifié</span>'
            : item.verification === 'sourced' ? '<span class="casseroles-verif">Sourcé</span>' : '';
        const proof = item.evidence
            ? `<details class="casseroles-proof"><summary>Voir la preuve citée</summary><blockquote>« ${esc(item.evidence)} »</blockquote></details>` : '';
        return `
            <div class="casseroles-item" style="animation-delay:${index * 0.06}s">
                <div class="casseroles-item-meta">
                    <span class="casseroles-tag-year">${esc(String(item.year || '?').substring(0, 4))}</span>
                    <span class="casseroles-chip casseroles-chip-${info.cls}">${esc(info.label)}</span>${verif}
                </div>
                <div class="casseroles-item-title">${esc(item.title)}</div>
                ${proof}${renderSources(item, name)}
            </div>`;
    };

    const formatDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); };

    // opts : { potUrl, meta, reportUrl }
    const renderModal = (name, entry, opts = {}) => {
        const items = affairsOf(entry).sort((a, b) =>
            statusInfo(b).rank - statusInfo(a).rank || String(b.year).localeCompare(String(a.year)));
        const sum = summarize(items);
        const party = entry.party || 'Sans étiquette';
        const pill = pillStyle(entry.party);
        // L'humour ne s'invite jamais sur un dossier judiciaire.
        const humour = entry.satirical_comment && !(sum.definitive || sum.convicted || sum.procedures)
            ? `<div class="casseroles-satirical"><span class="casseroles-humour-tag">Humour</span>« ${esc(entry.satirical_comment)} »</div>` : '';
        const checked = formatDate(entry.checked_at || (opts.meta && opts.meta.verified_at));
        const body = items.length
            ? `<div id="casseroles-items-container">${items.map((it, i) => renderItem(it, i, name)).join('')}</div>`
            : `<div class="casseroles-empty"><div class="casseroles-empty-icon">✨</div><div class="casseroles-empty-title">Casier vierge</div>
               <div class="casseroles-empty-sub">Aucune affaire vérifiée à ce jour.</div></div>`;
        return `
            <div class="casseroles-modal-header">
                <button id="casseroles-close-btn" aria-label="Fermer">✕</button>
                <div class="casseroles-header-top">
                    <span class="casseroles-dossier-label">Dossier public · sources citées</span>
                    ${opts.potUrl ? `<img src="${esc(opts.potUrl)}" alt="" class="casseroles-pot-blend" aria-hidden="true">` : ''}
                </div>
                <div class="casseroles-modal-name">${esc(toTitleCase(name))}</div>
                <div class="casseroles-modal-meta">
                    <span class="casseroles-role">${esc(entry.role || 'Personnalité politique')}</span>
                    <span class="casseroles-party-pill" style="background:${pill.bg};color:${pill.text};">${esc(party)}</span>
                </div>
            </div>
            <div class="casseroles-severity">
                <div class="casseroles-severity-top">
                    <div><span class="casseroles-count-number">${items.length}</span>
                    <span class="casseroles-count-label"> affaire${items.length > 1 ? 's' : ''} documentée${items.length > 1 ? 's' : ''}</span></div>
                    <span class="casseroles-severity-pct">${esc(sum.label)}</span>
                </div>
                <div class="casseroles-severity-track"><div class="casseroles-severity-fill" style="width:${sum.pct}%"></div></div>
                <div class="casseroles-breakdown">${esc(sum.breakdown)}</div>
            </div>
            ${body}${humour}
            <div class="casseroles-modal-footer">
                ${checked ? `<span class="casseroles-checked">Vérifié le ${esc(checked)}</span>` : ''}
                ${opts.reportUrl ? `<a href="${esc(opts.reportUrl)}" target="_blank" rel="noopener noreferrer" class="casseroles-report-link">Signaler une erreur · droit de réponse</a>` : ''}
            </div>`;
    };

    NS.render = { statusInfo, summarize, renderItem, renderModal, pillStyle };
})();
