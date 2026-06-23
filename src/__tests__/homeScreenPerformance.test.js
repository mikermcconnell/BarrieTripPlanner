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

    const androidBusStart = homeSource.indexOf('const AndroidLiveBusMarker = React.memo');
    const androidBusEnd = homeSource.indexOf('const HomeMapVehiclesLayer = React.memo', androidBusStart);
    const androidBusSource = homeSource.slice(androidBusStart, androidBusEnd);

    expect(routeLabelsSource).toContain('pointerEvents="none"');
    expect(androidBusSource).toContain('pointerEvents="none"');
    expect(busHubSource).toContain('pointerEvents="none"');
  });

  test('detour decorative marker views allow map gestures through', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'components', 'DetourOverlay.js'),
      'utf8'
    );

    expect(source).toContain('key={`detour-direction-arrow-${routeId}-${index}-${arrow.direction}-${arrowIndex}`}');
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

  test('Android home-fleet bus markers use lightweight animation without route snapping', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'HomeScreen.js'),
      'utf8'
    );

    const componentStart = source.indexOf('const AndroidLiveBusMarker = React.memo');
    const componentEnd = source.indexOf('const HomeMapVehiclesLayer = React.memo');
    const componentSource = source.slice(componentStart, componentEnd);

    expect(componentStart).toBeGreaterThanOrEqual(0);
    expect(componentEnd).toBeGreaterThan(componentStart);
    expect(componentSource).toContain('useAnimatedBusPosition(vehicle');
    expect(componentSource).toContain('snapPath: null');
  });

  test('Android home-fleet bus markers do not resolve route snap paths for every vehicle', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'HomeScreen.js'),
      'utf8'
    );

    const androidBranchStart = source.indexOf("if (Platform.OS === 'android')", source.indexOf('const HomeMapVehiclesLayer = React.memo'));
    const androidBranchMatch = source.slice(androidBranchStart).match(
      /if \(Platform\.OS === 'android'\) \{[\s\S]*?\n\s{2}\}\r?\n\r?\n\s{2}return displayedVehicles\.map\(\(vehicle\) => \{/
    );
    const androidBranchEnd = androidBranchMatch
      ? androidBranchStart + androidBranchMatch[0].length
      : -1;
    const androidBranchSource = source.slice(androidBranchStart, androidBranchEnd);

    expect(androidBranchStart).toBeGreaterThanOrEqual(0);
    expect(androidBranchEnd).toBeGreaterThan(androidBranchStart);
    expect(androidBranchSource).not.toContain('getVehicleSnapPath');
  });
});
