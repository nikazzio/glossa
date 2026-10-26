import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_WEEKS,
  activityWeeks,
  busiestWeekday,
  currentStreak,
  intensityLevels,
  intensityOf,
} from './dashboardActivity';

const now = new Date(2026, 9, 7, 15); // mercoledì 7 ottobre 2026

describe('dashboard activity', () => {
  it('lays out whole weeks from Monday, with the rest of this week marked as future', () => {
    const weeks = activityWeeks([{ day: '2026-10-06', kind: 'translation', count: 4 }], now);
    expect(weeks).toHaveLength(ACTIVITY_WEEKS);
    const last = weeks[ACTIVITY_WEEKS - 1];
    expect(last[0].day).toBe('2026-10-05');
    expect(last[1]).toMatchObject({ day: '2026-10-06', total: 4 });
    expect(last[3].future).toBe(true);
  });

  it('counts the streak up to today, or up to yesterday when today is still empty', () => {
    const weeks = activityWeeks([
      { day: '2026-10-05', kind: 'ocr', count: 1 },
      { day: '2026-10-06', kind: 'transcription', count: 2 },
    ], now);
    expect(currentStreak(weeks.flat(), now)).toBe(2);
    expect(busiestWeekday(weeks)).toBe(1);
  });

  it('spreads intensity over the quartiles of worked days', () => {
    const weeks = activityWeeks([1, 2, 3, 4].map((count, index) => ({ day: `2026-09-0${index + 1}`, kind: 'source' as const, count })), now);
    const levels = intensityLevels(weeks.flat());
    expect(intensityOf(0, levels)).toBe(0);
    expect(intensityOf(4, levels)).toBe(4);
  });

});
