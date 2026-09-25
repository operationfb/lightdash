import { EventEmitter } from 'events';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';

describe('knex-mock-client with the pg dialect', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });

    it('reports each transaction query once without piling up listeners', async () => {
        getTracker().on.select('widgets').response([]);
        const statements: string[] = [];
        database.on('query', ({ sql }: Knex.Sql) => statements.push(sql));
        const onWarning = vi.fn();
        process.on('warning', onWarning);

        const transactionCount = EventEmitter.defaultMaxListeners + 1;
        for (let i = 0; i < transactionCount; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await database.transaction(async (trx) => {
                await trx('widgets').select();
            });
        }
        process.off('warning', onWarning);

        expect(statements).toEqual(
            Array.from({ length: transactionCount }, () => [
                'BEGIN;',
                'select * from "widgets"',
                'COMMIT;',
            ]).flat(),
        );
        expect(onWarning).not.toHaveBeenCalledWith(
            expect.objectContaining({ name: 'MaxListenersExceededWarning' }),
        );
    });
});
