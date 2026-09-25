/**
 * KONTALA: defers a module until first use, and loads it once.
 *
 * Every warehouse client is imported whenever this package is, and nearly
 * every server file imports this package, so each driver used to load at
 * server boot whether or not any project uses that warehouse. Drivers are
 * loaded through this instead, when a client first connects. On a
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
