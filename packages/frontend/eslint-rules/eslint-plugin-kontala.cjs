// KONTALA: this fork's own lint rules, loaded by oxlint as a JS plugin in the
// same way packages/backend/eslint-rules/eslint-plugin-lightdash.cjs is.
const noPathOutsideBase = require('./no-path-outside-base.cjs');

module.exports = {
    meta: { name: 'eslint-plugin-kontala' },
    rules: {
        'no-path-outside-base': noPathOutsideBase,
    },
};
