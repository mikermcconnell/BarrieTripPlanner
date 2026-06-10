import AsyncStorage from '@react-native-async-storage/async-storage';

export const DISMISSED_OFFICIAL_IMPACTS_KEY = '@barrie_transit_dismissed_official_impacts';

const toArray = (value) => (Array.isArray(value) ? value : []);

const cleanId = (id) => String(id || '').trim();

export const loadDismissedOfficialImpactIds = async () => {
  const raw = await AsyncStorage.getItem(DISMISSED_OFFICIAL_IMPACTS_KEY);
  if (!raw) return [];

  try {
    return toArray(JSON.parse(raw)).map(cleanId).filter(Boolean);
  } catch {
    return [];
  }
};

export const saveDismissedOfficialImpactIds = async (ids = []) => {
  const uniqueIds = [...new Set(toArray(ids).map(cleanId).filter(Boolean))];
  await AsyncStorage.setItem(DISMISSED_OFFICIAL_IMPACTS_KEY, JSON.stringify(uniqueIds));
  return uniqueIds;
};

export const dismissOfficialImpact = async (impactId) => {
  const id = cleanId(impactId);
  const existingIds = await loadDismissedOfficialImpactIds();
  if (!id) return existingIds;
  return saveDismissedOfficialImpactIds([...existingIds, id]);
};

export const filterDismissedOfficialImpacts = (impacts = [], dismissedIds = []) => {
  const dismissed = new Set(toArray(dismissedIds).map(cleanId).filter(Boolean));
  return toArray(impacts).filter((impact) => !dismissed.has(cleanId(impact?.id)));
};
