// KONTALA: reads every file named in a list (one path per line), 32 at a time,
// and discards the bytes. Its only effect is a warm page cache; see
// prod-entrypoint.sh for why that matters on a cold Cloud Run instance.
//
// One process with concurrent reads rather than xargs and cat: spawning a few
// hundred cat processes cost the server about as much CPU as the warm saved.
// Concurrency comes from libuv's thread pool, which the entrypoint sizes with
// UV_THREADPOOL_SIZE. Errors are ignored file by file: a missing file is the
// server's to report, not this script's.
const fs = require('fs');

const CONCURRENCY = 32;

const files = fs
    .readFileSync(process.argv[2], 'utf8')
    .split('\n')
    .filter((line) => line !== '');

let next = 0;

const reader = async () => {
    const buffer = Buffer.allocUnsafe(1 << 20);
    while (next < files.length) {
        const file = files[next];
        next += 1;
        try {
            // eslint-disable-next-line no-await-in-loop
            const handle = await fs.promises.open(file, 'r');
            try {
                // eslint-disable-next-line no-await-in-loop
                while ((await handle.read(buffer, 0, buffer.length, null)).bytesRead > 0);
            } finally {
                // eslint-disable-next-line no-await-in-loop
                await handle.close();
            }
        } catch {
            // Nothing to warm.
        }
    }
};

void Promise.all(Array.from({ length: CONCURRENCY }, reader));
