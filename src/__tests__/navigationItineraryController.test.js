global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { act, create } = require('react-test-renderer');

let resolveEnrichment;
const mockEnrichItineraryWithWalking = jest.fn(() => new Promise((resolve) => {
  resolveEnrichment = resolve;
}));

jest.mock('../services/walkingService', () => ({
  enrichItineraryWithWalking: (...args) => mockEnrichItineraryWithWalking(...args),
}));

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn() },
}));

const { useNavigationItineraryController } = require('../features/navigation/useNavigationItineraryController');

describe('useNavigationItineraryController', () => {
  test('does not let late initial enrichment overwrite a rerouted itinerary', async () => {
    let hookApi;
    const navigation = { goBack: jest.fn() };
    const initialItinerary = { id: 'initial', legs: [{ mode: 'WALK' }] };
    const reroutedItinerary = { id: 'rerouted', legs: [{ mode: 'BUS' }] };

    const Harness = () => {
      hookApi = useNavigationItineraryController({ initialItinerary, navigation });
      return null;
    };

    let instance;
    await act(async () => {
      instance = create(React.createElement(Harness));
    });

    act(() => {
      hookApi.setItinerary(reroutedItinerary);
    });
    await act(async () => {
      resolveEnrichment({ ...initialItinerary, enriched: true });
      await Promise.resolve();
    });

    expect(hookApi.itinerary).toBe(reroutedItinerary);
    act(() => instance.unmount());
  });
});
