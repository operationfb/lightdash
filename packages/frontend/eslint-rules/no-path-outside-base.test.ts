import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * KONTALA: the rule is exercised through oxlint itself, the way the lint run
 * loads it, rather than through a RuleTester this repository does not have.
 * Every fixture line below is either one of the shapes that shipped the bug
 * or one that must stay allowed, so the reported lines are the whole
 * contract.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const OXLINT = path.resolve(here, '../node_modules/.bin/oxlint');
const RULE = 'kontala(no-path-outside-base)';

let dir: string;
let config: string;

beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kontala-rule-'));
    config = path.join(dir, 'oxlintrc.json');
    writeFileSync(
        config,
        JSON.stringify({
            categories: { correctness: 'off' },
            jsPlugins: [
                {
                    name: 'kontala',
                    specifier: path.join(here, 'eslint-plugin-kontala.cjs'),
                },
            ],
            rules: { 'kontala/no-path-outside-base': 'error' },
        }),
    );
});

afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
});

const reportedLines = (source: string): number[] => {
    const file = path.join(dir, 'fixture.tsx');
    writeFileSync(file, source);
    let output: string;
    try {
        output = execFileSync(
            OXLINT,
            ['-c', config, '--format', 'json', file],
            { encoding: 'utf8' },
        );
    } catch (error) {
        // oxlint exits non-zero when it reports anything.
        output = (error as { stdout: string }).stdout;
    }
    const { diagnostics } = JSON.parse(output) as {
        diagnostics: {
            code: string;
            labels: { span: { line: number } }[];
        }[];
    };
    return diagnostics
        .filter((diagnostic) => diagnostic.code === RULE)
        .map((diagnostic) => diagnostic.labels[0].span.line)
        .sort((a, b) => a - b);
};

/** The 1-based lines of `lines` whose text contains `// report`. */
const expectedLines = (lines: string[]) =>
    lines.flatMap((line, index) =>
        line.includes('// report') ? [index + 1] : [],
    );

describe('kontala/no-path-outside-base', () => {
    it('reports a root-relative path leaving the router, and nothing else', () => {
        const lines = [
            `declare const id: string, res: any, issuer: string, config: any;`,
            `declare const toBrowserPath: (p: string) => string;`,
            `declare const sitePathFor: (c: unknown, p: string) => string;`,
            `declare const getDocumentUrl: (id: string) => string;`,
            `declare const navigate: (p: string) => void;`,
            `declare const Anchor: any, LinkButton: any, Link: any;`,
            // Anchors.
            `export const a1 = <a href="/projects/x">x</a>; // report`,
            `export const a2 = <Anchor href={\`/projects/\${id}/home\`} />; // report`,
            `export const a3 = <a href="https://docs.example.com">x</a>;`,
            `export const a4 = <a href="#top">x</a>;`,
            `export const a5 = <a href="mailto:x@example.com">x</a>;`,
            `export const a6 = <a href="//cdn.example.com/x">x</a>;`,
            `export const a7 = <a href={toBrowserPath('/projects/x')}>x</a>;`,
            `export const a8 = <LinkButton href="/projects/x" />;`,
            `export const a9 = <Link to="/projects/x" />;`,
            // Navigation outside the router, and requests.
            `export const n1 = () => window.open('/projects/x'); // report`,
            `export const n2 = () => { window.location.href = '/login'; }; // report`,
            `export const n3 = () => window.location.assign(\`/p/\${id}\`); // report`,
            `export const n4 = () => fetch('/api/v1/x'); // report`,
            `export const n5 = () => window.open(toBrowserPath('/projects/x'));`,
            `export const n6 = () => navigate('/projects/x');`,
            // URLs built from the origin.
            `export const u1 = \`\${window.location.origin}/projects/\${id}\`; // report`,
            `export const u2 = \`\${window.location.origin}\${getDocumentUrl(id)}\`; // report`,
            `export const u3 = \`\${window.origin}/projects/\${id}/home\`; // report`,
            `export const u4 = window.location.origin + '/projects/x'; // report`,
            `export const u5 = new URL('/api/v1/x', window.location.origin); // report`,
            `export const u6 = \`\${window.location.origin}\${toBrowserPath('/x')}\`;`,
            `export const u7 = \`\${window.location.origin}\${import.meta.env.BASE_URL}\`;`,
            `export const u8 = \`\${window.location.origin}\`;`,
            `export const u9 = new URL('/', issuer).origin;`,
            // The backend's side of it.
            `export const b1 = () => res.redirect('/login'); // report`,
            `export const b2 = () => res.redirect(302, \`/login?to=\${id}\`); // report`,
            `export const b3 = new URL('/api/v1/x', config.siteUrl); // report`,
            `export const b4 = () => res.redirect(sitePathFor(config, '/login'));`,
        ];

        expect(reportedLines(lines.join('\n'))).toEqual(expectedLines(lines));
    });
});
