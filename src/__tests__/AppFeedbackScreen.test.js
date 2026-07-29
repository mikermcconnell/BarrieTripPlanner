const React = require('react');
const { act, create } = require('react-test-renderer');

const mockSubmit = jest.fn();
const mockAlert = jest.fn();
const mockGoBack = jest.fn();

jest.mock('react-native', () => ({
  Alert: { alert: (...args) => mockAlert(...args) },
  Dimensions: { get: () => ({ height: 844, width: 390 }) },
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: { OS: 'android' },
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles) => styles },
  Text: 'Text',
  TextInput: 'TextInput',
  TouchableOpacity: 'TouchableOpacity',
  useWindowDimensions: () => ({ height: 844, width: 390 }),
  View: 'View',
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));

jest.mock('../services/appFeedbackService', () => ({
  appFeedbackService: {
    createSubmissionId: () => 'feedback-submission-test-id',
    submit: (...args) => mockSubmit(...args),
  },
}));

const AppFeedbackScreen = require('../screens/AppFeedbackScreen').default;

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children);
};

const getRenderedText = (instance) => instance.root.findAllByType('Text').flatMap(collectText).join('');

describe('AppFeedbackScreen', () => {
  beforeEach(() => {
    mockSubmit.mockReset().mockResolvedValue({ ok: true });
    mockAlert.mockReset();
    mockGoBack.mockReset();
  });

  test('shows the minimum countdown and maximum while controlling submission', () => {
    let instance;
    act(() => {
      instance = create(React.createElement(AppFeedbackScreen, {
        navigation: { goBack: mockGoBack },
        route: { params: { source: 'profile' } },
      }));
    });

    const sendButton = instance.root.findAllByType('TouchableOpacity')
      .find((node) => collectText(node).includes('Send feedback'));
    expect(sendButton.props.disabled).toBe(true);
    expect(getRenderedText(instance)).toContain('10 more characters needed • ');
    expect(getRenderedText(instance)).toContain('0/2,000 maximum');

    act(() => instance.root.findByType('TextInput').props.onChangeText('Test'));
    expect(instance.root.findAllByType('TouchableOpacity')
      .find((node) => collectText(node).includes('Send feedback')).props.disabled).toBe(true);
    expect(getRenderedText(instance)).toContain('6 more characters needed • ');
    expect(getRenderedText(instance)).toContain('4/2,000 maximum');

    act(() => instance.root.findByType('TextInput').props.onChangeText('Test input'));
    expect(instance.root.findAllByType('TouchableOpacity')
      .find((node) => collectText(node).includes('Send feedback')).props.disabled).toBe(false);
    expect(getRenderedText(instance)).toContain('Minimum met • ');
    expect(getRenderedText(instance)).toContain('10/2,000 maximum');
  });

  test('submits through the private service and shows confirmation', async () => {
    let instance;
    await act(async () => {
      instance = create(React.createElement(AppFeedbackScreen, {
        navigation: { goBack: mockGoBack },
        route: { params: { source: 'help_support' } },
      }));
    });
    act(() => instance.root.findByType('TextInput').props.onChangeText('The arrivals panel closed unexpectedly.'));
    const sendButton = instance.root.findAllByType('TouchableOpacity')
      .find((node) => collectText(node).includes('Send feedback'));

    await act(async () => sendButton.props.onPress());

    expect(mockSubmit).toHaveBeenCalledWith({
      category: 'bug',
      message: 'The arrivals panel closed unexpectedly.',
      source: 'help_support',
      submissionId: 'feedback-submission-test-id',
    });
    expect(mockAlert).toHaveBeenCalledWith(
      'Feedback received',
      'Thank you. Your feedback was sent privately to the app developer.',
      expect.any(Array)
    );
  });
});
