import { LOCAL_LANDMARKS } from '../config/localLandmarks';
import {
  findMatchingLocalLandmarks,
  normalizeLandmarkSearchText,
} from '../utils/localLandmarkSearch';

describe('local landmark catalogue', () => {
  test('covers a broad set of Barrie destination categories', () => {
    expect(LOCAL_LANDMARKS.length).toBeGreaterThanOrEqual(50);

    const categories = new Set(LOCAL_LANDMARKS.map((landmark) => landmark.category));
    [
      'transit',
      'healthcare',
      'recreation',
      'education',
      'library',
      'shopping',
      'civic',
      'culture',
      'park',
    ].forEach((category) => expect(categories.has(category)).toBe(true));
  });

  test('has unique IDs and valid Barrie-area coordinates', () => {
    const ids = LOCAL_LANDMARKS.map((landmark) => landmark.id);
    expect(new Set(ids).size).toBe(ids.length);

    LOCAL_LANDMARKS.forEach((landmark) => {
      expect(landmark.name).toEqual(expect.any(String));
      expect(landmark.address).toEqual(expect.any(String));
      expect(landmark.coordinate.latitude).toBeGreaterThanOrEqual(44.25);
      expect(landmark.coordinate.latitude).toBeLessThanOrEqual(44.5);
      expect(landmark.coordinate.longitude).toBeGreaterThanOrEqual(-79.85);
      expect(landmark.coordinate.longitude).toBeLessThanOrEqual(-79.55);
    });
  });

  test.each([
    ['RVH', 'RVH'],
    ['Royal Victoria Hospital', 'RVH'],
    ['Sadlon Centre', 'Sadlon Arena'],
    ['Sadland Centre', 'Sadlon Arena'],
    ['BMC', 'Sadlon Arena'],
    ['downtown barrie', 'Downtown Hub'],
    ['PHTCC', 'Peggy Hill Team Community Centre'],
    ['BNCI', 'Barrie North Collegiate Institute'],
    ['College Boreal', 'Collège Boréal — Barrie Campus'],
    ['St Joes', "St. Joseph's Catholic High School"],
    ['Romeo Dallaire', 'École secondaire Roméo-Dallaire'],
    ['Mady Centre', 'Five Points Theatre'],
    ['SMDHU', 'Simcoe Muskoka District Health Unit'],
  ])('matches "%s" to %s', (query, expectedName) => {
    expect(findMatchingLocalLandmarks(query)[0]).toMatchObject({
      source: 'local_landmark',
      shortName: expectedName,
    });
  });

  test('supports a two-character GO search without returning unrelated places', () => {
    const results = findMatchingLocalLandmarks('GO');
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.every((result) => /GO/.test(result.shortName))).toBe(true);
  });

  test('normalizes accents, punctuation, apostrophes, and ampersands', () => {
    expect(normalizeLandmarkSearchText("Minet's Point Park & Beach"))
      .toBe('minet s point park and beach');
    expect(normalizeLandmarkSearchText('École Roméo-Dallaire'))
      .toBe('ecole romeo dallaire');
  });
});
