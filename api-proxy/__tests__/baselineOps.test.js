const mockGetStaticData = jest.fn();
const mockGetBaselineData = jest.fn();
const mockGetBaselineStatus = jest.fn();

jest.mock('../gtfsLoader', () => ({ getStaticData: mockGetStaticData }));
jest.mock('../baselineManager', () => ({
  getBaselineData: mockGetBaselineData,
  getBaselineStatus: mockGetBaselineStatus,
  setBaseline: jest.fn(),
  setBaselineRoutes: jest.fn(),
  clearBaseline: jest.fn(),
}));

describe('baselineOps cold-start hydration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('hydrates the stored baseline before reporting readiness and divergence', async () => {
    const liveData = {
      shapes: new Map([['shape-8a', [{ latitude: 44.3, longitude: -79.7 }]]]),
      routeShapeMapping: new Map([['8A', ['shape-8a']]]),
    };
    mockGetStaticData.mockResolvedValue(liveData);
    mockGetBaselineData.mockResolvedValue(liveData);
    mockGetBaselineStatus.mockReturnValue({
      loaded: true,
      source: 'firestore',
      readyForDetours: true,
      routeCount: 1,
      shapeCount: 1,
    });

    const { getBaselineStatusWithDivergence } = require('../services/baselineOps');
    const result = await getBaselineStatusWithDivergence();

    expect(mockGetBaselineData).toHaveBeenCalledWith(liveData);
    expect(result).toMatchObject({
      loaded: true,
      source: 'firestore',
      readyForDetours: true,
      divergence: { hasChanges: false, changedRouteIds: [] },
    });
  });
});
