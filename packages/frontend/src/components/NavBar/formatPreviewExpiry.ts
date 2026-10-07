const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const pluralize = (count: number, unit: string): string =>
    `${count} ${unit}${count === 1 ? '' : 's'}`;

// Calendar days in the viewer's timezone, so the count matches the date shown
const calendarDaysBetween = (from: Date, to: Date): number =>
    (Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) -
        Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) /
    DAY;

// KONTALA: upstream rounded the time left up to whole days, so a preview
// expiring in 2 hours read "Expires in 1 day" and one 25 hours away "in 2 days"
export const formatPreviewExpiry = (expiresAt: Date, now: Date): string => {
    const remainingMs = expiresAt.getTime() - now.getTime();
    if (remainingMs <= 0) return 'Expired';
    if (remainingMs < MINUTE) return 'Expires in less than a minute';

    const minutes = Math.round(remainingMs / MINUTE);
    if (minutes < 60) return `Expires in ${pluralize(minutes, 'minute')}`;

    const hours = Math.round(remainingMs / HOUR);
    if (hours < 24) return `Expires in ${pluralize(hours, 'hour')}`;

    const days = calendarDaysBetween(now, expiresAt);
    if (days === 0) return 'Expires today';
    if (days === 1) return 'Expires tomorrow';
    return `Expires in ${pluralize(days, 'day')}`;
};
