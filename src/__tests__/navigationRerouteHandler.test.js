const fs = require('fs');
const path = require('path');
const vm = require('vm');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

// Execute the actual screen callback, not a duplicated implementation.
// Native UI/location dependencies are replaced; this is not a device test.
const loadHandler = (fileName, overrides = {}) => {
  const source = fs.readFileSync(path.join(__dirname, '../screens', fileName), 'utf8');
  const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
  let callback;
  traverse(ast, { VariableDeclarator(nodePath) {
    if (nodePath.node.id.name === 'handleRecalculate') callback = nodePath.node.init.arguments[0];
  } });
  if (!callback) throw new Error('Reroute callback not found');
  const nextItinerary = { id: 'replacement', legs: [{ to: { lat: 44.4, lon: -79.6 } }] };
  const context = {
    isRecalculatingRoute: false,
    itinerary: { legs: [{ to: { lat: 44.4, lon: -79.6 } }] },
    userLocation: { latitude: 44.3, longitude: -79.7 },
    ensureRoutingData: jest.fn(), onDemandZones: [], stops: [],
    setIsRecalculatingRoute: jest.fn(), clearOffRouteState: jest.fn(),
    recalculateNavigationItinerary: jest.fn().mockResolvedValue({ itinerary: nextItinerary, routingDiagnostics: { source: 'local' } }),
    logger: { info: jest.fn(), error: jest.fn() }, trackNavigationEvent: jest.fn(),
    staleCheckedRef: { current: true }, missedBusWarningRef: { current: true },
    setShowStaleWarning: jest.fn(), setShowMissedBusWarning: jest.fn(),
    disableFollowMode: jest.fn(), setItinerary: jest.fn(),
    resetNavigation: jest.fn(), startNavigation: jest.fn(),
    Alert: { alert: jest.fn() }, alert: jest.fn(),
    getUserFacingErrorMessage: (_error, fallback) => fallback,
    ...overrides,
  };
  const handler = vm.runInNewContext(`(${source.slice(callback.start, callback.end)})`, context);
  return { handler, context, nextItinerary };
};

describe.each(['NavigationScreen.js', 'NavigationScreen.web.js'])('%s reroute handler', (fileName) => {
  test('applies replacement itinerary and restarts navigation without a missing follow-mode call', async () => {
    const { handler, context: c, nextItinerary } = loadHandler(fileName);
    await handler();
    expect(c.logger.error).not.toHaveBeenCalled();
    expect(c.recalculateNavigationItinerary).toHaveBeenCalledWith(expect.objectContaining({ userLocation: c.userLocation, destination: c.itinerary.legs[0].to }));
    expect(c.disableFollowMode).toHaveBeenCalledTimes(1);
    expect(c.setItinerary).toHaveBeenCalledWith(nextItinerary);
    expect(c.resetNavigation).toHaveBeenCalledTimes(1);
    expect(c.startNavigation).toHaveBeenCalledTimes(1);
    expect(c.setItinerary.mock.invocationCallOrder[0]).toBeLessThan(c.resetNavigation.mock.invocationCallOrder[0]);
    expect(c.resetNavigation.mock.invocationCallOrder[0]).toBeLessThan(c.startNavigation.mock.invocationCallOrder[0]);
    expect(c.setIsRecalculatingRoute.mock.calls).toEqual([[true], [false]]);
  });
  test('routing failures leave the existing itinerary and release the loading state', async () => {
    const error = new Error('No route available');
    const { handler, context: c } = loadHandler(fileName, { recalculateNavigationItinerary: jest.fn().mockRejectedValue(error) });
    await handler();
    expect(c.logger.error).toHaveBeenCalledWith('Navigation reroute failed:', error);
    expect(c.setItinerary).not.toHaveBeenCalled();
    expect(c.startNavigation).not.toHaveBeenCalled();
    expect(fileName.endsWith('.web.js') ? c.alert : c.Alert.alert).toHaveBeenCalled();
    expect(c.setIsRecalculatingRoute).toHaveBeenLastCalledWith(false);
  });
  test('ignores another request while rerouting', async () => {
    const { handler, context: c } = loadHandler(fileName, { isRecalculatingRoute: true });
    await handler();
    expect(c.recalculateNavigationItinerary).not.toHaveBeenCalled();
    expect(c.setIsRecalculatingRoute).not.toHaveBeenCalled();
  });
});
