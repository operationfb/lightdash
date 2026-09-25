import { parse } from '@babel/parser';
import fs from 'fs';
import path from 'path';

/**
 * KONTALA: `sideEffects` in package.json names the modules that do something
 * when they load, so bundlers drop the parts of the barrel a page never uses.
 * An unnamed module that registers global state (dayjs plugins, numfmt
 * locales) would silently go missing from production bundles, so the list has
 * to match the source.
 */
type Statement = ReturnType<typeof parse>['program']['body'][number];

const SRC = __dirname;

const packageJson = JSON.parse(
    fs.readFileSync(path.join(SRC, '..', 'package.json'), 'utf8'),
) as { sideEffects: string[] };

const sourceFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            return entry.name === '__mocks__' ? [] : sourceFiles(file);
        }
        const isSource =
            /\.tsx?$/.test(entry.name) &&
            !/\.(test|spec|d|mock)\.tsx?$/.test(entry.name);
        return isSource ? [file] : [];
    });

const DECLARATIONS = new Set([
    'ExportNamedDeclaration',
    'ExportDefaultDeclaration',
    'ExportAllDeclaration',
    'FunctionDeclaration',
    'ClassDeclaration',
    'VariableDeclaration',
    'TSInterfaceDeclaration',
    'TSTypeAliasDeclaration',
    'TSEnumDeclaration',
    'TSModuleDeclaration',
    'TSDeclareFunction',
    'TSImportEqualsDeclaration',
    'TSExportAssignment',
    'EmptyStatement',
]);

// `void someConst` keeps a compile-time assertion referenced, and
// `if (require.main === module)` only runs when the file is the entry script.
const isInert = (statement: Statement): boolean =>
    (statement.type === 'ExpressionStatement' &&
        statement.expression.type === 'UnaryExpression' &&
        statement.expression.operator === 'void' &&
        statement.expression.argument.type === 'Identifier') ||
    (statement.type === 'IfStatement' &&
        statement.test.type === 'BinaryExpression' &&
        statement.test.operator === '===' &&
        statement.test.left.type === 'MemberExpression' &&
        statement.test.left.object.type === 'Identifier' &&
        statement.test.left.object.name === 'require' &&
        statement.test.right.type === 'Identifier' &&
        statement.test.right.name === 'module');

const runsOnLoad = (statement: Statement): boolean => {
    if (statement.type === 'ImportDeclaration') {
        return (
            statement.specifiers.length === 0 && statement.importKind !== 'type'
        );
    }
    return !DECLARATIONS.has(statement.type) && !isInert(statement);
};

const declaredPaths = (file: string): string[] => {
    const relative = path.relative(SRC, file).split(path.sep).join('/');
    return [
        `./src/${relative}`,
        `./dist/*/${relative.replace(/\.tsx?$/, '.js')}`,
    ];
};

describe('@lightdash/common sideEffects', () => {
    it('names exactly the modules that run code when they load', () => {
        const expected = sourceFiles(SRC)
            .filter((file) =>
                parse(fs.readFileSync(file, 'utf8'), {
                    sourceType: 'module',
                    plugins: file.endsWith('.tsx')
                        ? ['typescript', 'jsx']
                        : ['typescript'],
                }).program.body.some(runsOnLoad),
            )
            .flatMap(declaredPaths);

        expect([...packageJson.sideEffects].sort()).toEqual(expected.sort());
    });
});
