import runtimeConfig from '../config/runtimeConfig';
import { PLATFORM_MAP_SOURCE_URL } from '../config/platformMaps';

const trimTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');

export const buildPlatformMapImageUrl = (hubId) => {
  if (!hubId) return '';
  const apiBaseUrl = trimTrailingSlash(runtimeConfig.proxy.apiBaseUrl);
  if (!apiBaseUrl) return '';
  return `${apiBaseUrl}/api/platform-maps/${encodeURIComponent(hubId)}`;
};

export const getPlatformMapSourceUrl = () => PLATFORM_MAP_SOURCE_URL;
