import { type UpgradeFailureClass } from '../../analytics/upgradeTelemetryEvents';
import { MigrationWaitTimeoutError } from './cli';
import { MigrationLeaseLostError } from './heartbeat';
import { classifyUpgradeFailure, resolveExecutionMode } from './telemetry';

describe('classifyUpgradeFailure', () => {
    test.each<{
        expected: UpgradeFailureClass;
        stage: string;
        error: unknown;
    }>([
        {
            expected: 'lease_lost',
            stage: 'graphile-worker',
            error: Object.assign(new MigrationLeaseLostError(), {
                code: '23505',
            }),
        },
        {
            expected: 'timeout_exceeded',
            stage: 'waiting',
            error: new MigrationWaitTimeoutError(),
        },
        {
            expected: 'migration_state_invalid',
            stage: 'migration-state',
            error: { code: '23505' },
        },
        {
            expected: 'lock_timeout',
            stage: '001_first.ts',
            error: { code: '55P03' },
        },
        {
            expected: 'lock_timeout',
            stage: '001_first.ts',
            error: { code: '57014' },
        },
        {
            expected: 'db_unreachable',
            stage: '001_first.ts',
            error: { code: '08006' },
        },
        {
            expected: 'db_unreachable',
            stage: '001_first.ts',
            error: { name: 'KnexTimeoutError' },
        },
        {
            expected: 'constraint_violation',
            stage: '001_first.ts',
            error: { code: '23514' },
        },
        {
            expected: 'permission_denied',
            stage: '001_first.ts',
            error: { code: '42501' },
        },
        {
            expected: 'resource_exhausted',
            stage: '001_first.ts',
            error: { code: '53200' },
        },
        {
            expected: 'migration_defect',
            stage: 'graphile-worker',
            error: { code: '42P01' },
        },
        {
            expected: 'graphile_worker_failed',
            stage: 'graphile-worker',
            error: new Error('failed'),
        },
        {
            expected: 'unclassified',
            stage: '001_first.ts',
            error: { code: 'not-a-pg-code' },
        },
    ])('returns $expected', ({ expected, stage, error }) => {
        expect(classifyUpgradeFailure({ stage, error })).toBe(expected);
    });

    test('covers every classifier-produced failure class', () => {
        const expectedClasses: UpgradeFailureClass[] = [
            'preflight_blocked',
            'migration_state_invalid',
            'lease_lost',
            'lock_timeout',
            'db_unreachable',
            'constraint_violation',
            'permission_denied',
            'resource_exhausted',
            'graphile_worker_failed',
            'timeout_exceeded',
            'migration_defect',
            'unclassified',
        ];
        expect(expectedClasses).toHaveLength(12);
    });
});

describe('resolveExecutionMode', () => {
    test.each([
        [{}, 'unknown'],
        [{ LIGHTDASH_MIGRATION_EXECUTION_MODE: '' }, 'unknown'],
        [{ LIGHTDASH_MIGRATION_EXECUTION_MODE: '  COMPOSE  ' }, 'compose'],
        [{ LIGHTDASH_MIGRATION_EXECUTION_MODE: 'boot-winner' }, 'boot-winner'],
        [{ LIGHTDASH_MIGRATION_EXECUTION_MODE: 'bad value!' }, 'unknown'],
        [{ LIGHTDASH_MIGRATION_EXECUTION_MODE: 'a'.repeat(33) }, 'unknown'],
    ])('resolves %j to %s', (env, expected) => {
        expect(resolveExecutionMode(env)).toBe(expected);
    });
});
