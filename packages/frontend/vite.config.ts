import { sentryVitePlugin } from '@sentry/vite-plugin';
import reactPlugin from '@vitejs/plugin-react';
import * as path from 'path';
import { compression } from 'vite-plugin-compression2';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
import svgrPlugin from 'vite-plugin-svgr';
import { defineConfig } from 'vitest/config';
import { buildHashPlugin } from './vite.config.buildHash';
import { monacoWorkersServedPlugin } from './vite.config.monacoWorkers';
import { postcssBrowserShimsPlugin } from './vite.config.postcssBrowserShims';
import { pruneZodLocalesPlugin } from './vite.config.zodLocales';

const FE_PORT = process.env.FE_PORT ? parseInt(process.env.FE_PORT) : 3000;
const FE_HOST = process.env.FE_HOST;
const BE_PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;

const trackingChunkNames: Record<string, string> = {
    TrackingProvider: 'interaction-context',
    useTracking: 'useInteractionContext',
};

// KONTALA: the path this build is served under, matching the backend's basePath
// (derived there from SITE_URL). It reaches three places at once:
//   - vite rewrites every asset URL in index.html and the bundle with it;
//   - src/api.ts already reads import.meta.env.BASE_URL for its API prefix;
//   - App.tsx passes it to the router as a basename.
// Unset it and the build is upstream's, served at the origin root.
//
// ⚠ IT MUST END IN A SLASH, and that is why this normalises rather than
// trusting the caller. vite's base is a prefix the rest of the code
// CONCATENATES onto: api.ts builds its prefix as `${BASE_URL}api/v1`, which is
// upstream's own code and correct under vite's convention that base begins and
// ends with a slash (its default here is '/', and api.ts's test fallback is
// 'http://test.lightdash/'). Given '/analytics' the bundle asks for
// '/analyticsapi/v1/...', which matches no proxy mount, falls through to the
// surrounding app and comes back as that app's index.html. The frontend then
// reports "unable to reach the Lightdash server", because from its side that is
// exactly what happened: it got HTML where JSON belonged.
//
// The environment keeps the slashless form, because the other two consumers
// need it that way: SITE_URL's path becomes express's mount point and App.tsx's
// router basename, and a trailing slash is wrong for both. One value, formatted
// per consumer, rather than three spellings to keep in step.
const rawBasePath = process.env.LIGHTDASH_BASE_PATH || '/';
const basePath = rawBasePath.endsWith('/') ? rawBasePath : `${rawBasePath}/`;

