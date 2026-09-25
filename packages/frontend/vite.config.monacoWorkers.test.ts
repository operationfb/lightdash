import { describe, expect, it } from 'vitest';
import {
    findMonacoWorkerUrls,
    findUnservedUrls,
} from './vite.config.monacoWorkers';

const workersIn = (dir: string) =>
    ['editor', 'json', 'html', 'yaml'].map(
        (name) => `${dir}${name}.worker.bundle.js`,
    );

const WORKER_URLS = workersIn('/analytics/monacoeditorwork/');

// Abridged from a build with base '/analytics/': the plugin's MonacoEnvironment
// script, followed by vite's own entry script.
const INDEX_HTML = `<script>self["MonacoEnvironment"] = (function (paths) {
    return {
        getWorkerUrl : function (moduleId, label) {
            var result = paths[label];
            var js = '/*' + label + '*/importScripts("' + result + '");';
            return result;
        }
    };
})({
  "editorWorkerService": "/analytics/monacoeditorwork/editor.worker.bundle.js",
  "json": "/analytics/monacoeditorwork/json.worker.bundle.js",
  "html": "/analytics/monacoeditorwork/html.worker.bundle.js",
  "yaml": "/analytics/monacoeditorwork/yaml.worker.bundle.js",
  "handlebars": "/analytics/monacoeditorwork/html.worker.bundle.js",
  "razor": "/analytics/monacoeditorwork/html.worker.bundle.js"
});</script>
<script type="module" crossorigin src="/analytics/assets/index-B1a2c3d4.js"></script>`;

const isFileIn = (files: string[]) => (outDirPath: string) =>
    files.includes(outDirPath);

describe('findMonacoWorkerUrls', () => {
    it('lists each worker URL in the MonacoEnvironment script once', () => {
        expect(findMonacoWorkerUrls(INDEX_HTML)).toEqual(WORKER_URLS);
    });
});

describe('findUnservedUrls', () => {
    it('accepts workers written to the build directory', () => {
        expect(
            findUnservedUrls(
                WORKER_URLS,
                '/analytics/',
                isFileIn(workersIn('monacoeditorwork/')),
            ),
        ).toEqual([]);
    });

    it('reports workers written under the base path inside the build directory', () => {
        expect(
            findUnservedUrls(
                WORKER_URLS,
                '/analytics/',
                isFileIn(workersIn('analytics/monacoeditorwork/')),
            ),
        ).toEqual(WORKER_URLS);
    });

    it('reports worker URLs outside the base path', () => {
        const rootUrls = workersIn('/monacoeditorwork/');

        expect(findUnservedUrls(rootUrls, '/analytics/', () => true)).toEqual(
            rootUrls,
        );
    });

    it('accepts workers at the origin root when base is /', () => {
        expect(
            findUnservedUrls(
                workersIn('/monacoeditorwork/'),
                '/',
                isFileIn(workersIn('monacoeditorwork/')),
            ),
        ).toEqual([]);
    });
});
