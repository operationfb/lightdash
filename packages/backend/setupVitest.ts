import { vi } from 'vitest';

// Safety net: stub global fetch so unit tests never hit the real network (tests override per-case).
vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 200 })),
);

vi.mock('./src/config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('./src/config/lightdashConfig.mock');

    return {
        lightdashConfig: lightdashConfigMock,
    };
});

vi.mock('knex-mock-client', async (importOriginal) => {
    const knexMockClient =
        await importOriginal<typeof import('knex-mock-client')>();
    // `dialect` chains MockClient.prototype to a pg client instance, whose `_events` every knex
    // transaction client (Object.create) would then share; shadow it so each gets its own.
    Object.assign(knexMockClient.MockClient.prototype, { _events: undefined });

    return knexMockClient;
});
