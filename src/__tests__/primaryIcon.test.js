global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Circle: 'Circle',
  Path: 'Path',
}));

const PrimaryIcon = require('../components/PrimaryIcon').default;

describe('PrimaryIcon', () => {
  test.each(['Map', 'Search', 'User'])('renders the flat %s icon', (name) => {
    let instance;
    act(() => {
      instance = create(React.createElement(PrimaryIcon, { name, size: 26, color: '#0C8CE5' }));
    });

    const svg = instance.root.findByType('Svg');
    const path = instance.root.findByType('Path');
    expect(svg.props.width).toBe(26);
    expect(path.props.stroke).toBe('#0C8CE5');
    expect(path.props.fill).toBeUndefined();
  });

  test('returns no icon for unknown names', () => {
    let instance;
    act(() => {
      instance = create(React.createElement(PrimaryIcon, { name: 'Unknown' }));
    });
    expect(instance.toJSON()).toBeNull();
  });
});
