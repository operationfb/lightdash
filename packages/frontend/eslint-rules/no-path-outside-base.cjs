/**
 * KONTALA: no-path-outside-base
 *
 * This fork is served under a base path (/analytics) on an origin it shares
 * with another app. react-router puts the base path back on everything it
 * navigates to itself, but a path that leaves the router - an href on a real
 * anchor, window.open, a location assignment, a fetch, a URL built from the
 * origin for somebody's clipboard, a server redirect - is resolved by the
 * browser against the ORIGIN, and without the base path it names a page of the
 * other app. Each of these shipped at least once (see the commit adding this
 * rule), and an upstream merge brings new ones in with nothing else to say so.
 *
 * It reports the shapes that can be seen without following data flow: a
 * root-relative path written as a literal (or a template that starts with one)
 * where it leaves the router, and a path joined onto the origin. A router path
 * held in a variable or returned by a helper cannot be seen here, so the fix
 * for one of those still needs its own test.
 *
 * The cure is the helper for the side it is on: toBrowserPath / toBrowserHref
 * (packages/frontend/src/utils/url.ts) in the frontend, sitePathFor /
 * siteUrlFor (packages/backend/src/config/siteUrl.ts) in the backend.
 */

const ORIGINS = new Set([
    'window.location.origin',
    'window.origin',
    'location.origin',
    'document.location.origin',
]);

const LOCATION_CALLS = new Set([
    'window.open',
    'window.location.assign',
    'window.location.replace',
    'location.assign',
    'location.replace',
    'document.location.assign',
    'document.location.replace',
]);

const LOCATION_TARGETS = new Set([
    'window.location',
    'window.location.href',
    'location.href',
    'document.location',
    'document.location.href',
]);

const FETCHES = new Set(['fetch', 'window.fetch', 'globalThis.fetch']);

// Calls whose result already carries the base path, or deliberately none.
const BASE_AWARE_CALLS = new Set([
    'toBrowserPath',
    'toBrowserHref',
    'browserBasePath',
    'resolveRequestUrl',
    'siteUrlFor',
    'sitePathFor',
]);

// Components that take a router path in `href` and add the base path
// themselves (packages/frontend/src/components/common).
const DEFAULT_BASE_AWARE_ELEMENTS = [
    'LinkButton',
    'LinkMenuItem',
    'MantineLinkButton',
];

const unwrap = (node) => {
    let current = node;
    while (
        current &&
        (current.type === 'ChainExpression' ||
            current.type === 'TSAsExpression' ||
            current.type === 'TSNonNullExpression' ||
            current.type === 'TSSatisfiesExpression' ||
            current.type === 'JSXExpressionContainer')
    ) {
        current = current.expression;
    }
    return current;
};

/** `window.location.origin` for that member chain, else null. */
const dottedName = (node) => {
    const current = unwrap(node);
    if (!current) return null;
    if (current.type === 'Identifier') return current.name;
    if (current.type === 'MetaProperty') {
        return `${current.meta.name}.${current.property.name}`;
    }
    if (
        current.type === 'MemberExpression' &&
        !current.computed &&
        current.property.type === 'Identifier'
    ) {
        const object = dottedName(current.object);
        return object ? `${object}.${current.property.name}` : null;
    }
    return null;
};

/** The text a string value is known to start with, else null. */
const leadingText = (node) => {
    const current = unwrap(node);
    if (!current) return null;
    if (current.type === 'Literal' && typeof current.value === 'string') {
        return current.value;
    }
    if (current.type === 'TemplateLiteral') {
        const [first] = current.quasis;
        return first.value.cooked ?? first.value.raw;
    }
    if (current.type === 'BinaryExpression' && current.operator === '+') {
        return leadingText(current.left);
    }
    return null;
};

