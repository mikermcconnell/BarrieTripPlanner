global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  Modal: 'Modal',
  StyleSheet: { create: (styles) => styles },
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  View: 'View',
}));

const TimePicker = require('../components/TimePicker').default;

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children);
};

const buttonByText = (root, text) => root
  .findAllByType('TouchableOpacity')
  .find((node) => collectText(node).join('').includes(text));

describe('TimePicker future date selection', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-03T09:00:00-04:00'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('lets riders choose a future calendar day beyond tomorrow while preserving the selected time', () => {
    const onChange = jest.fn();
    let instance;

    act(() => {
      instance = create(
        React.createElement(TimePicker, {
          value: new Date('2026-05-03T14:35:00-04:00'),
          mode: 'depart',
          onChange,
        })
      );
    });

    const dateButton = instance.root
      .findAllByType('TouchableOpacity')
      .find((node) => collectText(node).join('').includes('Choose date'));

    expect(dateButton).toBeTruthy();

    act(() => {
      dateButton.props.onPress();
    });

    const futureDay = instance.root
      .findAllByType('TouchableOpacity')
      .find((node) => node.props.accessibilityLabel === 'Select Wednesday, May 6');

    expect(futureDay).toBeTruthy();

    act(() => {
      futureDay.props.onPress();
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        getFullYear: expect.any(Function),
      }),
      'depart'
    );

    const selected = onChange.mock.calls[0][0];
    expect(selected.getFullYear()).toBe(2026);
    expect(selected.getMonth()).toBe(4);
    expect(selected.getDate()).toBe(6);
    expect(selected.getHours()).toBe(14);
    expect(selected.getMinutes()).toBe(35);
  });

  test('quick offset chips keep adding to the selected depart-at time', () => {
    const onChange = jest.fn();
    let selectedTime = new Date('2026-05-03T09:00:00-04:00');
    let instance;

    const render = () => React.createElement(TimePicker, {
      value: selectedTime,
      mode: 'depart',
      onChange,
    });

    act(() => {
      instance = create(render());
    });

    act(() => {
      buttonByText(instance.root, '+15m').props.onPress();
    });
    selectedTime = onChange.mock.calls[0][0];
    act(() => {
      instance.update(render());
    });

    act(() => {
      buttonByText(instance.root, '+15m').props.onPress();
    });

    const secondSelection = onChange.mock.calls[1][0];
    expect(secondSelection.getHours()).toBe(9);
    expect(secondSelection.getMinutes()).toBe(30);
  });

  test('quick offset chips are available for arrive-by time and add to the selected time', () => {
    const onChange = jest.fn();
    let instance;

    act(() => {
      instance = create(
        React.createElement(TimePicker, {
          value: new Date('2026-05-03T09:00:00-04:00'),
          mode: 'arrive',
          onChange,
        })
      );
    });

    const plus30 = buttonByText(instance.root, '+30m');
    expect(plus30).toBeTruthy();

    act(() => {
      plus30.props.onPress();
    });

    const selected = onChange.mock.calls[0][0];
    expect(onChange.mock.calls[0][1]).toBe('arrive');
    expect(selected.getHours()).toBe(9);
    expect(selected.getMinutes()).toBe(30);
  });
});
