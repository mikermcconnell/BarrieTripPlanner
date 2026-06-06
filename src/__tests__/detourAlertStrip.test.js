global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: {
    create: (styles) => styles,
    hairlineWidth: 1,
  },
  Platform: { OS: 'ios' },
  UIManager: {},
  LayoutAnimation: {
    configureNext: jest.fn(),
    Presets: { easeInEaseOut: 'easeInEaseOut' },
  },
}));

jest.mock('../components/Icon', () => 'Icon');

const DetourAlertStrip = require('../components/DetourAlertStrip').default;

describe('DetourAlertStrip', () => {
  test('opens details directly when the collapsed banner has one detour', () => {
    const onPress = jest.fn();
    let inst;

    act(() => {
      inst = create(React.createElement(DetourAlertStrip, {
        activeDetours: {
          '8A': { state: 'active', confidence: 'high' },
        },
        routes: [{ id: '8A', shortName: '8A' }],
        onPress,
      }));
    });

    const collapsedButton = inst.root.findAllByType('TouchableOpacity')[0];
    act(() => {
      collapsedButton.props.onPress();
    });

    expect(onPress).toHaveBeenCalledWith('8A', expect.objectContaining({
      primaryRouteId: '8A',
      title: 'Route 8 detour',
    }));
  });

  test('does not render low-confidence detours', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(DetourAlertStrip, {
        activeDetours: {
          '8A': { state: 'active', confidence: 'low' },
        },
        routes: [{ id: '8A', shortName: '8A' }],
        onPress: jest.fn(),
      }));
    });

    expect(inst.toJSON()).toBeNull();
  });

  test('renders medium-confidence detours under a location-focused summary', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(DetourAlertStrip, {
        activeDetours: {
          '8A': {
            state: 'active',
            confidence: 'medium',
            vehicleCount: 2,
            title: 'Sophia Street Detour - Route 8A',
          },
        },
        routes: [{ id: '8A', shortName: '8A' }],
        onPress: jest.fn(),
      }));
    });

    const textValues = inst.root.findAllByType('Text').map((node) => node.props.children);
    expect(textValues).toContain('Active detour: Sophia Street');
  });

  test('collapses route variants into one location-focused event row', () => {
    const onPress = jest.fn();
    let inst;

    act(() => {
      inst = create(React.createElement(DetourAlertStrip, {
        activeDetours: {
          '12A': {
            state: 'active',
            confidence: 'medium',
            vehicleCount: 2,
            title: 'Saunders/Welham Detour - Route 12',
            description: 'Saunders Road and Welham Road intersection closure.',
          },
          '12B': {
            state: 'active',
            confidence: 'medium',
            vehicleCount: 2,
            title: 'Saunders/Welham Detour - Route 12',
            description: 'Saunders Road and Welham Road intersection closure.',
          },
        },
        routes: [
          { id: '12A', shortName: '12A' },
          { id: '12B', shortName: '12B' },
        ],
        onPress,
      }));
    });

    const textValues = inst.root.findAllByType('Text').map((node) => node.props.children);
    expect(textValues).toContain('Active detour: Saunders & Welham');

    const collapsedButton = inst.root.findAllByType('TouchableOpacity')[0];
    act(() => {
      collapsedButton.props.onPress();
    });

    expect(onPress).toHaveBeenCalledWith('12A', expect.objectContaining({
      title: 'Saunders & Welham',
      routeIds: ['12A', '12B'],
      primarySegmentIndex: null,
    }));

    act(() => {
      inst.unmount();
    });
  });

  test('uses active-detour wording for high-confidence detours', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(DetourAlertStrip, {
        activeDetours: {
          '1': { state: 'active', confidence: 'high' },
        },
        routes: [{ id: '1', shortName: '1' }],
        onPress: jest.fn(),
      }));
    });

    const textValues = inst.root.findAllByType('Text').map((node) => node.props.children);
    expect(textValues).toContain('Active detour: Route 1 detour');
  });

  test('shows stop codes in active detour location summaries', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(DetourAlertStrip, {
        activeDetours: {
          '10': {
            state: 'active',
            confidence: 'high',
            segments: [{
              skippedStopCodes: ['946'],
              likelyDetourRoadNames: ['Mulcaster Street', 'McDonald Street'],
            }],
          },
        },
        routes: [{ id: '10', shortName: '10' }],
        onPress: jest.fn(),
      }));
    });

    const textValues = inst.root.findAllByType('Text').map((node) => node.props.children);
    expect(textValues).toContain('Active detour: Mulcaster & McDonald · Stop #946');
  });

  test('shows individual route circles in the inline collapsed active-detour bar', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(DetourAlertStrip, {
        activeDetours: {
          '12A': {
            state: 'active',
            confidence: 'high',
            sharedDetourEventId: 'route-12-saunders',
            configuredCorridorLabel: 'Saunders-Welham',
            segments: [{
              sharedDetourEventId: 'route-12-saunders',
              configuredCorridorLabel: 'Saunders-Welham',
              skippedStopCodes: ['933', '756'],
              likelyDetourRoadNames: ['Hooper Road'],
            }],
          },
          '12B': {
            state: 'active',
            confidence: 'high',
            sharedDetourEventId: 'route-12-saunders',
            configuredCorridorLabel: 'Saunders-Welham',
            segments: [{
              sharedDetourEventId: 'route-12-saunders',
              configuredCorridorLabel: 'Saunders-Welham',
              skippedStopCodes: ['618', '931'],
              likelyDetourRoadNames: ['Hooper Road'],
            }],
          },
        },
        routes: [
          { id: '12A', shortName: '12A' },
          { id: '12B', shortName: '12B' },
        ],
        onPress: jest.fn(),
        inline: true,
      }));
    });

    const textValues = inst.root.findAllByType('Text').map((node) => node.props.children);
    expect(textValues).toContain('12A');
    expect(textValues).toContain('12B');
    expect(textValues.some((value) => String(value).startsWith('Active detour: Saunders & Welham'))).toBe(true);
  });

  test('expanded detour rows show a numbered card and route summary', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(DetourAlertStrip, {
        activeDetours: {
          '10': {
            state: 'active',
            confidence: 'high',
            sharedDetourEventId: 'downtown',
            segments: [{
              sharedDetourEventId: 'downtown',
              likelyDetourRoadNames: ['Mulcaster Street', 'Simcoe Street'],
            }],
          },
          '11': {
            state: 'active',
            confidence: 'high',
            sharedDetourEventId: 'downtown',
            segments: [{
              sharedDetourEventId: 'downtown',
              likelyDetourRoadNames: ['Mulcaster Street', 'Simcoe Street'],
            }],
          },
          '101': {
            state: 'active',
            confidence: 'high',
            sharedDetourEventId: 'downtown',
            segments: [{
              sharedDetourEventId: 'downtown',
              likelyDetourRoadNames: ['Mulcaster Street', 'Simcoe Street'],
            }],
          },
          '12A': {
            state: 'active',
            confidence: 'high',
            title: 'Hooper Road detour',
          },
        },
        routes: [
          { id: '10', shortName: '10' },
          { id: '11', shortName: '11' },
          { id: '101', shortName: '101' },
          { id: '12A', shortName: '12A' },
        ],
        onPress: jest.fn(),
      }));
    });

    const collapsedButton = inst.root.findAllByType('TouchableOpacity')[0];
    act(() => {
      collapsedButton.props.onPress();
    });

    const textValues = inst.root.findAllByType('Text').map((node) => node.props.children);
    expect(textValues).toContain(1);
    expect(textValues).toContain('Active detour');
    expect(textValues).toContain('10');
    expect(textValues).toContain('11');
    expect(textValues).toContain('101');
    expect(textValues).toContain('Tap or click a highlighted route line on the map for details.');

    const titleText = inst.root.findAllByType('Text')
      .find((node) => node.props.children === 'Mulcaster & Simcoe');
    expect(titleText.props.numberOfLines).toBe(2);

    const detailRow = inst.root.findAllByType('TouchableOpacity')
      .find((node) => String(node.props.accessibilityLabel || '').includes('Mulcaster & Simcoe'));
    expect(detailRow.props.accessibilityLabel).toContain('Routes 10, 11, 101');

    act(() => {
      inst.unmount();
    });
  });
});
