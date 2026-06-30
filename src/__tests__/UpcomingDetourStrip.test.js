global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

const mockOpenURL = jest.fn(() => Promise.resolve());

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: {
    create: (styles) => styles,
    hairlineWidth: 1,
  },
  Linking: { openURL: mockOpenURL },
}));

const {
  buildUpcomingDetourHeadline,
  getUpcomingDetourRouteColor,
  default: UpcomingDetourStrip,
} = require('../components/UpcomingDetourStrip');

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children);
};

const normalizeText = (value) => String(value)
  .replace(/\u00A0/g, ' ')
  .replace(/\u2060/g, '');

describe('UpcomingDetourStrip', () => {
  beforeEach(() => {
    mockOpenURL.mockClear();
  });

  test('renders only upcoming detour headlines in the callout', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(UpcomingDetourStrip, {
        inline: true,
        autoHideMs: 0,
        routeColorByRouteId: {
          '8A': '#E91E63',
          '8B': '#E91E63',
        },
        notices: [
          {
            id: '1646',
            title: 'Downtown Paving Detour - Routes 8A-NB, 8B-SB, 10, 11, 100 & 101',
            routes: ['8A', '8B', '10', '11', '100', '101'],
            startsText: 'May 19, 2026',
            endsText: 'Jun 12, 2026',
          },
          {
            id: '1648',
            title: 'Lakeshore Fun Run Detour - Route 8A-NB',
            routes: ['8A'],
            startsText: 'May 27, 2026',
            endsText: 'May 27, 2026',
            locationText: 'Lakeshore Drive',
            url: 'https://www.myridebarrie.ca/news/1648',
          },
        ],
      }));
    });

    const text = normalizeText(inst.root.findAllByType('Text').flatMap((node) => collectText(node)).join(' '));
    expect(text).toContain('2 upcoming detours');
    expect(text).toContain('Downtown Paving Detour · May 19–Jun 12');
    expect(text).toContain('Lakeshore Fun Run Detour · May 27');
    expect(text).toContain('8A');
    expect(text).toContain('8B');
    expect(text).not.toContain('Scheduled notices');
    expect(text).not.toContain('Location from notice');
    expect(text).not.toContain('8A-NB');
    expect(text).not.toContain('8B-SB');
  });

  test('opens the MyRide notice when a notice row is pressed', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(UpcomingDetourStrip, {
        inline: true,
        autoHideMs: 0,
        notices: [{
          id: '1646',
          title: 'Downtown Paving Detour',
          routes: ['10'],
          startsText: 'May 19, 2026',
          url: 'https://www.myridebarrie.ca/news/1646',
        }],
      }));
    });

    const row = inst.root.findAllByType('TouchableOpacity').find((node) =>
      String(node.props.accessibilityLabel || '').startsWith('Open ')
    );
    act(() => {
      row.props.onPress();
    });

    expect(mockOpenURL).toHaveBeenCalledWith('https://www.myridebarrie.ca/news/1646');
  });

  test('can be collapsed manually and expanded again', () => {
    const onCollapsedChange = jest.fn();
    let inst;
    act(() => {
      inst = create(React.createElement(UpcomingDetourStrip, {
        inline: true,
        autoHideMs: 0,
        onCollapsedChange,
        notices: [{
          id: '1646',
          title: 'Downtown Paving Detour',
          routes: ['10'],
          startsText: 'May 19, 2026',
        }],
      }));
    });

    const dismiss = inst.root.findAllByType('TouchableOpacity').find((node) =>
      node.props.accessibilityLabel === 'Hide upcoming detours'
    );
    act(() => {
      dismiss.props.onPress();
    });

    expect(onCollapsedChange).toHaveBeenCalledWith(true);
    let text = normalizeText(inst.root.findAllByType('Text').flatMap((node) => collectText(node)).join(' '));
    expect(text).toContain('1 upcoming detour');
    expect(text).toContain('Expand');
    expect(text).not.toContain('Downtown Paving Detour');

    const expand = inst.root.findAllByType('TouchableOpacity').find((node) =>
      node.props.accessibilityLabel === 'Expand upcoming detours'
    );
    act(() => {
      expand.props.onPress();
    });

    expect(onCollapsedChange).toHaveBeenCalledWith(false);
    text = normalizeText(inst.root.findAllByType('Text').flatMap((node) => collectText(node)).join(' '));
    expect(text).toContain('Downtown Paving Detour');
  });

  test('can be dismissed while collapsed', () => {
    const onDismiss = jest.fn();
    let inst;
    act(() => {
      inst = create(React.createElement(UpcomingDetourStrip, {
        inline: true,
        autoHideMs: 0,
        collapsedByDefault: true,
        onDismiss,
        notices: [{
          id: '1646',
          title: 'Downtown Paving Detour',
          routes: ['10'],
          startsText: 'May 19, 2026',
        }],
      }));
    });

    const dismiss = inst.root.findAllByType('TouchableOpacity').find((node) =>
      node.props.accessibilityLabel === 'Hide upcoming detour notice'
    );
    act(() => {
      dismiss.props.onPress();
    });

    expect(onDismiss).toHaveBeenCalledWith([expect.objectContaining({ id: '1646' })]);
  });

  test('auto-collapses after the configured delay', () => {
    jest.useFakeTimers();
    let inst;
    act(() => {
      inst = create(React.createElement(UpcomingDetourStrip, {
        inline: true,
        autoHideMs: 10000,
        notices: [{
          id: '1646',
          title: 'Downtown Paving Detour',
          routes: ['10'],
          startsText: 'May 19, 2026',
        }],
      }));
    });

    expect(inst.toJSON()).not.toBeNull();

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    const text = normalizeText(inst.root.findAllByType('Text').flatMap((node) => collectText(node)).join(' '));
    expect(text).toContain('Expand');
    expect(text).not.toContain('Downtown Paving Detour');
    jest.useRealTimers();
  });

  test('adds date to the headline while routes stay in circle icons', () => {
    expect(buildUpcomingDetourHeadline({
      title: 'Lakeshore Detour',
      routes: ['8A'],
      startsText: 'May 27, 2026',
      endsText: 'May 27, 2026',
    })).toBe('Lakeshore Detour · May\u00A027');
  });

  test('removes direction-suffixed route text from the visible headline', () => {
    expect(buildUpcomingDetourHeadline({
      title: 'Lakeshore Fun Run Detour - Route 8A-NB',
      routes: ['8A'],
      startsText: 'May 27, 2026',
      endsText: 'May 27, 2026',
    })).toBe('Lakeshore Fun Run Detour · May\u00A027');
  });

  test('uses the route family/root line color for route circles', () => {
    expect(getUpcomingDetourRouteColor('12B', {
      '12': '#F39AC2',
      '12B': '#F39AC2',
    })).toBe('#F39AC2');
    expect(getUpcomingDetourRouteColor('8A', {})).toBe('#E91E63');
  });
});
