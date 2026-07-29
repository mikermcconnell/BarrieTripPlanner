import { LOCAL_LANDMARKS } from '../config/localLandmarks';

export const normalizeLandmarkSearchText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const getMatchScore = (landmark, normalizedQuery) => {
  const phrases = [landmark.name, ...(landmark.aliases || [])]
    .map(normalizeLandmarkSearchText)
    .filter(Boolean);
  const searchableWords = new Set(phrases.flatMap((phrase) => phrase.split(' ')));
  const queryWords = normalizedQuery.split(' ');

  if (phrases.some((phrase) => phrase === normalizedQuery)) return 10000;
  if (phrases.some((phrase) => phrase.startsWith(normalizedQuery))) return 8000;
  if (phrases.some((phrase) => phrase.includes(normalizedQuery))) return 6000;

  const allWordsMatch = queryWords.every((queryWord) => (
    [...searchableWords].some((word) => word.startsWith(queryWord))
  ));
  if (allWordsMatch) return 4000;

  return 0;
};

export const findMatchingLocalLandmarks = (query, limit = 5) => {
  const normalizedQuery = normalizeLandmarkSearchText(query);
  if (normalizedQuery.length < 2) return [];

  return LOCAL_LANDMARKS
    .map((landmark) => ({
      landmark,
      score: getMatchScore(landmark, normalizedQuery),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => (
      b.score - a.score ||
      b.landmark.priority - a.landmark.priority ||
      a.landmark.name.localeCompare(b.landmark.name)
    ))
    .slice(0, limit)
    .map(({ landmark }) => ({
      id: `landmark-${landmark.id}`,
      source: 'local_landmark',
      shortName: landmark.name,
      displayName: `${landmark.address}, Barrie, ON`,
      address: {
        name: landmark.name,
        city: 'Barrie',
        state: 'Ontario',
      },
      lat: landmark.coordinate.latitude,
      lon: landmark.coordinate.longitude,
      type: landmark.category,
      importance: landmark.priority / 100,
      landmarkId: landmark.id,
    }));
};

