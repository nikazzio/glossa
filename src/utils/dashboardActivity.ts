import type { ActivityKind, ActivityRow } from '../services/statsService';

/** Settimane mostrate nel calendario del lavoro. */
export const ACTIVITY_WEEKS = 26;

export interface ActivityDay {
  day: string;
  counts: Record<ActivityKind, number>;
  total: number;
  /** Giorno futuro nella settimana in corso: casella vuota, non zero. */
  future: boolean;
}

const EMPTY_COUNTS: Record<ActivityKind, number> = { transcription: 0, ocr: 0, translation: 0, source: 0 };

/** «AAAA-MM-GG» nel fuso del computer, come `date(…, 'localtime')` di SQLite. */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Primo giorno del calendario: il lunedì di `ACTIVITY_WEEKS - 1` settimane fa. */
export function activityStart(now: Date = new Date()): Date {
  const mondayOffset = (now.getDay() + 6) % 7;
  return addDays(now, -mondayOffset - (ACTIVITY_WEEKS - 1) * 7);
}

/** Le settimane del calendario, ognuna da lunedì a domenica. */
export function activityWeeks(rows: ActivityRow[], now: Date = new Date()): ActivityDay[][] {
  const byDay = new Map<string, Record<ActivityKind, number>>();
  for (const row of rows) {
    const counts = byDay.get(row.day) ?? { ...EMPTY_COUNTS };
    byDay.set(row.day, { ...counts, [row.kind]: counts[row.kind] + Number(row.count) });
  }
  const today = localDay(now);
  const start = activityStart(now);
  return Array.from({ length: ACTIVITY_WEEKS }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const day = localDay(addDays(start, week * 7 + weekday));
      const counts = byDay.get(day) ?? EMPTY_COUNTS;
      return { day, counts, total: counts.transcription + counts.ocr + counts.translation + counts.source, future: day > today };
    }));
}

/** Giorni di fila con lavoro, fino a oggi; se oggi è vuoto conta da ieri. */
export function currentStreak(days: ActivityDay[], now: Date = new Date()): number {
  const worked = new Set(days.filter((day) => day.total > 0).map((day) => day.day));
  let cursor = worked.has(localDay(now)) ? now : addDays(now, -1);
  let streak = 0;
  while (worked.has(localDay(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Giorno della settimana (0 = lunedì) con più lavoro nel calendario, o `null`. */
export function busiestWeekday(weeks: ActivityDay[][]): number | null {
  const totals = Array.from({ length: 7 }, (_, weekday) =>
    weeks.reduce((sum, week) => sum + week[weekday].total, 0));
  const best = Math.max(...totals);
  return best > 0 ? totals.indexOf(best) : null;
}

/** Soglie dei quattro toni del calendario, dai quartili dei giorni lavorati. */
export function intensityLevels(days: ActivityDay[]): number[] {
  const values = days.filter((day) => day.total > 0).map((day) => day.total).sort((a, b) => a - b);
  if (values.length === 0) return [1, 1, 1];
  const at = (q: number) => values[Math.min(values.length - 1, Math.floor((values.length - 1) * q))];
  return [at(0.25), at(0.5), at(0.75)];
}

export function intensityOf(total: number, levels: number[]): 0 | 1 | 2 | 3 | 4 {
  if (total <= 0) return 0;
  if (total <= levels[0]) return 1;
  if (total <= levels[1]) return 2;
  if (total <= levels[2]) return 3;
  return 4;
}
