/** Lịch mô phỏng (ADR-04): 30 ngày/tháng, 12 tháng/năm, 360 ngày/năm; day 0 = Năm 1, Tháng 1, Ngày 1. */
import { divFloor } from './math.ts';
import type { Day } from '../types.ts';

export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;
export const DAYS_PER_QUARTER = DAYS_PER_MONTH * 3;

export interface CalendarDate {
  year: number;
  month: number;
  dayOfMonth: number;
}

export function toCalendar(day: Day): CalendarDate {
  const yearIndex = divFloor(day, DAYS_PER_YEAR);
  const dayOfYear = day - yearIndex * DAYS_PER_YEAR;
  const monthIndex = divFloor(dayOfYear, DAYS_PER_MONTH);
  return {
    year: yearIndex + 1,
    month: monthIndex + 1,
    dayOfMonth: dayOfYear - monthIndex * DAYS_PER_MONTH + 1,
  };
}

export function formatDate(day: Day): string {
  const { year, month, dayOfMonth } = toCalendar(day);
  return `Năm ${year}, Tháng ${month}, Ngày ${dayOfMonth}`;
}

export function yearsToDays(years: number): number {
  return years * DAYS_PER_YEAR;
}

/** Tuổi tròn năm (có thể âm nếu chưa sinh). */
export function ageInYears(birthDay: Day, today: Day): number {
  return divFloor(today - birthDay, DAYS_PER_YEAR);
}

export function isMonthBoundary(day: Day): boolean {
  return day > 0 && day % DAYS_PER_MONTH === 0;
}

export function isQuarterBoundary(day: Day): boolean {
  return day > 0 && day % DAYS_PER_QUARTER === 0;
}
