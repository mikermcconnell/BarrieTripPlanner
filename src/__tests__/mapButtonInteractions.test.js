global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

const callback = () => ({ start: jest.fn(), stop: jest.fn() });

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TextInput: 'TextInput',
  TouchableOpacity: 'TouchableOpacity',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  FlatList: 'FlatList',
  Modal: 'Modal',
  ActivityIndicator: 'ActivityIndicator',
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
  Platform: { OS: 'ios' },
  UIManager: {},
  LayoutAnimation: {
    configureNext: jest.fn(),
    Presets: { easeInEaseOut: 'easeInEaseOut' },
  },
  Animated: {
    View: 'Animated.View',
    Value: jest.fn(() => ({
      interpolate: jest.fn(() => 'interpolated'),
      setValue: jest.fn(),
    })),
    timing: jest.fn(callback),
    sequence: jest.fn((steps) => steps),
    loop: jest.fn(callback),
    createAnimatedComponent: (Component) => Component,
  },
  Alert: { alert: jest.fn() },
  Linking: { openURL: jest.fn() },
}));

jest.mock('expo-constants', () => ({ statusBarHeight: 24 }));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));
jest.mock('react-native-reanimated', () => ({
  createAnimatedComponent: (Component) => Component,
  useSharedValue: (value) => ({ value }),
  useAnimatedStyle: () => ({}),
  withSpring: (value) => value,
}));
jest.mock('@gorhom/bottom-sheet', () => ({
  __esModule: true,
  default: ({ children }) => require('react').createElement('BottomSheet', null, children),
  BottomSheetScrollView: ({ children }) => require('react').createElement('BottomSheetScrollView', null, children),
  BottomSheetBackdrop: () => require('react').createElement('BottomSheetBackdrop'),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../components/Icon', () => 'Icon');
jest.mock('../components/navigation/TurnIcon', () => 'TurnIcon');
jest.mock('../components/AddressAutocomplete', () => 'AddressAutocomplete');
jest.mock('../components/DetourImpactSummary', () => 'DetourImpactSummary');
jest.mock('../components/DelayBadge', () => 'DelayBadge');
jest.mock('../components/navigation/WalkingPaceIcon', () => 'WalkingPaceIcon');
jest.mock('../utils/colorUtils', () => ({
  getContrastTextColor: () => '#FFFFFF',
}));
jest.mock('../services/tripService', () => ({
  formatDuration: (seconds) => `${Math.round(seconds / 60)} min`,
  formatMinutes: (minutes) => `${minutes} min`,
  formatTimeFromTimestamp: () => '12:00 PM',
  formatDistance: (meters) => `${Math.round(meters)} m`,
}));

const HomeScreenControls = require('../components/HomeScreenControls').default;
const MapViewModeToggle = require('../components/MapViewModeToggle').default;
const TripViewportControls = require('../components/TripViewportControls').default;
const TripSearchHeader = require('../components/TripSearchHeader').default;
const TimePicker = require('../components/TimePicker').default;
const MapTapPopup = require('../components/MapTapPopup').default;
const DetourDetailsSheet = require('../components/DetourDetailsSheet').default;
const TripPreviewModal = require('../components/TripPreviewModal').default;
const TripResultCard = require('../components/TripResultCard').default;
const BusProximityCard = require('../components/navigation/BusProximityCard').default;
const NavigationHeader = require('../components/navigation/NavigationHeader').default;
const WalkingInstructionCard = require('../components/navigation/WalkingInstructionCard').default;
const PlanTripFAB = require('../components/PlanTripFAB').default;

const textOf = (node) => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return textOf(node.props?.children);
};

const render = (element) => {
  let inst;
  act(() => {
    inst = create(element);
  });
  return inst;
};

const press = (node) => {
  act(() => {
    node.props.onPress();
  });
};

const buttons = (root) => root.findAllByType('TouchableOpacity');

const buttonByLabel = (root, label) => root.findByProps({ accessibilityLabel: label });

const buttonByText = (root, label) => {
  const found = buttons(root).find((node) => textOf(node).includes(label));
  if (!found) throw new Error(`No button with text: ${label}`);
  return found;
};

const baseItinerary = {
  id: 'trip-1',
  startTime: Date.now() + 600000,
  endTime: Date.now() + 1800000,
  duration: 1200,
  walkDistance: 300,
  walkTime: 240,
  transfers: 0,
  legs: [
    { mode: 'WALK', duration: 240, distance: 300, to: { name: 'Stop A' } },
    {
      mode: 'BUS',
      duration: 900,
      route: { shortName: '8A', color: '#0066CC' },
      from: { name: 'Stop A', stopCode: '100' },
      to: { name: 'Stop B', stopCode: '200' },
      intermediateStops: [],
    },
  ],
};

describe('map and navigation button interactions', () => {
  test('main map controls call the correct callbacks', () => {
    const onRouteSelect = jest.fn();
    const onAlertPress = jest.fn();
    const onToggleZones = jest.fn();
    const onOpenFilterSheet = jest.fn();
    const selectedRoutes = new Set(['1', '2', '3', '4']);
    const routes = ['1', '2', '3', '4'].map((id) => ({ id, shortName: id }));
    const inst = render(React.createElement(HomeScreenControls, {
      routes,
      selectedRoutes,
      onRouteSelect,
      getRouteColor: () => '#0066CC',
      isRouteDetouring: (routeId) => routeId === '2',
      serviceAlerts: [{ affectedRoutes: ['1'] }],
      onAlertPress,
      showZones: false,
      onToggleZones,
      zoneCount: 2,
      onOpenFilterSheet,
      showRoutesTooltipOnOpen: false,
    }));

    press(buttons(inst.root)[0]);
    expect(onAlertPress).toHaveBeenCalled();
    press(buttonByText(inst.root, 'Zones'));
    expect(onToggleZones).toHaveBeenCalled();
    press(buttonByLabel(inst.root, 'Open route filter, 4 selected'));
    expect(onOpenFilterSheet).toHaveBeenCalled();
    const selectedRouteButton = buttons(inst.root).find((node) =>
      String(node.props.accessibilityLabel || '').startsWith('Remove route ')
    );
    press(selectedRouteButton);
    expect(onRouteSelect).toHaveBeenCalledWith(expect.any(String));
    press(buttonByLabel(inst.root, 'Open route filter, 1 more selected routes'));
    expect(onOpenFilterSheet).toHaveBeenCalledTimes(2);
    press(buttonByLabel(inst.root, 'Show all routes'));
    expect(onRouteSelect).toHaveBeenCalledWith(null);
    press(buttonByLabel(inst.root, 'Open route filter'));
    expect(onOpenFilterSheet).toHaveBeenCalledTimes(3);
  });

  test('map view mode toggle switches regular and detour modes', () => {
    const onChange = jest.fn();
    const inst = render(React.createElement(MapViewModeToggle, {
      visible: true,
      mode: 'regular',
      detourCount: 2,
      onChange,
      inline: true,
    }));

    press(buttonByLabel(inst.root, 'Switch to regular map view'));
    press(buttonByLabel(inst.root, 'Switch to detour-focused map view'));
    expect(onChange).toHaveBeenCalledWith('regular');
    expect(onChange).toHaveBeenCalledWith('detour');
  });

  test('trip preview viewport controls trigger follow, location, and full-trip actions', () => {
    const onToggleFollow = jest.fn();
    const onCenterOnUserLocation = jest.fn();
    const onShowTrip = jest.fn();
    const inst = render(React.createElement(TripViewportControls, {
      onToggleFollow,
      onCenterOnUserLocation,
      onShowTrip,
    }));

    press(buttonByLabel(inst.root, 'Follow my location'));
    press(buttonByLabel(inst.root, 'Center on my location'));
    press(buttonByLabel(inst.root, 'Show full trip on the map'));
    expect(onToggleFollow).toHaveBeenCalled();
    expect(onCenterOnUserLocation).toHaveBeenCalled();
    expect(onShowTrip).toHaveBeenCalled();
  });

  test('trip planner header buttons call their handlers', () => {
    const onClose = jest.fn();
    const onUseCurrentLocation = jest.fn();
    const onSwap = jest.fn();
    const onSearch = jest.fn();
    const inst = render(React.createElement(TripSearchHeader, {
      fromText: '',
      toText: '',
      onFromChange: jest.fn(),
      onToChange: jest.fn(),
      onFromSelect: jest.fn(),
      onToSelect: jest.fn(),
      onSwap,
      onClose,
      onUseCurrentLocation,
      showUseCurrentLocation: true,
      timeMode: 'departAt',
      selectedTime: new Date('2026-05-03T12:00:00-04:00'),
      onTimeModeChange: jest.fn(),
      onSelectedTimeChange: jest.fn(),
      onSearch,
    }));

    press(buttonByLabel(inst.root, 'Close trip planner'));
    press(buttonByLabel(inst.root, 'Use current location'));
    press(buttonByLabel(inst.root, 'Swap origin and destination'));
    press(buttonByLabel(inst.root, 'Search trips'));
    expect(onClose).toHaveBeenCalled();
    expect(onUseCurrentLocation).toHaveBeenCalled();
    expect(onSwap).toHaveBeenCalled();
    expect(onSearch).toHaveBeenCalled();
  });

  test('time picker buttons change mode, quick time, day, custom time, and date picker', () => {
    const onChange = jest.fn();
    const inst = render(React.createElement(TimePicker, {
      value: new Date('2026-05-03T12:00:00-04:00'),
      mode: 'depart',
      onChange,
    }));

    press(buttonByText(inst.root, 'Leave Now'));
    press(buttonByText(inst.root, 'Arrive By'));
    press(buttonByText(inst.root, '+15m'));
    press(buttonByText(inst.root, 'Tomorrow'));
    press(buttonByLabel(inst.root, 'Choose date'));
    press(buttonByLabel(inst.root, 'Next month'));
    press(buttonByText(inst.root, 'Cancel'));
    press(buttonByText(inst.root, 'Set time...'));
    press(buttonByText(inst.root, 'PM'));
    press(buttonByText(inst.root, 'Done'));

    expect(onChange).toHaveBeenCalled();
  });

  test('map tap popup action buttons work', () => {
    const onClose = jest.fn();
    const onDirectionsFrom = jest.fn();
    const onDirectionsTo = jest.fn();
    const inst = render(React.createElement(MapTapPopup, {
      visible: true,
      coordinate: { latitude: 44.4, longitude: -79.7 },
      address: 'Selected address',
      onClose,
      onDirectionsFrom,
      onDirectionsTo,
    }));

    press(buttonByText(inst.root, '✕'));
    press(buttonByText(inst.root, 'Directions from here'));
    press(buttonByText(inst.root, 'Directions to here'));
    expect(onClose).toHaveBeenCalled();
    expect(onDirectionsFrom).toHaveBeenCalled();
    expect(onDirectionsTo).toHaveBeenCalled();
  });

  test('detour details sheet close and view-on-map buttons work', () => {
    const onClose = jest.fn();
    const onViewOnMap = jest.fn();
    const inst = render(React.createElement(DetourDetailsSheet, {
      routeId: '8A',
      detour: { state: 'active', confidence: 'high', detectedAt: Date.now() },
      segmentStopDetails: [],
      onClose,
      onViewOnMap,
    }));

    press(buttonByLabel(inst.root, 'Close detour details'));
    press(buttonByLabel(inst.root, 'View detour on map'));
    expect(onClose).toHaveBeenCalled();
    expect(onViewOnMap).toHaveBeenCalled();
  });

  test('unused trip preview modal buttons are wired if the modal is used later', () => {
    const onClose = jest.fn();
    const onViewFullDetails = jest.fn();
    const onStartNavigation = jest.fn();
    const inst = render(React.createElement(TripPreviewModal, {
      visible: true,
      itinerary: baseItinerary,
      onClose,
      onViewFullDetails,
      onStartNavigation,
    }));

    press(buttonByText(inst.root, '✕'));
    press(buttonByText(inst.root, 'View Full Details'));
    press(buttonByText(inst.root, 'Start Navigation'));
    expect(onClose).toHaveBeenCalled();
    expect(onViewFullDetails).toHaveBeenCalled();
    expect(onStartNavigation).toHaveBeenCalled();
  });

  test('trip result cards select, show details, and start navigation', () => {
    const onPress = jest.fn();
    const onViewDetails = jest.fn();
    const onStartNavigation = jest.fn();
    const unselected = render(React.createElement(TripResultCard, {
      itinerary: baseItinerary,
      isSelected: false,
      onPress,
      onViewDetails,
      onStartNavigation,
    }));
    press(buttons(unselected.root)[0]);
    expect(onPress).toHaveBeenCalled();

    const selected = render(React.createElement(TripResultCard, {
      itinerary: baseItinerary,
      isSelected: true,
      onPress,
      onViewDetails,
      onStartNavigation,
    }));
    press(buttonByLabel(selected.root, 'View trip details'));
    press(buttonByLabel(selected.root, 'Start navigation'));
    expect(onViewDetails).toHaveBeenCalledWith(baseItinerary);
    expect(onStartNavigation).toHaveBeenCalledWith(baseItinerary);
  });

  test('navigation header close button works', () => {
    const onClose = jest.fn();
    const inst = render(React.createElement(NavigationHeader, {
      instruction: 'Head to the stop',
      navigationState: { type: 'walking', label: 'Destination' },
      currentLegIndex: 0,
      totalLegs: 2,
      onClose,
      destinationName: 'Downtown',
      totalDistanceRemaining: 500,
      currentMode: 'WALK',
    }));

    press(buttons(inst.root)[0]);
    expect(onClose).toHaveBeenCalled();
  });

  test('walking step controls expand, show details, advance, and handle warning actions', () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-05-03T12:00:00Z').getTime());
    const onNextLeg = jest.fn();
    const onFindNextTrip = jest.fn();
    const inst = render(React.createElement(WalkingInstructionCard, {
      currentStep: { type: 'depart', instruction: 'Start walking' },
      currentLeg: {
        mode: 'WALK',
        duration: 300,
        distance: 350,
        to: { name: 'Mapleview Stop', stopCode: '1234' },
        steps: [
          { instruction: 'Start walking', distance: 100 },
          { instruction: 'Turn right', distance: 80 },
        ],
      },
      destinationName: 'Mapleview Stop',
      nextTransitLeg: { startTime: Date.now() - 60000 },
      nextTransitProximity: { isRealtime: true, boardingBusStatus: 'likely_departed' },
      paceStatus: { level: 'late', headline: 'Behind pace', detail: 'The bus may leave soon.' },
      onNextLeg,
      onFindNextTrip,
    }));

    press(buttonByLabel(inst.root, 'Find next trip'));
    press(buttonByLabel(inst.root, 'Keep watching'));
    press(buttonByLabel(inst.root, 'Expand walking instructions'));
    press(buttonByLabel(inst.root, 'Minimize walking instructions'));
    press(buttonByLabel(inst.root, 'Expand walking instructions'));
    press(buttonByLabel(inst.root, 'Show walking details'));
    press(buttonByLabel(inst.root, 'I’m at the stop'));
    expect(onFindNextTrip).toHaveBeenCalled();
    expect(onNextLeg).toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  test('transit step boarding and alighting buttons work', () => {
    const onBoardBus = jest.fn();
    const board = render(React.createElement(BusProximityCard, {
      routeShortName: '8A',
      routeColor: '#0066CC',
      stopsAway: 0,
      estimatedArrival: 0,
      hasArrived: true,
      isTracking: true,
      headsign: 'Downtown',
      onBoardBus,
    }));
    press(buttonByText(board.root, "I'm on the bus"));
    expect(onBoardBus).toHaveBeenCalled();

    const onAlightBus = jest.fn();
    const alight = render(React.createElement(BusProximityCard, {
      routeShortName: '8A',
      routeColor: '#0066CC',
      stopsUntilAlighting: 0,
      estimatedArrival: 0,
      hasArrived: false,
      isTracking: true,
      isOnBoard: true,
      shouldGetOff: true,
      onAlightBus,
    }));
    press(buttonByText(alight.root, "I've exited"));
    expect(onAlightBus).toHaveBeenCalled();
  });

  test('plan trip floating button works', () => {
    const onPlanTrip = jest.fn();
    const inst = render(React.createElement(PlanTripFAB, { onPlanTrip }));
    press(buttonByLabel(inst.root, 'Plan manually'));
    expect(onPlanTrip).toHaveBeenCalled();
  });
});
