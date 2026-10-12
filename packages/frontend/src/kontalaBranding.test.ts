import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The fork ships as Kontala Analytics: upstream merges that bring back
// Lightdash copy or links to Lightdash's docs and community fail here.
const srcDir = dirname(fileURLToPath(import.meta.url));

// ee/ stays as upstream wrote it, and the generated tours quote Lightdash's docs.
const isScanned = (path: string) =>
    /\.tsx?$/.test(path) &&
    !/\.(test|spec|stories)\.tsx?$/.test(path) &&
    !path.startsWith('ee/') &&
    !path.startsWith('stories/') &&
    !path.startsWith('testing/') &&
    path !== 'features/scopeTours/generated.ts';

const listFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
            ? listFiles(join(dir, entry.name))
            : [join(dir, entry.name)],
    );

const sourceLines = listFiles(srcDir)
    .map((file) => relative(srcDir, file))
    .filter(isScanned)
    .flatMap((path) =>
        readFileSync(join(srcDir, path), 'utf-8')
            .split('\n')
            .map((text, index) => ({ at: `${path}:${index + 1}`, text })),
    );

const isComment = (text: string) => /^\s*(\/\/|\/\*|\*|\{\/\*)/.test(text);

// Lines that must keep the name: tour markers the generated tours match on,
// and the upstream install script's prompt, quoted verbatim.
const allowedProductNames = [
    'data-tour-hint="Click the Lightdash logo to go back home"',
    'data-tour-label="Click the Lightdash logo to go back home"',
    '<b>How do you want to setup Lightdash ?</b>',
];

describe('Kontala Analytics branding', () => {
    it('does not name Lightdash in user-visible copy', () => {
        const offending = sourceLines
            .filter(
                ({ text }) =>
                    /(?<![\w-])Lightdash(?![\w-])/.test(text) &&
                    !isComment(text) &&
                    !allowedProductNames.some((allowed) =>
                        text.includes(allowed),
                    ),
            )
            .map(({ at, text }) => `${at}: ${text.trim()}`);

        expect(offending).toEqual([]);
    });

    // The schema URLs only identify JSON schemas the editors already hold;
    // the cloud hosts are compared, never linked.
    it('does not link to Lightdash docs, site or community', () => {
        const offending = sourceLines
            .filter(
                ({ text }) =>
                    /https?:\/\/([\w-]+\.)?lightdash\.(com|cloud)\b|github\.com\/lightdash|lightdash-community|join\.slack\.com/.test(
                        text,
                    ) &&
                    !/https:\/\/(schemas\.lightdash\.com|lightdash\.com\/schemas)\/|siteUrl === 'https:\/\/[\w-]+\.lightdash\.cloud'/.test(
                        text,
                    ) &&
                    !isComment(text),
            )
            .map(({ at, text }) => `${at}: ${text.trim()}`);

        expect(offending).toEqual([]);
    });
});
