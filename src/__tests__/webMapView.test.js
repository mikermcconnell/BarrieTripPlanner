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

describe('WebMapView bus marker HTML', () => {
  test('uses a black rim tab with white outline when bearing is valid', () => {
    const html = __TEST_ONLY__.createBusHtml('#0C8CE5', '8A', 45);

    expect(html).toContain('width="104" height="104"');
    expect(html).toContain('top:-8px;left:-8px');
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
  test('renders a cartoon bus icon with a readable hub label', () => {
    const html = __TEST_ONLY__.createBusHubHtml({
      label: 'Downtown Hub',
      hubType: 'major',
    });

    expect(html).toContain('data-bus-hub-icon="true"');
    expect(html).toContain('Downtown Hub');
    expect(html).toContain('src="test-file-stub"');
    expect(html).toContain('data-bus-hub-artwork="true"');
    expect(html).toContain('<img');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('HUB</text>');
    expect(html).toContain('text-shadow');
    expect(html).toContain('width:27px;height:27px');
    expect(html).toContain('margin-top:1px');
    expect(html).toContain('font:800 11px/1.2 Avenir, Arial, sans-serif');
    expect(html).not.toContain('transform:scale(0.5)');
  });
});
