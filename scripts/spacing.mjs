import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argv, exit } from 'node:process';
import { parseSync } from 'oxc-parser';

const ROOTS = ['src', 'test', 'examples'];

const MODULE_SPECIFIER = new Set(['ImportDeclaration', 'ExportAllDeclaration']);

const CLASS_MEMBERS = new Set(['MethodDefinition', 'TSAbstractMethodDefinition']);

const DECLARATIONS = new Set([
    'ClassDeclaration',
    'FunctionDeclaration',
    'TSDeclareFunction',
    'TSEnumDeclaration',
    'TSInterfaceDeclaration',
    'TSModuleDeclaration',
    'TSTypeAliasDeclaration',
]);

const BLOCK_LIKE = new Set([
    'ClassDeclaration',
    'DoWhileStatement',
    'ForInStatement',
    'ForOfStatement',
    'ForStatement',
    'FunctionDeclaration',
    'IfStatement',
    'LabeledStatement',
    'SwitchStatement',
    'TryStatement',
    'WhileStatement',
]);

const JUMPS = new Set(['ContinueStatement', 'ReturnStatement', 'ThrowStatement']);

const STATEMENT_LISTS = new Set([
    'BlockStatement',
    'ClassBody',
    'Program',
    'StaticBlock',
    'SwitchCase',
    'TSModuleBlock',
]);

function walk(directory) {
    const found = [];

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);

        if (entry.isDirectory()) found.push(...walk(path));
        else if (entry.name.endsWith('.ts')) found.push(path);
    }

    return found;
}

function isReExport(node) {
    return node.type === 'ExportNamedDeclaration' && node.source !== null;
}

function unwrap(node) {
    if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
        return node.declaration ?? node;
    }

    return node;
}

function isModuleSpecifier(node) {
    return MODULE_SPECIFIER.has(node.type) || isReExport(node);
}

function isVariable(node) {
    return unwrap(node).type === 'VariableDeclaration';
}

function desiredGap(previous, next, spansLines) {
    if (isModuleSpecifier(previous) && isModuleSpecifier(next)) return undefined;
    if (isModuleSpecifier(previous) !== isModuleSpecifier(next)) return 1;

    if (CLASS_MEMBERS.has(previous.type) || CLASS_MEMBERS.has(next.type)) return 1;

    const before = unwrap(previous);
    const after = unwrap(next);

    if (DECLARATIONS.has(before.type) || DECLARATIONS.has(after.type)) return 1;
    if (BLOCK_LIKE.has(before.type) && spansLines(previous)) return 1;
    if (BLOCK_LIKE.has(after.type) && spansLines(next)) return 1;
    if (JUMPS.has(after.type)) return 1;
    if (isVariable(previous) !== isVariable(next)) return 1;

    return undefined;
}

function statementLists(program) {
    const lists = [];

    const visit = (node) => {
        if (node === null || typeof node !== 'object') return;

        if (Array.isArray(node)) {
            for (const item of node) visit(item);

            return;
        }

        if (typeof node.type === 'string' && STATEMENT_LISTS.has(node.type)) {
            const list = node.type === 'SwitchCase' ? node.consequent : node.body;

            if (Array.isArray(list)) lists.push(list);
        }

        for (const value of Object.values(node)) visit(value);
    };

    visit(program);

    return lists;
}

function lineIndexAt(lineStarts, position) {
    let low = 0;
    let high = lineStarts.length - 1;

    while (low < high) {
        const middle = Math.ceil((low + high) / 2);

        if (lineStarts[middle] <= position) low = middle;
        else high = middle - 1;
    }

    return low;
}

function applySpacing(text, fileName) {
    const parsed = parseSync(fileName, text);

    if (parsed.errors.length > 0) {
        throw new Error(`${fileName}: ${parsed.errors[0]?.message ?? 'parse error'}`);
    }

    const lines = text.split('\n');
    const lineStarts = [];
    let offset = 0;

    for (const line of lines) {
        lineStarts.push(offset);
        offset += line.length + 1;
    }

    const spansLines = (node) =>
        lineIndexAt(lineStarts, node.start) !== lineIndexAt(lineStarts, node.end);

    const byLine = new Map();

    for (const list of statementLists(parsed.program)) {
        for (let index = 1; index < list.length; index += 1) {
            const previous = list[index - 1];
            const next = list[index];
            const gap = desiredGap(previous, next, spansLines);

            if (gap !== undefined) byLine.set(lineIndexAt(lineStarts, next.start), gap);
        }
    }

    if (byLine.size === 0) return text;

    const out = [];

    for (let index = 0; index < lines.length; index += 1) {
        const wanted = byLine.get(index);

        if (wanted !== undefined) {
            while (out.length > 0 && out.at(-1).trim() === '') out.pop();

            if (out.length > 0) {
                for (let n = 0; n < wanted; n += 1) out.push('');
            }
        }

        out.push(lines[index]);
    }

    const result = out.join('\n');

    return result.endsWith('\n') ? result : `${result}\n`;
}

const check = argv.includes('--check');
const files = ROOTS.flatMap((root) => walk(root));
const offenders = [];

for (const file of files) {
    const before = readFileSync(file, 'utf8');
    const after = applySpacing(before, file);

    if (after === before) continue;

    offenders.push(file);

    if (!check) writeFileSync(file, after, 'utf8');
}

if (check && offenders.length > 0) {
    for (const file of offenders) console.error(`spacing: ${file}`);

    console.error(`${offenders.length} file(s) need "npm run format"`);
    exit(1);
}

console.log(
    check
        ? `spacing: ${files.length} file(s) checked`
        : `spacing: ${files.length} file(s) scanned, ${offenders.length} rewritten`,
);
