// Charge les modules du content script dans un espace global Node (sans DOM ni chrome.*).
for (const f of ['text', 'matcher', 'data', 'copy', 'ui-render']) require(`../js/${f}.js`);
module.exports = globalThis.Casseroles;
