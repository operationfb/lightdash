// KONTALA: records the files the server reads before it listens, in the order
// it reads them, for prod-entrypoint.sh to read ahead of it on a cold start.
//
// Run at image build as `node --require <this> dist/index.js` with
// LIGHTDASH_BOOT_FILES_OUT set. The server is stopped at its first listen(), so
// nothing binds and nothing is served; the DB connections it opens in the
// background before that are abandoned with the process.
//
// The list is a cache hint and nothing else. A file it misses is read by the
// server itself, as it always was, and a file it names that is gone is skipped.
const fs = require('fs');
const Module = require('module');
const net = require('net');
const path = require('path');

const out = process.env.LIGHTDASH_BOOT_FILES_OUT;
if (!out) {
    throw new Error('LIGHTDASH_BOOT_FILES_OUT must name the file to write');
}

// Insertion order is read order: a module is resolved before it is evaluated,
// and it is its evaluation that requires the next ones. The node binary is not
// listed; the entrypoint warms it separately, because a 117 MB file in one of
// these batches would hold up every small file queued behind it.
const files = new Set();

// Resolution reads the nearest package.json of every package it enters.
const packageRoot = (filename) => {
    const marker = `${path.sep}node_modules${path.sep}`;
    const at = filename.lastIndexOf(marker);
    if (at === -1) return null;
    const rest = filename.slice(at + marker.length).split(path.sep);
    const depth = rest[0].startsWith('@') ? 2 : 1;
    return filename.slice(0, at + marker.length) + rest.slice(0, depth).join(path.sep);
};

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
    try {
        const filename = Module._resolveFilename(request, parent, isMain);
        if (path.isAbsolute(filename)) {
            const root = packageRoot(filename);
            if (root) files.add(path.join(root, 'package.json'));
            files.add(filename);
        }
    } catch {
        // Unresolvable here means unresolvable in the real load too; let it
        // report itself.
    }
    // eslint-disable-next-line prefer-rest-params
    return originalLoad.apply(this, arguments);
};

net.Server.prototype.listen = function listen() {
    const existing = [...files].filter((file) => fs.existsSync(file));
    fs.writeFileSync(out, `${existing.join('\n')}\n`);
    process.stdout.write(`Recorded ${existing.length} boot files in ${out}\n`);
    process.exit(0);
};
