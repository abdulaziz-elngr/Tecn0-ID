/**
 * Converts between "HH:MM" (24-hour) strings used in API payloads and
 * minutes-from-midnight used for storage/overlap math.
 */

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function timeStringToMinutes(value: string): number | null {
  const match = TIME_REGEX.exec(value);
  if (!match) return null;
  const [, h, m] = match;
  return Number(h) * 60 + Number(m);
}

export function minutesToTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}
