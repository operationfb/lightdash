/**
 * KONTALA: defers a module until first use, and loads it once.
 *
 * A static import runs when the importing file loads, and nearly every file
 * loads when the server boots. Heavy dependencies that only one feature uses
 * (Google Sheets, headless browser, spreadsheet export, ...) are therefore
 * loaded through this instead, so a boot does not read their files: on a
 * scale-to-zero deployment the files read before listen() are most of a cold
 * start. Keep the static import for types (`import type`).
 */
export const lazyImport = <T>(load: () => Promise<T>): (() => Promise<T>) => {
    let loaded: Promise<T> | undefined;
    return () => {
        loaded ??= load();
        return loaded;
    };
};
