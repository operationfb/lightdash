import postcssPackageJson from 'postcss/package.json';
import { describe, expect, it } from 'vitest';
import { isPostcssBrowserShimmedImport } from './vite.config.postcssBrowserShims';

const POSTCSS_INPUT_MODULE =
    '/repo/node_modules/.pnpm/postcss@8.5.23/node_modules/postcss/lib/input.js';

describe('isPostcssBrowserShimmedImport', () => {
    it('shims every Node module postcss disables in its browser field', () => {
        const disabledModules = Object.entries(postcssPackageJson.browser)
            .filter(([id, target]) => target === false && !id.startsWith('.'))
            .map(([id]) => id);

        expect(disabledModules).not.toHaveLength(0);
        disabledModules.forEach((id) =>
            expect(
                isPostcssBrowserShimmedImport(id, POSTCSS_INPUT_MODULE),
            ).toBe(true),
        );
    });

    it('keeps the modules postcss needs in the browser', () => {
        expect(
            isPostcssBrowserShimmedImport(
                'nanoid/non-secure',
                POSTCSS_INPUT_MODULE,
            ),
        ).toBe(false);
    });

    it('leaves the same Node modules alone for other importers', () => {
        expect(
            isPostcssBrowserShimmedImport(
                'path',
                '/repo/node_modules/.pnpm/postcss-value-parser@4.2.0/node_modules/postcss-value-parser/lib/index.js',
            ),
        ).toBe(false);
        expect(isPostcssBrowserShimmedImport('path', undefined)).toBe(false);
    });
});
