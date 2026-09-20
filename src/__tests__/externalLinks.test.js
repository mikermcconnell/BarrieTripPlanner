const mockCanOpenURL = jest.fn();
const mockOpenURL = jest.fn();
const mockSendIntent = jest.fn();

jest.mock('react-native', () => ({
  Linking: {
    canOpenURL: (...args) => mockCanOpenURL(...args),
    openURL: (...args) => mockOpenURL(...args),
    sendIntent: (...args) => mockSendIntent(...args),
  },
  Platform: { OS: 'android' },
}));

jest.mock('../config/constants', () => ({
  APP_CONFIG: {
    APP_CONTACT_EMAIL: 'mybarrietransit@outlook.com',
    VERSION: '1.0.7',
    BUILD_NUMBER: '18',
    TRANSIT_CONTACT_EMAIL: 'ServiceBarrie@barrie.ca',
    TRANSIT_CONTACT_URL: 'https://service.barrie.ca/',
  },
}));

const {
  buildAppContactEmailUrl,
  buildTransitContactEmailUrl,
  isAllowedExternalUrl,
  openDeviceTextSettings,
  openExternalUrl,
  openTransitContactPage,
} = require('../utils/externalLinks');

describe('external links', () => {
  beforeEach(() => {
    mockCanOpenURL.mockReset();
    mockOpenURL.mockReset();
    mockSendIntent.mockReset();
  });

  test('allows only HTTPS and email destinations', () => {
    expect(isAllowedExternalUrl('https://www.barrie.ca/')).toBe(true);
    expect(isAllowedExternalUrl('mailto:ServiceBarrie@barrie.ca')).toBe(true);
    expect(isAllowedExternalUrl('http://example.com')).toBe(false);
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false);
  });

  test('builds a Barrie Transit contact email without describing it as app support', () => {
    const url = decodeURIComponent(buildTransitContactEmailUrl({ subject: 'Transit question', body: 'Details' }));
    expect(url).toContain('mailto:ServiceBarrie@barrie.ca');
    expect(url).toContain('subject=Transit question');
    expect(url).not.toContain('support');
  });

  test('builds the independent app support email with release context', () => {
    const url = decodeURIComponent(buildAppContactEmailUrl({ body: 'Details' }));
    expect(url).toContain('mailto:mybarrietransit@outlook.com');
    expect(url).toContain('App version: 1.0.7 (18)');
  });

  test('does not open an unsupported link', async () => {
    mockCanOpenURL.mockResolvedValue(false);
    const result = await openExternalUrl('https://www.barrie.ca/');
    expect(result.success).toBe(false);
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  test('opens a supported link', async () => {
    mockCanOpenURL.mockResolvedValue(true);
    mockOpenURL.mockResolvedValue(undefined);
    await expect(openExternalUrl('https://www.barrie.ca/')).resolves.toEqual({ success: true });
    expect(mockOpenURL).toHaveBeenCalledWith('https://www.barrie.ca/');
  });

  test('opens the Service Barrie contact page without requiring an email app', async () => {
    mockCanOpenURL.mockResolvedValue(true);
    mockOpenURL.mockResolvedValue(undefined);

    await expect(openTransitContactPage()).resolves.toEqual({ success: true });

    expect(mockOpenURL).toHaveBeenCalledWith('https://service.barrie.ca/');
  });

  test('opens Android display settings for text size', async () => {
    mockSendIntent.mockResolvedValue(undefined);

    await expect(openDeviceTextSettings()).resolves.toEqual({ success: true });

    expect(mockSendIntent).toHaveBeenCalledWith('android.settings.DISPLAY_SETTINGS');
  });

  test('returns accurate iOS text-size instructions instead of opening unrelated app settings', async () => {
    const { Platform } = require('react-native');
    Platform.OS = 'ios';

    await expect(openDeviceTextSettings()).resolves.toEqual({
      success: true,
      opened: false,
      message: 'Open Settings, choose Accessibility, then Display & Text Size and Larger Text.',
    });

    expect(mockSendIntent).not.toHaveBeenCalled();
    Platform.OS = 'android';
  });
});
