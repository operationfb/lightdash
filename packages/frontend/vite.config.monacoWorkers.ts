import { statSync } from 'fs';
import * as path from 'path';
import { type Plugin, type ResolvedConfig } from 'vite';

// vite-plugin-monaco-editor names each worker <entry>.bundle.js and lists their
// URLs in the MonacoEnvironment script it injects into index.html.
const MONACO_WORKER_URL_PATTERN = /"([^"\s]+\.bundle\.js)"/g;

export const findMonacoWorkerUrls = (html: string): string[] => [
    ...new Set(
        Array.from(html.matchAll(MONACO_WORKER_URL_PATTERN), ([, url]) => url),
    ),
];

export const findUnservedUrls = (
    urls: string[],
    base: string,
    isOutDirFile: (outDirPath: string) => boolean,
): string[] =>
    urls.filter(
        (url) => !url.startsWith(base) || !isOutDirFile(url.slice(base.length)),
    );

/**
 * KONTALA: fails the build when index.html asks for a Monaco worker the backend
 * would not serve. The backend serves the build directory at the base path, so
 * /analytics/x must be build/x; the plugin's default wrote the workers to
 * build/analytics/monacoeditorwork, and every editor lost them unnoticed.
 */
export const monacoWorkersServedPlugin = (): Plugin => {
    let resolvedConfig: ResolvedConfig | undefined;
    let indexHtml: string | undefined;

    return {
        name: 'kontala-monaco-workers-served',
        apply: 'build',
        configResolved(config) {
            resolvedConfig = config;
        },
        writeBundle(_options, bundle) {
            const output = bundle['index.html'];
            if (output?.type !== 'asset') {
                indexHtml = undefined;
                return;
            }
            indexHtml =
                typeof output.source === 'string'
                    ? output.source
                    : new TextDecoder().decode(output.source);
        },
        closeBundle() {
            // Storybook builds with this config too, and emits iframe.html.
            if (!resolvedConfig || indexHtml === undefined) {
                return;
            }

            const urls = findMonacoWorkerUrls(indexHtml);
            if (urls.length === 0) {
                throw new Error(
                    'index.html lists no Monaco worker URLs: update vite.config.monacoWorkers.ts for vite-plugin-monaco-editor',
                );
            }

            const outDir = path.resolve(
                resolvedConfig.root,
                resolvedConfig.build.outDir,
            );
            const unserved = findUnservedUrls(
                urls,
                resolvedConfig.base,
                (outDirPath) =>
                    statSync(path.join(outDir, outDirPath), {
                        throwIfNoEntry: false,
                    })?.isFile() ?? false,
            );
            if (unserved.length > 0) {
                throw new Error(
                    `Monaco workers the backend would not serve, as it serves ${outDir} at ${resolvedConfig.base}:\n${unserved.join('\n')}`,
                );
            }
        },
    };
};