export default defineConfig({
    base: basePath,
    publicDir: 'public',
    define: {
        __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
        REACT_QUERY_DEVTOOLS_ENABLED:
            process.env.REACT_QUERY_DEVTOOLS_ENABLED ?? true,
    },
    plugins: [
        buildHashPlugin(),
        pruneZodLocalesPlugin(),
        compression({
            include: [/\.(js)$/, /\.(css)$/],
            // KONTALA: brotli beside gzip. It is noticeably smaller for this
            // bundle and every current browser accepts it; the server prefers
            // it when offered (App.ts, expressStaticGzip). gzip keeps the
            // .gzip name the server also looks for.
            algorithms: ['gzip', 'brotliCompress'],
            filename: (id, { algorithm }) =>
                `${id}.${algorithm === 'brotliCompress' ? 'br' : 'gzip'}`,
        }),
        svgrPlugin(),
        reactPlugin(),
        monacoEditorPlugin({
            forceBuildCDN: true,
            languageWorkers: ['editorWorkerService', 'json', 'html'],
            customWorkers: [
                // KONTALA: no .js, which the plugin's naming turned into
                // yaml.worker..bundle.js.
                { label: 'yaml', entry: 'monaco-yaml/yaml.worker' },
            ],
            // KONTALA: base belongs in the workers' URL, not their output path.
            // The plugin's default wrote build/analytics/monacoeditorwork, but
            // the backend serves build/ at the base path, as it does vite's
            // own assets, so /analytics/monacoeditorwork/* got index.html.
            customDistPath: (root, buildOutDir) =>
                path.resolve(root, buildOutDir, 'monacoeditorwork'),
        }),
        // KONTALA: fails the build when index.html asks for a Monaco worker
        // that the backend would not serve (vite.config.monacoWorkers.ts).
        monacoWorkersServedPlugin(),
        sentryVitePlugin({
            telemetry: false,
            org: 'lightdash',
            project: 'lightdash-frontend',
            authToken: process.env.SENTRY_AUTH_TOKEN,
            release: {
                name: process.env.SENTRY_RELEASE_VERSION,
                inject: true,
            },
            // Sourcemaps are already uploaded by the Sentry CLI
            sourcemaps: {
                disable: true,
            },
        }),
    ],
    optimizeDeps: {
        include: ['react-vega'],
        rolldownOptions: {
            plugins: [postcssBrowserShimsPlugin()],
        },
    },
    resolve: {
        dedupe: ['react', 'react-dom'],
        alias:
            process.env.NODE_ENV === 'development'
                ? {
                      '@lightdash/common/src': path.resolve(
                          __dirname,
                          '../common/src',
                      ),
                      '@lightdash/common': path.resolve(
                          __dirname,
                          '../common/src/index.ts',
                      ),
                      '@lightdash/formula': path.resolve(
                          __dirname,
                          '../formula/src/index.ts',
                      ),
                  }
                : undefined,
    },
    build: {
        outDir: 'build',
        emptyOutDir: false,
        target: 'es2020',
        minify: true,
        sourcemap: true,

        rolldownOptions: {
            output: {
                chunkFileNames: ({ name }) =>
                    `assets/${trackingChunkNames[name] ?? '[name]'}-[hash].js`,
                codeSplitting: {
                    groups: [
                        // KONTALA: every pattern ends at a path separator. Without
                        // one, `react` also matched react-ace, react-vega,
                        // react-leaflet and every other react-* package, and
                        // their dependencies came into the entry with them.
                        {
                            name: 'react',
                            test: /node_modules[\\/](react|react-dom|react-router|react-use|@hello-pangea[\\/]dnd|@tanstack[\\/]react-query|@tanstack[\\/]react-table|@tanstack[\\/]react-virtual)[\\/]/,
                            priority: 20,
                        },
                        // KONTALA: not @mantine/tiptap, which brings the tiptap
                        // and prosemirror editor to every page for the few that
                        // edit rich text.
                        {
                            name: 'mantine',
                            test: /node_modules[\\/]@mantine[\\/](code-highlight|core|dates|form|hooks|modals|notifications)[\\/]/,
                            priority: 20,
                        },
                        {
                            name: 'echarts',
                            test: /node_modules[\\/]echarts/,
                            priority: 20,
                        },
                        {
                            name: 'ace',
                            test: /node_modules[\\/](ace-builds|react-ace)/,
                            priority: 20,
                        },
                        {
                            // KONTALA: not jspdf, which only PDF exports use;
                            // grouped with lodash and zod it loaded on every page.
                            name: 'modules',
                            test: /node_modules[\\/](lodash|colorjs\.io|zod)[\\/]/,
                            priority: 15,
                        },
                        {
                            name: 'thirdparty',
                            test: /node_modules[\\/]@sentry[\\/]react/,
                            priority: 15,
                        },
                        {
                            name: 'uiw',
                            test: /node_modules[\\/]@uiw[\\/](react-markdown-preview|react-md-editor)/,
                            priority: 15,
                        },
                    ],
                },
            },
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/testing/vitest.setup.ts',
        env: {
            VITE_REACT_QUERY_DEVTOOLS_ENABLED: 'false',
        },
        maxWorkers: '50%',
    },
    server: {
        port: FE_PORT,
        host: true,
        hmr: {
            overlay: true,
        },
        // Transform the entry graph at startup instead of on the first
        // request. Without this the browser discovers these modules one
        // import at a time and each one is compiled while it waits, which is
        // most visible on a remote dev server (a cloud devbox or a PR
        // preview) where that cost is paid over the network.
        warmup: {
            clientFiles: [
                './src/index.tsx',
                './src/App.tsx',
                './src/Routes.tsx',
                './src/ee/CommercialRoutes.tsx',
                './src/providers/**/*.tsx',
            ],
        },
        allowedHosts: [
            'lightdash-dev', // for local development with docker
            'host.docker.internal', // for headless browser in docker (scheduled deliveries)
            '.lightdash.dev', // for cloudflared tunnels,
            '.exe.xyz', // for exe.dev devboxes
            '.e2b.app', // for Amp orb portals
            '.onamp.dev', // for Amp orb portals
            ...(FE_HOST ? [FE_HOST] : []),
        ],
        watch: {
            ignored: ['!**/node_modules/@lightdash/common/**'],
        },
        proxy: {
            '/api': {
                target: `http://localhost:${BE_PORT}`,
                changeOrigin: true,
            },
            '/.well-known': {
                // MCP inspector requires .well-known to be on the root, but according to RFC 9728 (OAuth 2.0 Protected Resource Metadata) the .well-known endpoint is not required to be at the root level.
                target: `http://localhost:${BE_PORT}/api/v1/oauth`,
                changeOrigin: true,
            },
            '/slack/events': {
                target: `http://localhost:${BE_PORT}`,
                changeOrigin: true,
            },
        },
    },
    clearScreen: false,
});
