import { type Rolldown } from 'vite';

// postcss's package.json browser field maps these to `false`, and postcss
// checks they are absent before use (see `pathAvailable` in lib/input.js).
const POSTCSS_BROWSER_SHIMMED_MODULES = new Set([
    'fs',
    'path',
    'source-map-js',
    'url',
]);
const POSTCSS_MODULE_PATTERN = /[/\\]node_modules[/\\]postcss[/\\]/;
const EMPTY_MODULE_ID = '\0lightdash-postcss-browser-shim';

export const isPostcssBrowserShimmedImport = (
    id: string,
    importer: string | undefined,
): boolean =>
    importer !== undefined &&
    POSTCSS_MODULE_PATTERN.test(importer) &&
    POSTCSS_BROWSER_SHIMMED_MODULES.has(id);

// sanitize-html (used in the browser via @lightdash/common) bundles postcss; give
// it the empty modules a production build uses instead of dev's warning proxies.
export const postcssBrowserShimsPlugin = (): Rolldown.Plugin => ({
    name: 'lightdash-postcss-browser-shims',
    resolveId(id, importer) {
        return isPostcssBrowserShimmedImport(id, importer)
            ? EMPTY_MODULE_ID
            : null;
    },
    load(id) {
        return id === EMPTY_MODULE_ID ? 'module.exports = {};' : null;
    },
});
