const makeResponse = (payload = new ArrayBuffer(0)) => ({
  ok: true,
  status: 200,
  arrayBuffer: jest.fn().mockResolvedValue(payload),
});

const makeZipFiles = () => ({
  'routes.txt': {
    async: jest.fn().mockResolvedValue(
      'route_id,route_short_name,route_long_name,route_type,route_color,route_text_color\n' +
        '11,11,Route 11,3,A6CE39,FFFFFF\n'
    ),
  },
  'stops.txt': {
    async: jest.fn().mockResolvedValue(
      'stop_id,stop_code,stop_name,stop_lat,stop_lon\n' +
        '100,100,Downtown Terminal,44.3891,-79.6903\n'
    ),
  },
  'trips.txt': {
    async: jest.fn().mockResolvedValue(
      'route_id,service_id,trip_id,trip_headsign,direction_id,shape_id,block_id\n' +
        '11,WEEK,trip-1,Downtown,0,shape-1,block-1\n'
    ),
  },
  'stop_times.txt': {
    async: jest.fn().mockResolvedValue(
      'trip_id,arrival_time,departure_time,stop_id,stop_sequence\n' +
        'trip-1,08:00:00,08:00:00,100,1\n'
    ),
  },
});

jest.mock('../utils/fetchWithCORS', () => ({
  fetchWithCORS: jest.fn(),
}));

jest.mock('../config/constants', () => ({
  GTFS_URLS: {
    STATIC_ZIP: 'https://www.myridebarrie.ca/gtfs/Google_transit.zip',
  },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { Base64: 'base64' },
  downloadAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

jest.mock('jszip', () => ({
  __esModule: true,
  default: {
    loadAsync: jest.fn(),
  },
}));

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    log: jest.fn(),
  },
}));

describe('fetchAllStaticData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('retries GTFS download with a cache-busting URL when the first ZIP payload is corrupt', async () => {
    const { fetchWithCORS } = require('../utils/fetchWithCORS');
    const JSZip = require('jszip').default;
    const { fetchAllStaticData } = require('../services/gtfsService');

    fetchWithCORS
      .mockResolvedValueOnce(makeResponse(new ArrayBuffer(4)))
      .mockResolvedValueOnce(makeResponse(new ArrayBuffer(4)));
    JSZip.loadAsync
      .mockRejectedValueOnce(
        new Error('Corrupted zip or bug: unexpected signature (\\xD6\\xD7\\x74\\x8D, expected \\x50\\x4B\\x03\\x04)')
      )
      .mockResolvedValueOnce({ files: makeZipFiles() });

    const data = await fetchAllStaticData();

    expect(data.routes).toHaveLength(1);
    expect(data.stops).toHaveLength(1);
    expect(data.trips[0].blockId).toBe('block-1');
    expect(fetchWithCORS).toHaveBeenCalledTimes(2);
    expect(JSZip.loadAsync.mock.calls[0][0]).toBeInstanceOf(Uint8Array);
    expect(fetchWithCORS.mock.calls[0][0]).toBe('https://www.myridebarrie.ca/gtfs/Google_transit.zip');
    expect(fetchWithCORS.mock.calls[1][0]).toMatch(
      /^https:\/\/www\.myridebarrie\.ca\/gtfs\/Google_transit\.zip\?bttpCacheBust=/
    );
    expect(fetchWithCORS.mock.calls[1][1]).toMatchObject({ cache: 'no-store' });
  });

  test('falls back to the native file downloader when fetch arrayBuffer keeps returning corrupt ZIP bytes', async () => {
    const { fetchWithCORS } = require('../utils/fetchWithCORS');
    const JSZip = require('jszip').default;
    const FileSystem = require('expo-file-system/legacy');
    const { fetchAllStaticData } = require('../services/gtfsService');

    fetchWithCORS
      .mockResolvedValueOnce(makeResponse(new ArrayBuffer(4)))
      .mockResolvedValueOnce(makeResponse(new ArrayBuffer(4)));
    FileSystem.downloadAsync.mockResolvedValueOnce({
      status: 200,
      uri: 'file:///cache/bttp-gtfs-static.zip',
    });
    FileSystem.readAsStringAsync.mockResolvedValueOnce('UEsDBA==');
    JSZip.loadAsync
      .mockRejectedValueOnce(new Error('Corrupted zip or bug: unexpected signature'))
      .mockRejectedValueOnce(new Error('Corrupted zip or bug: unexpected signature'))
      .mockResolvedValueOnce({ files: makeZipFiles() });

    const data = await fetchAllStaticData();

    expect(data.routes).toHaveLength(1);
    expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/www\.myridebarrie\.ca\/gtfs\/Google_transit\.zip\?bttpCacheBust=/
      ),
      'file:///cache/bttp-gtfs-static.zip',
      expect.objectContaining({
        cache: false,
        headers: expect.objectContaining({
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        }),
      })
    );
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith(
      'file:///cache/bttp-gtfs-static.zip',
      { encoding: 'base64' }
    );
  });

  test('falls back to the local dev proxy when Android direct downloads still return corrupt ZIP bytes', async () => {
    const { fetchWithCORS } = require('../utils/fetchWithCORS');
    const JSZip = require('jszip').default;
    const FileSystem = require('expo-file-system/legacy');
    const { fetchAllStaticData } = require('../services/gtfsService');

    fetchWithCORS
      .mockResolvedValueOnce(makeResponse(new ArrayBuffer(4)))
      .mockResolvedValueOnce(makeResponse(new ArrayBuffer(4)))
      .mockResolvedValueOnce(makeResponse(new ArrayBuffer(4)));
    FileSystem.downloadAsync.mockResolvedValueOnce({
      status: 200,
      uri: 'file:///cache/bttp-gtfs-static.zip',
    });
    FileSystem.readAsStringAsync.mockResolvedValueOnce('UEsDBA==');
    JSZip.loadAsync
      .mockRejectedValueOnce(new Error('Corrupted zip or bug: unexpected signature'))
      .mockRejectedValueOnce(new Error('Corrupted zip or bug: unexpected signature'))
      .mockRejectedValueOnce(new Error('Corrupted zip or bug: unexpected signature'))
      .mockResolvedValueOnce({ files: makeZipFiles() });

    const data = await fetchAllStaticData();

    expect(data.routes).toHaveLength(1);
    expect(fetchWithCORS).toHaveBeenCalledTimes(3);
    expect(fetchWithCORS.mock.calls[2][0]).toMatch(
      /^http:\/\/127\.0\.0\.1:3001\/proxy\?url=/
    );
    expect(decodeURIComponent(fetchWithCORS.mock.calls[2][0])).toContain(
      'https://www.myridebarrie.ca/gtfs/Google_transit.zip?bttpCacheBust='
    );
  });
});
