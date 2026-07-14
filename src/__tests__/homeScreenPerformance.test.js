const fs = require('fs');
const path = require('path');

describe('HomeScreen map performance', () => {
  test('passive home map marker views allow map gestures through', () => {
    const homeSource = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'HomeScreen.js'),
      'utf8'
    );
    const busHubSource = fs.readFileSync(
      path.join(__dirname, '..', 'components', 'BusHubOverlay.js'),
      'utf8'
    );

    const routeLabelsStart = homeSource.indexOf('const HomeMapRouteLineLabelsLayer = React.memo');
    const routeLabelsEnd = homeSource.indexOf('const HomeMapStopsLayer = React.memo', routeLabelsStart);
    const routeLabelsSource = homeSource.slice(routeLabelsStart, routeLabelsEnd);

    expect(routeLabelsSource).toContain('pointerEvents="none"');
    expect(busHubSource).toContain('pointerEvents="none"');
  });

  test('detour decorative marker views allow map gestures through', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'components', 'DetourOverlay.js'),
      'utf8'
    );

    expect(source).not.toContain('key={`detour-direction-arrow-${routeId}-${index}-${arrow.direction}-${arrowIndex}`}');
    expect(source).toContain('key={`detour-route-stop-${routeId}-${stop.id ??');
    expect(source).toContain('key={`detour-closed-stop-${routeId}-${point.id ??');
    expect(source).toContain('key={`detour-skipped-stop-${routeId}-${stopMarkerKey}-${stopIndex}`}');
    expect(source).toContain('pointerEvents="none"');
    expect(source).toContain('pointerEvents="box-none"');
  });

  test('regular home map mode renders lightweight detour geometry and masks closed route sections', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'HomeScreen.js'),
      'utf8'
    );

    const layerStart = source.indexOf('const HomeMapRoutesLayer = React.memo');
    const layerEnd = source.indexOf('const HomeMapRouteLineLabelsLayer = React.memo', layerStart);
    const layerSource = source.slice(layerStart, layerEnd);

    expect(layerSource).toContain(
      'const shouldRenderDetourMapOverlays = shouldShowDetourGeometryOverlay({ isDetourView, hasDetourFocus });'
    );
    expect(layerSource).toContain(
      'showArrows={false}'
    );
    expect(layerSource).toContain(
      'const routeMaskingDetourOverlays = shouldRenderDetourMapOverlays ? detourOverlays : [];'
    );
    expect(layerSource).toContain('detourOverlays: routeMaskingDetourOverlays');
    expect(layerSource).toContain('{shouldRenderDetourMapOverlays && detourOverlays.map((overlay) => (');
  });

  test('regular home map mode also mounts lightweight closed-stop markers', () => {
    const nativeSource = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'HomeScreen.js'),
      'utf8'
    );
    const webSource = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'HomeScreen.web.impl.js'),
      'utf8'
    );

    [nativeSource, webSource].forEach((source) => {
      const markerKeyStart = source.indexOf('key={`detour-stops-${overlay.routeId}`}');
      const markerStart = source.lastIndexOf('{!isTripPreviewMode', markerKeyStart);
      const markerEnd = source.indexOf('key={`detour-callouts-${overlay.routeId}`}');
      const markerSource = source.slice(markerStart, markerEnd);

      expect(markerStart).toBeGreaterThanOrEqual(0);
      expect(markerKeyStart).toBeGreaterThan(markerStart);
      expect(markerEnd).toBeGreaterThan(markerStart);
      expect(
        markerSource.includes('shouldRenderDetourMapOverlays') ||
        markerSource.includes('shouldShowDetourGeometryOverlay({ isDetourView, hasDetourFocus })')
      ).toBe(true);
      expect(markerSource).toContain('getDetourGeometryOverlayProps({ overlay, isDetourView, hasDetourFocus })');
      expect(markerSource).toContain('renderMode="markers"');
    });
  });

  test('regular home map mode includes standalone MyRide closure stops lightly', () => {
    const nativeSource = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'HomeScreen.js'),
      'utf8'
    );
    const webSource = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'HomeScreen.web.impl.js'),
      'utf8'
    );

    [nativeSource, webSource].forEach((source) => {
      expect(source).toContain('includeClosures: true');
      expect(source).toContain('const closedStopMarkerOpacity = isDetourView || hasDetourFocus ? 1 : 0.58;');
    });

    expect(nativeSource).toContain('showAllStopMarkers={isDetourView || hasDetourFocus}');
    expect(nativeSource).toContain('isDetourView={isDetourView}');
    expect(nativeSource).toContain('hasDetourFocus={hasDetourFocus}');
    expect(nativeSource).toContain('isClosedStopMarker(stop)');
    expect(nativeSource).toContain('Boolean(stop?.isClosed || stop?.isRouteScopedClosure)');
    expect(nativeSource).toContain('closedStopOpacity={closedStopMarkerOpacity}');
    expect(nativeSource).toContain('showStopCode={isDetourView || hasDetourFocus}');
    expect(nativeSource).toContain('showSkippedStopCodes={isDetourView || hasDetourFocus}');
    expect(webSource).toContain('showSkippedStopCodes={isDetourView || hasDetourFocus}');
    expect(webSource).toContain('closedStopOpacity={closedStopMarkerOpacity}');

    const nativeStopPressStart = nativeSource.indexOf('const handleStopLayerPress = useCallback');
    const nativeStopPressEnd = nativeSource.indexOf('// Stable camera default settings', nativeStopPressStart);
    const nativeStopPressSource = nativeSource.slice(nativeStopPressStart, nativeStopPressEnd);
    expect(nativeStopPressStart).toBeGreaterThanOrEqual(0);
    expect(nativeStopPressEnd).toBeGreaterThan(nativeStopPressStart);
    expect(nativeStopPressSource).toContain('setSelectedStop(buildDetourStopNotice({');
    expect(nativeStopPressSource).toContain('transitNewsImpacts,');
    expect(nativeStopPressSource).toContain('officialServiceImpacts: visibleOfficialServiceImpacts,');
    expect(nativeStopPressSource).toContain('}, [displayedStopsById, transitNewsImpacts, visibleOfficialServiceImpacts]);');
  });

  test('detour map tab turns the regular stops toggle off by default', () => {
    const nativeSource = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'HomeScreen.js'),
      'utf8'
    );
    const webSource = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'HomeScreen.web.impl.js'),
      'utf8'
    );

    [nativeSource, webSource].forEach((source) => {
      const handlerStart = source.indexOf('const handleMapViewModeChange = useCallback');
      const handlerEnd = source.indexOf('useEffect(() => {', handlerStart);
      const handlerSource = source.slice(handlerStart, handlerEnd);

      expect(handlerStart).toBeGreaterThanOrEqual(0);
      expect(handlerEnd).toBeGreaterThan(handlerStart);
      expect(handlerSource).toContain("if (nextMode === 'detour')");
      expect(handlerSource).toContain('setShowStops(false);');
    });
  });

  test('Android home fleet uses one batched MapLibre source', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'components', 'home-map', 'HomeMapVehicleLayer.js'),
      'utf8'
    );

    expect(source).toContain('<MapLibreGL.Animated.ShapeSource');
    expect(source).toContain('useAnimatedHomeVehicleShape');
    expect(source).toContain('clusterMaxZoomLevel={HOME_MAP_THEME.vehicleClusterMaxZoom}');
    expect(source).toContain("textFont: ['Noto Sans Bold']");
    expect(source).toContain('id="home-live-vehicle-direction"');
    expect(source).toContain('aboveLayerID="home-live-vehicle-labels"');
    expect(source).not.toContain('layerIndex={727}');
    expect(source).toContain('textOffset: [0, -1.45]');
    expect(source).toContain('const isVehicleFullyOpaque = useCallback');
    expect(source).toContain('hasDetourFocus && isRouteInSameDetourFamily(focusedDetourRouteId, vehicle.routeId)');
    expect(source).toContain('isVehicleFullyOpaque,');
    expect(source).not.toContain('<MapLibreGL.MarkerView');
  });

  test('Android pauses live vehicle paints while the rider manipulates the map', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'HomeScreen.js'),
      'utf8'
    );

    expect(source).toContain('setMapGestureActivity(true);');
    expect(source).toContain('setMapGestureActivity(false);');
    expect(source).toContain('animationActive={isFocused && !isMapGestureActive}');
    expect(source).toContain('prev.animationActive === next.animationActive');
  });

  test('Android home-fleet path does not resolve a route snap path for every vehicle', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'HomeScreen.js'),
      'utf8'
    );

    const androidBranchStart = source.indexOf("if (Platform.OS === 'android')", source.indexOf('const HomeMapVehiclesLayer = React.memo'));
    const androidBranchEnd = source.indexOf('\n  return displayedVehicles.map((vehicle) => {', androidBranchStart);
    const androidBranchSource = source.slice(androidBranchStart, androidBranchEnd);

    expect(androidBranchStart).toBeGreaterThanOrEqual(0);
    expect(androidBranchEnd).toBeGreaterThan(androidBranchStart);
    expect(androidBranchSource).toContain('<HomeMapVehicleLayer');
    expect(androidBranchSource).not.toContain('getVehicleSnapPath');
  });
});
