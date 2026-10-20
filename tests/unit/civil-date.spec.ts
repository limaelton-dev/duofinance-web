import { expect, test } from '@playwright/test';
import {
    civilDate,
    civilValue,
    isCivilValueAllowed,
} from '../../src/lib/civil-date';

test('civil dates preserve leap days and years below 100 without UTC conversion', () => {
    for (const value of [
        '0001-01-01',
        '0099-12-31',
        '0100-01-01',
        '2024-02-29',
        '2026-10-19',
    ]) {
        expect(civilValue(civilDate(value)!, false)).toBe(value);
    }
    for (const invalid of [
        '',
        '0000-01-01',
        '2026-02-29',
        '2026-13-01',
        '2026-04-31',
    ]) {
        expect(civilDate(invalid)).toBeUndefined();
    }
});

test('calendar enforces inclusive date bounds and step, including across DST', () => {
    const constraints = { min: '2024-03-09', max: '2024-03-13', step: '2' };
    expect(isCivilValueAllowed('2024-03-09', false, constraints)).toBe(true);
    expect(isCivilValueAllowed('2024-03-10', false, constraints)).toBe(false);
    expect(isCivilValueAllowed('2024-03-11', false, constraints)).toBe(true);
    expect(isCivilValueAllowed('2024-03-13', false, constraints)).toBe(true);
    expect(isCivilValueAllowed('2024-03-15', false, constraints)).toBe(false);
});

test('month validation works independently of native month input support', () => {
    const constraints = { min: '0099-11', max: '0100-05', step: '2' };
    expect(isCivilValueAllowed('0099-11', true, constraints)).toBe(true);
    expect(isCivilValueAllowed('0100-01', true, constraints)).toBe(true);
    expect(isCivilValueAllowed('0100-02', true, constraints)).toBe(false);
    expect(isCivilValueAllowed('0100-07', true, constraints)).toBe(false);
    expect(isCivilValueAllowed('0100-01-01', true, constraints)).toBe(false);
});

test('step uses the value attribute when min is absent and supports any', () => {
    expect(
        isCivilValueAllowed('2026-10-20', false, {
            base: '2026-10-19',
            step: '2',
        }),
    ).toBe(false);
    expect(
        isCivilValueAllowed('2026-10-21', false, {
            base: '2026-10-19',
            step: '2',
        }),
    ).toBe(true);
    expect(isCivilValueAllowed('2026-10-20', false, { step: 'any' })).toBe(
        true,
    );
});
