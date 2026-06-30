global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  ScrollView: ({ children }) => require('react').createElement('ScrollView', null, children),
  Animated: {
    Value: jest.fn(() => ({
      interpolate: jest.fn(() => 0),
    })),
    View: 'Animated.View',
    spring: jest.fn(() => ({ start: jest.fn((callback) => callback?.()) })),
    timing: jest.fn(() => ({ start: jest.fn((callback) => callback?.()) })),
  },
  StyleSheet: { create: (styles) => styles },
  Linking: { openURL: jest.fn() },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef(({ children, ...props }, ref) => {
      React.useImperativeHandle(ref, () => ({ snapToIndex: jest.fn() }));
      return React.createElement('BottomSheet', props, children);
    }),
    BottomSheetScrollView: ({ children, ...props }) => React.createElement('BottomSheetScrollView', props, children),
  };
});

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('../components/Icon', () => 'Icon');
jest.mock('../components/DetourImpactSummary', () => 'DetourImpactSummary');

const DetourDetailsSheet = require('../components/DetourDetailsSheet').default;
const DetourDetailsSheetWeb = require('../components/DetourDetailsSheet.web').default;

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children);
};

const flattenStyles = (style) => {
  if (!Array.isArray(style)) return style ? [style] : [];
  return style.flatMap(flattenStyles);
};