/** `/x`, but neither `//host` nor `/\host`, which leave the origin anyway. */
const isRootPath = (node) => {
    const text = leadingText(node);
    return (
        typeof text === 'string' &&
        text.startsWith('/') &&
        !text.startsWith('//') &&
        !text.startsWith('/\\')
    );
};

const isBaseAware = (node) => {
    const current = unwrap(node);
    if (!current) return false;
    if (current.type === 'CallExpression') {
        return BASE_AWARE_CALLS.has(dottedName(current.callee));
    }
    return dottedName(current) === 'import.meta.env.BASE_URL';
};

const isOriginOrSiteUrl = (node) => {
    const name = dottedName(node);
    return (
        name !== null &&
        (ORIGINS.has(name) || name === 'siteUrl' || name.endsWith('.siteUrl'))
    );
};

const elementName = (node) => {
    if (!node) return null;
    if (node.type === 'JSXIdentifier') return node.name;
    if (node.type === 'JSXMemberExpression') {
        const object = elementName(node.object);
        return object ? `${object}.${node.property.name}` : null;
    }
    return null;
};

module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Disallow a root-relative path leaving the router without the base path this build is served under.',
        },
        messages: {
            outsideBase:
                'This path leaves the router without the base path this build is served under, so on a shared origin it names a page of another app. Wrap it in toBrowserPath() / toBrowserHref() in the frontend, or sitePathFor() / siteUrlFor() in the backend.',
        },
        schema: [
            {
                type: 'object',
                properties: {
                    baseAwareElements: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                },
                additionalProperties: false,
            },
        ],
    },
    create(context) {
        const options = context.options[0] || {};
        const baseAwareElements = new Set(
            options.baseAwareElements || DEFAULT_BASE_AWARE_ELEMENTS,
        );
        const report = (node) =>
            context.report({ node, messageId: 'outsideBase' });

        return {
            JSXAttribute(node) {
                if (node.name.type !== 'JSXIdentifier') return;
                if (node.name.name !== 'href' || !node.value) return;
                const element = elementName(node.parent && node.parent.name);
                if (element && baseAwareElements.has(element)) return;
                if (isRootPath(node.value)) report(node.value);
            },

            CallExpression(node) {
                const callee = dottedName(node.callee);
                const [first] = node.arguments;
                if (
                    callee &&
                    (LOCATION_CALLS.has(callee) || FETCHES.has(callee))
                ) {
                    if (isRootPath(first)) report(first);
                    return;
                }
                // Express: res.redirect([status,] path).
                const target = unwrap(node.callee);
                if (
                    target &&
                    target.type === 'MemberExpression' &&
                    !target.computed &&
                    target.property.type === 'Identifier' &&
                    target.property.name === 'redirect' &&
                    ['res', 'response'].includes(dottedName(target.object))
                ) {
                    const path = node.arguments[node.arguments.length - 1];
                    if (isRootPath(path)) report(path);
                }
            },

            AssignmentExpression(node) {
                if (!LOCATION_TARGETS.has(dottedName(node.left))) return;
                if (isRootPath(node.right)) report(node.right);
            },

            NewExpression(node) {
                if (dottedName(node.callee) !== 'URL') return;
                const [path, base] = node.arguments;
                if (base && isRootPath(path) && isOriginOrSiteUrl(base)) {
                    report(path);
                }
            },

            TemplateLiteral(node) {
                node.expressions.forEach((expression, index) => {
                    if (!ORIGINS.has(dottedName(expression))) return;
                    const after = node.quasis[index + 1];
                    const text = after.value.cooked ?? after.value.raw;
                    if (text.startsWith('/')) {
                        report(node);
                        return;
                    }
                    const next = node.expressions[index + 1];
                    if (text === '' && next && !isBaseAware(next)) {
                        report(node);
                    }
                });
            },

            BinaryExpression(node) {
                if (node.operator !== '+') return;
                if (!ORIGINS.has(dottedName(node.left))) return;
                if (isRootPath(node.right)) report(node);
            },
        };
    },
};
