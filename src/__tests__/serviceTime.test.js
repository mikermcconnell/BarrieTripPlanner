const {
  addServiceDays,
  getAgencyWallClockPickerDate,
  getAgencySecondsSinceMidnight,
  getServiceDayOfWeek,
  isCurrentAgencyServiceDate,
  normalizeServiceDate,
  pickerDateToAgencyInstant,
  serviceDateTimeToTimestamp,
} = require('../utils/serviceTime');

describe('Barrie service time', () => {
  test('rejects absent and invalid date values', () => {
    expect(normalizeServiceDate(null)).toBeNull();
    expect(normalizeServiceDate('')).toBeNull();
    expect(normalizeServiceDate('not-a-date')).toBeNull();
  });

  test('derives service date and clock time in America/Toronto', () => {
    const instant = new Date('2026-08-28T04:30:15.000Z');
    expect(normalizeServiceDate(instant)).toBe('20260828');
    expect(getAgencySecondsSinceMidnight(instant)).toBe(30 * 60 + 15);
  });

  test('adds service days without depending on the device timezone', () => {
    expect(addServiceDays('20260301', -1)).toBe('20260228');
    expect(addServiceDays('20261231', 1)).toBe('20270101');
    expect(getServiceDayOfWeek('20260828')).toBe('friday');
  });

  test('turns after-midnight GTFS seconds into the correct Toronto instant', () => {
    expect(serviceDateTimeToTimestamp('20260101', 25 * 3600 + 10 * 60)).toBe(
      new Date('2026-01-02T06:10:00.000Z').getTime()
    );
  });

  test('uses the correct offsets on both sides of daylight-saving time', () => {
    expect(serviceDateTimeToTimestamp('20260307', 12 * 3600)).toBe(
      new Date('2026-03-07T17:00:00.000Z').getTime()
    );
    expect(serviceDateTimeToTimestamp('20260309', 12 * 3600)).toBe(
      new Date('2026-03-09T16:00:00.000Z').getTime()
    );
    expect(serviceDateTimeToTimestamp('20261102', 12 * 3600)).toBe(
      new Date('2026-11-02T17:00:00.000Z').getTime()
    );
  });

  test('compares current service dates in Barrie rather than the device zone', () => {
    expect(isCurrentAgencyServiceDate('20260828', new Date('2026-08-28T04:05:00Z'))).toBe(true);
    expect(isCurrentAgencyServiceDate('20260827', new Date('2026-08-28T04:05:00Z'))).toBe(false);
  });

  test('converts picker wall-clock fields into Barrie service time', () => {
    const pickerValue = new Date(2026, 6, 14, 9, 30, 0);
    expect(pickerDateToAgencyInstant(pickerValue)?.getTime()).toBe(
      new Date('2026-07-14T13:30:00.000Z').getTime()
    );
  });

  test('builds picker fields from the Barrie wall clock', () => {
    const pickerValue = getAgencyWallClockPickerDate(new Date('2026-08-28T18:00:00.000Z'));
    expect({
      year: pickerValue?.getFullYear(),
      month: pickerValue?.getMonth() + 1,
      day: pickerValue?.getDate(),
      hour: pickerValue?.getHours(),
      minute: pickerValue?.getMinutes(),
    }).toEqual({
      year: 2026,
      month: 8,
      day: 28,
      hour: 14,
      minute: 0,
    });
  });

  test('handles service times on the daylight-saving transition dates', () => {
    expect(serviceDateTimeToTimestamp('20260308', 1.5 * 3600)).toBe(
      new Date('2026-03-08T06:30:00.000Z').getTime()
    );
    expect(serviceDateTimeToTimestamp('20260308', 3.5 * 3600)).toBe(
      new Date('2026-03-08T07:30:00.000Z').getTime()
    );
    expect(serviceDateTimeToTimestamp('20261101', 3.5 * 3600)).toBe(
      new Date('2026-11-01T08:30:00.000Z').getTime()
    );
  });
});