describe('DetourDetailsSheet MyRide timing', () => {
  let dateNowSpy;

  beforeEach(() => {
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-05-15T12:00:00Z'));
  });

  afterEach(() => {
    dateNowSpy?.mockRestore();
  });

  test('shows parsed MyRide end date for a clicked detour segment', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(DetourDetailsSheet, {
        routeId: '12',
        detour: {
          routeId: '12',
          state: 'active',
          detectedAt: Date.parse('2026-05-14T12:00:00Z'),
          noticeStopImpactSourceNewsIds: ['route-12-detour'],
        },
        transitNews: [{
          id: 'route-12-detour',
          title: 'Route 12 detour',
          body: 'Route 12 will be on detour from May 10 to May 20, 2026.',
          affectedRoutes: ['12'],
          url: 'https://www.myridebarrie.ca/News/route-12-detour/',
          publishedAt: Date.parse('2026-05-01T12:00:00Z'),
        }],
        onClose: jest.fn(),
      }));
    });

    const texts = inst.root.findAllByType('Text').flatMap((node) => collectText(node));
    expect(texts).toContain('MyRide timing');
    expect(texts).toContain('Started: ');
    expect(texts).toContain('Expected end date: May 20, 2026');
    expect(texts).toContain('Route 12 detour');
  });

  test('says detour end date is not listed when MyRide has no end date', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(DetourDetailsSheet, {
        routeId: '8',
        detour: {
          routeId: '8',
          state: 'active',
          detectedAt: Date.parse('2026-05-14T12:00:00Z'),
          noticeStopImpactSourceNewsIds: ['route-8-detour'],
        },
        transitNews: [{
          id: 'route-8-detour',
          title: 'Route 8 detour',
          body: 'Route 8 is on detour beginning May 10 until construction is complete.',
          affectedRoutes: ['8'],
          publishedAt: Date.parse('2026-05-01T12:00:00Z'),
        }],
        onClose: jest.fn(),
      }));
    });

    const texts = inst.root.findAllByType('Text').flatMap((node) => collectText(node));
    expect(texts).toContain('MyRide timing');
    expect(texts).toContain('Detour end date is not listed.');
  });

  test('labels detector-only detours as unplanned with unknown end time', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(DetourDetailsSheet, {
        routeId: '12B',
        detour: { routeId: '12B', state: 'active', detectedAt: Date.parse('2026-05-14T12:00:00Z') },
        transitNews: [],
        onClose: jest.fn(),
      }));
    });

    const texts = inst.root.findAllByType('Text').flatMap((node) => collectText(node));
    expect(texts).toContain('Unplanned detour');
    expect(texts).toContain('Started: ');
    expect(texts).toContain('End time unknown.');
    expect(texts).not.toContain('MyRide timing');
  });

  test('keeps upcoming same-route notices separate from an active unplanned detour', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(DetourDetailsSheet, {
        routeId: '8',
        detour: { routeId: '8', state: 'active', detectedAt: Date.parse('2026-05-14T12:00:00Z') },
        transitNews: [{
          id: 'route-8-upcoming',
          title: 'Route 8 planned detour',
          body: 'Route 8 will be on detour on May 27, 2026.',
          affectedRoutes: ['8'],
          publishedAt: Date.parse('2026-05-01T12:00:00Z'),
        }],
        onClose: jest.fn(),
      }));
    });

    const texts = inst.root.findAllByType('Text').flatMap((node) => collectText(node));
    expect(texts).toContain('Unplanned detour');
    expect(texts).toContain('End time unknown.');
    expect(texts).not.toContain('MyRide timing');
    expect(texts).not.toContain('Route 8 planned detour');
  });

  test('native detour details open at half height with an expand affordance', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(DetourDetailsSheet, {
        routeId: '11',
        detour: { routeId: '11', state: 'active', detectedAt: Date.parse('2026-05-14T12:00:00Z') },
        transitNews: [],
        onClose: jest.fn(),
      }));
    });

    const sheet = inst.root.findByType('BottomSheet');
    const texts = inst.root.findAllByType('Text').flatMap((node) => collectText(node));

    expect(sheet.props.index).toBe(0);
    expect(sheet.props.snapPoints).toEqual(['22.5%', '78%']);
    expect(texts).toContain('More details');
    expect(inst.root.findByProps({ accessibilityLabel: 'Expand detour details' })).toBeDefined();
  });

  test('web detour details start half-height and can expand for more details', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(DetourDetailsSheetWeb, {
        routeId: '11',
        detour: { routeId: '11', state: 'active', detectedAt: Date.parse('2026-05-14T12:00:00Z') },
        transitNews: [],
        onClose: jest.fn(),
      }));
    });

    let sheet = inst.root.findByType('Animated.View');
    let styles = flattenStyles(sheet.props.style);

    expect(styles).toEqual(expect.arrayContaining([expect.objectContaining({ maxHeight: '39%' })]));
    expect(inst.root.findAllByType('Text').flatMap((node) => collectText(node))).toContain('More details');

    const expand = inst.root.findByProps({ accessibilityLabel: 'Expand detour details' });
    act(() => expand.props.onPress());

    sheet = inst.root.findByType('Animated.View');
    styles = flattenStyles(sheet.props.style);
    expect(styles).toEqual(expect.arrayContaining([expect.objectContaining({ maxHeight: '78%' })]));
    expect(inst.root.findAllByType('Text').flatMap((node) => collectText(node))).toContain('Show less');
  });

  test('uses the supplied route color for branch route badges', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(DetourDetailsSheet, {
        routeId: '12B',
        routeColor: '#E91E63',
        detour: { routeId: '12B', state: 'active', detectedAt: Date.parse('2026-05-14T12:00:00Z') },
        transitNews: [],
        onClose: jest.fn(),
      }));
    });

    const routeBadge = inst.root.findAllByType('View').find((node) => (
      Array.isArray(node.props.style) &&
      node.props.style.some((style) => style?.backgroundColor === '#E91E63')
    ));
    expect(routeBadge).toBeDefined();
  });

  test('uses event context for a location-first title and impacted route chips', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(DetourDetailsSheet, {
        routeId: '12A',
        routeColor: '#F39AC2',
        detour: { routeId: '12A', state: 'active', detectedAt: Date.parse('2026-05-14T12:00:00Z') },
        detourEvent: {
          title: 'Saunders & Welham',
          routeIds: ['12A', '12B'],
        },
        routeColorByRouteId: {
          '12A': '#F39AC2',
          '12B': '#F39AC2',
        },
        transitNews: [],
        onClose: jest.fn(),
      }));
    });

    const texts = inst.root.findAllByType('Text').flatMap((node) => collectText(node));
    expect(texts).toContain('Saunders & Welham');
    expect(texts).toContain('12A');
    expect(texts).toContain('12B');
    expect(texts).not.toContain('Route 12A - Detour Active');

    const impactSummary = inst.root.findByType('DetourImpactSummary');
    expect(impactSummary.props.routeLabel).toBe('Routes 12A/12B');
  });

  test('lets riders drill from an event to one route and back out', () => {
    const onSelectEventRoute = jest.fn();
    const onShowEvent = jest.fn();
    const onShowAllDetours = jest.fn();
    let inst;

    act(() => {
      inst = create(React.createElement(DetourDetailsSheet, {
        routeId: '12A',
        routeColor: '#F39AC2',
        detour: { routeId: '12A', state: 'active', detectedAt: Date.parse('2026-05-14T12:00:00Z') },
        detourEvent: {
          title: 'Saunders & Welham',
          routeIds: ['12A', '12B'],
        },
        detourExplorerLevel: 'route',
        selectedEventRouteId: '12A',
        routeColorByRouteId: {
          '12A': '#F39AC2',
          '12B': '#F39AC2',
        },
        transitNews: [],
        onClose: jest.fn(),
        onSelectEventRoute,
        onShowEvent,
        onShowAllDetours,
      }));
    });

    const selectRoute12B = inst.root.findByProps({ accessibilityLabel: 'Show Route 12B detour only' });
    act(() => selectRoute12B.props.onPress());
    expect(onSelectEventRoute).toHaveBeenCalledWith('12B');

    const showEvent = inst.root.findByProps({ accessibilityLabel: 'Show all routes in this detour event' });
    act(() => showEvent.props.onPress());
    expect(onShowEvent).toHaveBeenCalledTimes(1);

    const showAll = inst.root.findByProps({ accessibilityLabel: 'Show all active detours' });
    act(() => showAll.props.onPress());
    expect(onShowAllDetours).toHaveBeenCalledTimes(1);
  });

  test('lets riders return from a selected route detour to all detours', () => {
    const onShowAllDetours = jest.fn();
    let inst;

    act(() => {
      inst = create(React.createElement(DetourDetailsSheet, {
        routeId: '11',
        detour: { routeId: '11', state: 'active', detectedAt: Date.parse('2026-05-14T12:00:00Z') },
        transitNews: [],
        onClose: jest.fn(),
        onShowAllDetours,
      }));
    });

    const texts = inst.root.findAllByType('Text').flatMap((node) => collectText(node));
    expect(texts).toContain('Selected: Route 11');
    expect(texts).toContain('View all');

    const showAll = inst.root.findByProps({ accessibilityLabel: 'Show all active detours' });
    act(() => showAll.props.onPress());
    expect(onShowAllDetours).toHaveBeenCalledTimes(1);
  });

  test('web lets riders return from a selected route detour to all detours', () => {
    const onShowAllDetours = jest.fn();
    let inst;

    act(() => {
      inst = create(React.createElement(DetourDetailsSheetWeb, {
        routeId: '11',
        detour: { routeId: '11', state: 'active', detectedAt: Date.parse('2026-05-14T12:00:00Z') },
        transitNews: [],
        onClose: jest.fn(),
        onShowAllDetours,
      }));
    });

    const texts = inst.root.findAllByType('Text').flatMap((node) => collectText(node));
    expect(texts).toContain('Selected: Route 11');
    expect(texts).toContain('View all');

    const showAll = inst.root.findByProps({ accessibilityLabel: 'Show all active detours' });
    act(() => showAll.props.onPress());
    expect(onShowAllDetours).toHaveBeenCalledTimes(1);
  });

  test('shows a clear hint that highlighted route lines remain tappable', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(DetourDetailsSheet, {
        routeId: '11',
        detour: { routeId: '11', state: 'active', detectedAt: Date.parse('2026-05-14T12:00:00Z') },
        transitNews: [],
        onClose: jest.fn(),
      }));
    });

    const texts = inst.root.findAllByType('Text').flatMap((node) => collectText(node));
    expect(texts).toContain('Map tip');
    expect(texts).toContain('Tap or click a highlighted route line on the map to open that route’s detour details.');
  });

  test('web details card does not block map route clicks behind the sheet', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(DetourDetailsSheetWeb, {
        routeId: '11',
        detour: { routeId: '11', state: 'active', detectedAt: Date.parse('2026-05-14T12:00:00Z') },
        transitNews: [],
        onClose: jest.fn(),
      }));
    });

    const closeButtons = inst.root.findAllByProps({ accessibilityLabel: 'Close detour details' });
    const backdrop = inst.root.findAllByType('View').find((node) => node.props.style?.zIndex === 999);
    const texts = inst.root.findAllByType('Text').flatMap((node) => collectText(node));

    expect(closeButtons).toHaveLength(1);
    expect(backdrop.props.pointerEvents).toBe('none');
    expect(texts).toContain('Tap or click a highlighted route line on the map to open that route’s detour details.');
  });
});
