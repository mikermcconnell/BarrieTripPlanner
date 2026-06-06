global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Image: {
    resolveAssetSource: () => ({ uri: 'test-file-stub' }),
  },
}));

const { __TEST_ONLY__ } = require('../components/WebMapView');

const createMockMap = () => {
  const handlers = {};
  const canvas = { style: { cursor: '' } };
  const map = {
    getLayer: jest.fn(() => ({ id: 'fill-layer' })),
    getCanvas: jest.fn(() => canvas),
    moveLayer: jest.fn(),
    on: jest.fn((event, layerId, handler) => {
      handlers[event] = handler;
    }),
    off: jest.fn(),
  };

  return { map, handlers, canvas };
};

describe('WebMapView layer events', () => {
  test('uses callbacksRef handlers for line layers and cleans up listeners', () => {
    // Arrange
    const { map, handlers, canvas } = createMockMap();
    const callbacksRef = {
      current: {
        onClick: jest.fn(),
        onMouseOver: jest.fn(),
        onMouseOut: jest.fn(),
      },
    };

    // Act
    const cleanup = __TEST_ONLY__.applyLayerEvents({
      map,
      layerId: 'fill-layer',
      interactive: true,
      callbacksRef,
    });
    handlers.click();
    handlers.mouseenter();
    handlers.mouseleave();
    cleanup();

    // Assert
    expect(callbacksRef.current.onClick).toHaveBeenCalledTimes(1);
    expect(callbacksRef.current.onMouseOver).toHaveBeenCalledTimes(1);
    expect(callbacksRef.current.onMouseOut).toHaveBeenCalledTimes(1);
    expect(canvas.style.cursor).toBe('');
    expect(map.off).toHaveBeenCalledWith('click', 'fill-layer', handlers.click);
    expect(map.off).toHaveBeenCalledWith('mouseenter', 'fill-layer', handlers.mouseenter);
    expect(map.off).toHaveBeenCalledWith('mouseleave', 'fill-layer', handlers.mouseleave);
  });

  test('supports direct callbacks for polygon callers', () => {
    // Arrange
    const { map, handlers } = createMockMap();
    const onClick = jest.fn();

    // Act
    __TEST_ONLY__.applyLayerEvents({
      map,
      layerId: 'fill-layer',
      interactive: true,
      onClick,
    });
    handlers.click();

    // Assert
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('returns a no-op cleanup when layer is not interactive', () => {
    // Arrange
    const { map } = createMockMap();

    // Act
    const cleanup = __TEST_ONLY__.applyLayerEvents({
      map,
      layerId: 'fill-layer',
      interactive: false,
      onClick: jest.fn(),
    });
    cleanup();

    // Assert
    expect(map.on).not.toHaveBeenCalled();
    expect(map.off).not.toHaveBeenCalled();
  });
});

describe('WebMapView ordered line layers', () => {
  test('keeps detoured route layers above lower-priority context routes even when context mounts later', () => {
    const { map } = createMockMap();

    __TEST_ONLY__.registerOrderedMapLayers({
      map,
      registryKey: 'route-11',
      layerOrder: 180,
      layerIds: ['route-11-outline', 'route-11-fill'],
    });
    map.moveLayer.mockClear();

    __TEST_ONLY__.registerOrderedMapLayers({
      map,
      registryKey: 'route-10',
      layerOrder: 90,
      layerIds: ['route-10-outline', 'route-10-fill'],
    });

    expect(map.moveLayer.mock.calls.map((call) => call[0])).toEqual([
      'route-10-outline',
      'route-10-fill',
      'route-11-outline',
      'route-11-fill',
    ]);
  });
});


describe('WebMapView keyboard controls', () => {
  const createKeyboardEvent = (key, target = { tagName: 'div' }) => ({
    key,
    target,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
  });

  test('pans the map with arrow keys and marks it as user interaction', () => {
    const map = {
      stop: jest.fn(),
      panBy: jest.fn(),
    };
    const onUserInteraction = jest.fn();
    const event = createKeyboardEvent('ArrowRight');

    const handled = __TEST_ONLY__.handleWebMapKeyboardPan({ map, event, onUserInteraction });

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(map.stop).toHaveBeenCalledTimes(1);
    expect(map.panBy).toHaveBeenCalledWith([140, 0], { duration: 220 });
    expect(onUserInteraction).toHaveBeenCalledTimes(1);
  });

  test('zooms with plus and minus keys', () => {
    const map = {
      stop: jest.fn(),
      zoomIn: jest.fn(),
      zoomOut: jest.fn(),
    };

    __TEST_ONLY__.handleWebMapKeyboardPan({ map, event: createKeyboardEvent('+') });
    __TEST_ONLY__.handleWebMapKeyboardPan({ map, event: createKeyboardEvent('-') });

    expect(map.zoomIn).toHaveBeenCalledWith({ duration: 220 });
    expect(map.zoomOut).toHaveBeenCalledWith({ duration: 220 });
  });

  test('does not intercept typing in text fields', () => {
    const map = {
      stop: jest.fn(),
      panBy: jest.fn(),
    };
    const event = createKeyboardEvent('ArrowDown', { tagName: 'input' });

    const handled = __TEST_ONLY__.handleWebMapKeyboardPan({ map, event });

    expect(handled).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(map.panBy).not.toHaveBeenCalled();
  });
});

describe('WebMapView bus marker HTML', () => {
  test('uses route bus-marker artwork on web when an asset exists', () => {
    const html = __TEST_ONLY__.createBusHtml('#0C8CE5', '8', Number.NaN);

    expect(html).toContain('data-live-bus-marker="image"');
    expect(html).toContain('width:46px;height:46px');
    expect(html).toContain('data-live-bus-artwork="true"');
    expect(html).toContain('src="test-file-stub"');
    expect(html).not.toContain('data-live-bus-marker="generated"');
  });

  test('falls back to a generated bus badge with a bus glyph for routes without artwork', () => {
    const html = __TEST_ONLY__.createBusHtml('#C6E51A', '12B', Number.NaN);

    expect(html).toContain('data-live-bus-marker="generated"');
    expect(html).toContain('width:44px;height:44px');
    expect(html).toContain('data-live-bus-glyph="true"');
    expect(html).toContain('12B');
    expect(html).not.toContain('data-live-bus-artwork="true"');
  });

  test('uses a black rim tab with white outline when bearing is valid', () => {
    const html = __TEST_ONLY__.createBusHtml('#0C8CE5', '8A', 45);

    expect(html).toContain('width="104" height="104"');
    expect(html).toContain('top:-29px;left:-29px');
    expect(html).toContain('rotate(45, 52, 52)');
    expect(html).toContain('z-index:3');
    expect(html).toContain('data-heading-tab="true"');
    expect(html).toContain('d="M52 8 L42 30 L49 30 L49 34 L55 34 L55 30 L62 30 Z"');
    expect(html).toContain('d="M52 12 L46 28 L50 28 L50 30 L54 30 L54 28 L58 28 Z"');
    expect(html).toContain('fill="#111111"');
    expect(html).not.toContain('fill="#0C8CE5"');
    expect(html).toContain('fill="rgba(255,255,255,0.96)"');
  });

  test('omits the direction arrow when bearing is invalid', () => {
    const html = __TEST_ONLY__.createBusHtml('#0C8CE5', '8A', Number.NaN);

    expect(html).not.toContain('rotate(');
  });
});

describe('WebMapView bus hub marker HTML', () => {
  test('renders a simple major hub circle with a readable hub label', () => {
    const html = __TEST_ONLY__.createBusHubHtml({
      label: 'Downtown Hub',
      hubType: 'major',
    });

    expect(html).toContain('data-bus-hub-icon="true"');
    expect(html).toContain('Downtown Hub');
    expect(html).toContain('data-bus-hub-major-circle="true"');
    expect(html).toContain('background:#0C8CE5');
    expect(html).toContain('border:2px solid #FFFFFF');
    expect(html).not.toContain('src="test-file-stub"');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('HUB</text>');
    expect(html).toContain('text-shadow');
    expect(html).toContain('width:21px;height:21px');
    expect(html).toContain('height:21px');
    expect(html).toContain('position:absolute');
    expect(html).toContain('top:22px');
    expect(html).not.toContain('min-height:132px');
    expect(html).toContain('font:800 11px/1.2 Avenir, Arial, sans-serif');
    expect(html).not.toContain('transform:scale(0.5)');
  });

  test('renders a simple minor hub circle 25 percent smaller than major hubs', () => {
    const html = __TEST_ONLY__.createBusHubHtml({
      label: 'RVH',
      hubType: 'minor',
    });

    expect(html).toContain('data-bus-hub-minor-circle="true"');
    expect(html).toContain('RVH');
    expect(html).toContain('width:15.75px;height:15.75px');
    expect(html).toContain('border:2px solid #FFFFFF');
    expect(html).toContain('top:16.75px');
    expect(html).not.toContain('src="test-file-stub"');
    expect(html).not.toContain('<img');
  });
});
