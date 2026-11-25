/**
 * Shared Asia/Jakarta (WIB, UTC+7) date and ISO week helpers.
 */

export function getWibDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export function getWibYesterdayString(now = new Date()) {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return getWibDateString(yesterday);
}

export function getWibDaysAgoString(days = 1, now = new Date()) {
  const past = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return getWibDateString(past);
}

/**
 * Computes ISO week key (e.g. '2026-W48') anchored on Asia/Jakarta local date.
 */
export function getWibWeekKey(date = new Date()) {
  const dateStr = getWibDateString(date);
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  const dayNum = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Returns the Monday 00:00:00 WIB instant as a JS Date for the current WIB week.
 */
export function getWibWeekStartDate(date = new Date()) {
  const dateStr = getWibDateString(date);
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcMidnight = new Date(Date.UTC(y, m - 1, d));
  const dayNum = utcMidnight.getUTCDay() || 7; // 1 = Mon .. 7 = Sun
  utcMidnight.setUTCDate(utcMidnight.getUTCDate() - (dayNum - 1));
  // Midnight WIB is 17:00 UTC the previous day (UTC+7)
  return new Date(utcMidnight.getTime() - 7 * 60 * 60 * 1000);
}
