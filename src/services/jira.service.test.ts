import { describe, it, expect } from 'vitest';
import { isSprintCurrent } from './jira.service';

describe('isSprintCurrent', () => {
  const now = new Date('2026-06-23T00:00:00.000Z').getTime();

  it('returns false for an active sprint whose endDate has already passed', () => {
    // Real-world case: Sprint 12 ended 2026-06-12 but was never closed in Jira,
    // so it lingers in the "active" state and must not be auto-assigned.
    expect(isSprintCurrent({ endDate: '2026-06-12T15:23:50.000Z' }, now)).toBe(false);
  });

  it('returns true for an active sprint whose endDate is in the future', () => {
    expect(isSprintCurrent({ endDate: '2026-07-05T00:00:00.000Z' }, now)).toBe(true);
  });

  it('treats a missing endDate as current (ongoing/Kanban-style sprint)', () => {
    expect(isSprintCurrent({ endDate: null }, now)).toBe(true);
    expect(isSprintCurrent({}, now)).toBe(true);
  });
});
