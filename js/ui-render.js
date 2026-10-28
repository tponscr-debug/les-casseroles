// Les Casseroles — rendu HTML de la fiche « L'Addition » (fonctions pures, testables sous Node).
// Toute valeur issue des données passe par escapeHtml / safeUrl : aucune injection possible.
(() => {
    const NS = (globalThis.Casseroles = globalThis.Casseroles || {});
    const { escapeHtml: esc, safeUrl, toTitleCase } = NS.text;
    const { affairsOf, LEGAL } = NS.data;
    const { get: copyOf, hash } = NS.copy;

    // Libellés juridiquement prudents, SOBRES dans les deux modes : présomption d'innocence explicite,
    // définitivité jamais présumée. Les blagues vivent ailleurs (copy.js), jamais ici.
    const statusInfo = (item) => {
        switch (item.status) {
            case 'condamne':
                if (item.final === true)  return { cls: 'final',   tag: 'conv',  label: 'Condamnation définitive', rank: 5 };
                if (item.final === false) return { cls: 'convict', tag: 'conv',  label: 'Condamné · non définitif', rank: 4 };
                return { cls: 'convict', tag: 'conv', label: 'Condamné · caractère définitif non établi', rank: 4 };
            case 'mis_en_examen': return { cls: 'proc',  tag: 'proc',  label: 'Mis en examen · présumé innocent', rank: 3 };
            case 'renvoye':       return { cls: 'proc',  tag: 'proc',  label: 'Renvoyé en procès · présumé innocent', rank: 3 };
            case 'enquete':       return { cls: 'proc',  tag: 'proc',  label: 'Enquête · présumé innocent', rank: 2 };
            case 'mise_en_cause': return { cls: 'proc',  tag: 'proc',  label: 'Mise en cause · présumé innocent', rank: 2 };
            case 'relaxe':        return { cls: 'clear', tag: 'clear', label: 'Relaxé', rank: 1 };
            case 'non_lieu':      return { cls: 'clear', tag: 'clear', label: 'Non-lieu', rank: 1 };
            default:              return { cls: 'polem', tag: '',      label: 'Polémique', rank: 0 };
        }
    };

    const summarize = (items) => {
        const c = { definitive: 0, convicted: 0, procedures: 0, cleared: 0, polemics: 0 };
        for (const it of items) {
            const { cls } = statusInfo(it);
            if (cls === 'final') c.definitive++; else if (cls === 'convict') c.convicted++;
            else if (cls === 'proc') c.procedures++; else if (cls === 'clear') c.cleared++; else c.polemics++;
        }
        const level = c.definitive ? 'final' : c.convicted ? 'convict' : c.procedures ? 'proc' : c.polemics ? 'polemic' : 'none';
        const blocks = { none: 0, polemic: 2, proc: 3, convict: 4, final: 7 }[level];
        const judicial = items.filter((i) => LEGAL.has(i.status)).length;
        return { ...c, level, blocks, judicial, legal: c.definitive + c.convicted + c.procedures };
    };

    const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

    const renderSources = (item, name) => {
        const seen = new Set();
        const links = (item.sources || []).map((s) => ({ url: safeUrl(s.url), label: s.kind === 'wikipedia' ? 'Wikipédia (révision citée)' : (s.outlet || hostOf(s.url)) }))
            .filter((s) => s.url && !seen.has(s.url) && seen.add(s.url)).slice(0, 4)
            .map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a>`);
        if (links.length) return `<p class="src">Sources : ${links.join(' · ')}</p>`;
        const q = `https://www.google.com/search?q=${encodeURIComponent(`${name} ${item.title}`)}`;
        return `<p class="src">Non sourcé · <a href="${esc(q)}" target="_blank" rel="noopener noreferrer">chercher dans la presse</a></p>`;
    };

    const renderLine = (item, name, T) => {
        const info = statusInfo(item);
        const verif = item.verification === 'verified' ? '<span class="ok">✓ VÉRIFIÉ</span>'
            : item.verification === 'sourced' ? '<span class="ok">SOURCÉ</span>' : '';
        const proof = item.evidence
            ? `<details class="proof"><summary>preuve citée</summary><blockquote>« ${esc(item.evidence)} »</blockquote></details>` : '';
        return `
            <div class="line">
                <div class="row"><span class="yr">${esc(String(item.year || '?').substring(0, 4))}</span><b class="side">${esc(T.side[info.cls])}</b></div>
                <span class="tag ${esc(info.tag)}">${esc(info.label)}</span>
                <p class="txt">${esc(item.title)}</p>
                ${verif ? `<p class="meta2">${verif}</p>` : ''}${proof}${renderSources(item, name)}
            </div>`;
    };

    // Un seul tampon n'est exact que pour UNE affaire ; au-delà il renvoie aux lignes (un dossier mixte ne doit pas se lire d'un coup d'œil faux).
    const stampOf = (items) => {
        const legal = items.filter((i) => LEGAL.has(i.status) && i.status !== 'relaxe' && i.status !== 'non_lieu');
        if (legal.length === 0) return '';
        if (legal.length > 1) return 'Statut : voir chaque ligne';
        const i = legal[0];
        if (i.status !== 'condamne') return 'Présumé innocent';
        return i.final === true ? 'Définitive' : i.final === false ? 'Non définitif' : 'Définitif non établi';
    };
    const bar = (n) => '▓'.repeat(n) + '░'.repeat(7 - n);
    const formatDate = (d, opts) => d.toLocaleDateString('fr-FR', opts);

    // opts : { humor, potUrl, meta, reportUrl, now }
    const renderModal = (name, entry, opts = {}) => {
        const T = copyOf(opts.humor);
        const now = opts.now || new Date();
        const items = affairsOf(entry).sort((a, b) =>
            statusInfo(b).rank - statusInfo(a).rank || String(b.year).localeCompare(String(a.year)));
        const sum = summarize(items);
        const hasJudicial = sum.judicial > 0;
        const checkedIso = entry.checked_at || (opts.meta && opts.meta.verified_at);
        const checked = checkedIso && !isNaN(new Date(checkedIso)) ? formatDate(new Date(checkedIso), { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
        const stamp = stampOf(items);
        // Le mot du serveur (humour par personne) : jamais sur un dossier judiciaire, jamais en mode sérieux.
        const waiter = T.waiter && entry.satirical_comment && !hasJudicial
            ? `<div class="waiter"><span class="tag">${esc(T.waiter)}</span><p class="txt">« ${esc(entry.satirical_comment)} »</p></div>` : '';
        const lines = items.length ? items.map((it) => renderLine(it, name, T)).join('')
            : `<p class="txt empty">${esc(T.empty)}</p>`;
        const party = entry.party || 'Sans étiquette';
        const ticketNo = `${String(hash(name) % 10000).padStart(4, '0')}-${String(items.length).padStart(2, '0')}${String(sum.judicial).padStart(2, '0')}`;
        const thanks = hasJudicial ? [T.thanksJudicial, T.thanksJudicialSub] : [T.thanks, T.thanksSub];

        return `
            <button id="casseroles-close-btn" aria-label="Fermer">✕</button>
            <div class="c brand">${esc(T.brand)}</div>
            <div class="c meta">${esc(T.sub)}${T.sub2 ? `<br>${esc(T.sub2)}` : ''}</div>
            <hr>
            <div class="row"><span>${esc(T.table || 'DOSSIER PUBLIC')}</span><span>${esc(formatDate(now, { day: '2-digit', month: '2-digit', year: '2-digit' }))}</span></div>
            <hr>
            <div class="who">${esc(toTitleCase(name))}</div>
            <div class="meta">${esc(entry.role || 'Personnalité politique')}<br>${esc(party)}</div>
            <hr>
            ${lines}${waiter}
            <hr>
            <div class="row total"><b>${esc(T.total)}</b><b>${items.length} affaire${items.length > 1 ? 's' : ''}</b></div>
            <div class="row"><span>${esc(T.judicial)}</span><span>${sum.judicial}</span></div>
            ${T.tva ? `<div class="row"><span>${esc(T.tva)}</span><span>${esc(T.tvaValue)}</span></div>` : ''}
            ${hasJudicial ? `<div class="row"><span>${esc(T.service)}</span><span class="right">${esc(T.serviceValue)}</span></div>` : ''}
            <div class="row"><span>${esc(T.cuisson)}</span><span class="bar">${bar(sum.blocks)} <b>${esc(T.levels[sum.level])}</b></span></div>
            ${stamp ? `<span class="stamp">${esc(stamp)}</span>` : ''}
            <hr>
            <div class="c thanks">${esc(thanks[0])}</div>
            <div class="c meta">${esc(thanks[1])}${T.guarantee && hasJudicial ? `<br>${esc(T.guarantee)}` : ''}</div>
            <div class="barcode" aria-hidden="true"></div>
            <div class="c meta">N° ${esc(ticketNo)}${checked ? ` · vérifié le ${esc(checked)}` : ''}${T.foot && !hasJudicial ? `<br>${esc(T.foot)}` : ''}</div>
            ${opts.reportUrl ? `<div class="c reply"><a href="${esc(opts.reportUrl)}" target="_blank" rel="noopener noreferrer">${esc(T.reply)}</a></div>` : ''}`;
    };

    NS.render = { statusInfo, summarize, renderLine, renderModal };
})();
