import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const RELATIVE_TS_SPECIFIER = /(from\s*['"])(\.{1,2}\/[^'"]+)\.ts(['"])/g;

function walk(directory) {
    const found = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) found.push(...walk(path));
        else if (entry.name.endsWith('.d.ts')) found.push(path);
    }
    return found;
}

let rewritten = 0;
const files = walk(DIST);

for (const file of files) {
    const before = readFileSync(file, 'utf8');
    const after = before.replace(RELATIVE_TS_SPECIFIER, '$1$2.js$3');
    if (after !== before) {
        writeFileSync(file, after, 'utf8');
        rewritten += 1;
    }
}

console.log(`declarations: ${files.length} scanned, ${rewritten} normalised to .js specifiers`);
