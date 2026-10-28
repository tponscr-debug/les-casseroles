// Charge les modules du content script dans un espace global Node (sans DOM ni chrome.*).
for (const f of ['text', 'matcher', 'data', 'sites', 'copy', 'context', 'ui-render']) require(`../js/${f}.js`);
module.exports = globalThis.Casseroles;
