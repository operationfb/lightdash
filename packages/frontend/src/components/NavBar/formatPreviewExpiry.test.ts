import { describe, expect, it } from 'vitest';
import { formatPreviewExpiry } from './formatPreviewExpiry';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Local wall-clock times, so calendar days come out the same in any timezone
const now = new Date(2026, 9, 7, 9, 47);
const fromNow = (ms: number) => new Date(now.getTime() + ms);

describe('formatPreviewExpiry', () => {
    it('says a preview past its expiry has expired', () => {
        expect(formatPreviewExpiry(fromNow(-HOUR), now)).toBe('Expired');
        expect(formatPreviewExpiry(now, now)).toBe('Expired');
    });

    it('counts minutes under an hour', () => {
        expect(formatPreviewExpiry(fromNow(30 * 1000), now)).toBe(
            'Expires in less than a minute',
        );
        expect(formatPreviewExpiry(fromNow(MINUTE), now)).toBe(
            'Expires in 1 minute',
        );
        expect(formatPreviewExpiry(fromNow(45 * MINUTE), now)).toBe(
            'Expires in 45 minutes',
        );
    });

    it('counts hours, to the nearest, under a day', () => {
        expect(formatPreviewExpiry(fromNow(HOUR - 20 * 1000), now)).toBe(
            'Expires in 1 hour',
        );
        expect(formatPreviewExpiry(fromNow(HOUR), now)).toBe(
            'Expires in 1 hour',
        );
        // A 2-hour preview a minute after it was made read "Expires in 1 day"
        expect(formatPreviewExpiry(fromNow(2 * HOUR - MINUTE), now)).toBe(
            'Expires in 2 hours',
        );
        expect(formatPreviewExpiry(fromNow(23 * HOUR), now)).toBe(
            'Expires in 23 hours',
        );
    });

    it('calls the next calendar day tomorrow', () => {
        expect(formatPreviewExpiry(fromNow(24 * HOUR), now)).toBe(
            'Expires tomorrow',
        );
        // 10:47 tomorrow read "Expires in 2 days"
        expect(formatPreviewExpiry(fromNow(25 * HOUR), now)).toBe(
            'Expires tomorrow',
        );
    });

    it('counts calendar days, not 24-hour periods', () => {
        expect(formatPreviewExpiry(fromNow(49 * HOUR), now)).toBe(
            'Expires in 2 days',
        );
        // The CLI's default lifetime
        expect(formatPreviewExpiry(fromNow(720 * HOUR), now)).toBe(
            'Expires in 30 days',
        );
    });

    it('says today when nearly a day is left before midnight', () => {
        expect(
            formatPreviewExpiry(
                new Date(2026, 9, 7, 23, 50),
                new Date(2026, 9, 7, 0, 10),
            ),
        ).toBe('Expires today');
    });
});
