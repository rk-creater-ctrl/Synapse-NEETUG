export const MENTOR_BOOKING_DURATION_MINUTES = 15;
export const MENTOR_BOOKING_DURATION_MILLISECONDS =
  MENTOR_BOOKING_DURATION_MINUTES * 60 * 1000;

export type MentorLocalDate = { year: number; month: number; day: number };

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string) {
  let value = formatterCache.get(timezone);
  if (!value) {
    value = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timezone, value);
  }
  return value;
}

export function parseMentorLocalDate(value: string): MentorLocalDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return utc.getUTCFullYear() === date.year && utc.getUTCMonth() === date.month - 1 && utc.getUTCDate() === date.day
    ? date
    : null;
}

export function localDateTimeParts(instant: Date, timezone: string) {
  const values: Record<string, number> = {};
  for (const part of formatter(timezone).formatToParts(instant)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
  };
}

function timezoneOffsetAt(instant: Date, timezone: string) {
  const parts = localDateTimeParts(instant, timezone);
  return (Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - instant.getTime()) / 60000;
}

/**
 * Resolves a mentor-local wall time with Intl only. Nonexistent DST times are
 * rejected; repeated wall times resolve to their earliest UTC instant.
 */
export function resolveMentorLocalMinute(
  date: MentorLocalDate,
  minuteOfDay: number,
  timezone: string,
): Date | null {
  const normalized = new Date(Date.UTC(date.year, date.month - 1, date.day, 0, minuteOfDay));
  const target = {
    year: normalized.getUTCFullYear(),
    month: normalized.getUTCMonth() + 1,
    day: normalized.getUTCDate(),
    hour: normalized.getUTCHours(),
    minute: normalized.getUTCMinutes(),
  };
  const base = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  const offsetProbes = [base - 24 * 60 * 60 * 1000, base, base + 24 * 60 * 60 * 1000];
  const candidates = [...new Set(offsetProbes.map((probe) => timezoneOffsetAt(new Date(probe), timezone)))].map(
    (offset) => new Date(base - offset * 60 * 1000),
  );
  return candidates
    .filter((candidate) => {
      const parts = localDateTimeParts(candidate, timezone);
      return Object.entries(target).every(([key, value]) => parts[key as keyof typeof parts] === value);
    })
    .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
}

export function localDateWeekday(date: MentorLocalDate) {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

export function formatMentorLocalDate(date: MentorLocalDate) {
  return `${date.year.toString().padStart(4, '0')}-${date.month.toString().padStart(2, '0')}-${date.day.toString().padStart(2, '0')}`;
}

export function formatMentorLocalTime(minute: number) {
  const normalized = ((minute % 1440) + 1440) % 1440;
  return `${Math.floor(normalized / 60).toString().padStart(2, '0')}:${(normalized % 60).toString().padStart(2, '0')}`;
}
