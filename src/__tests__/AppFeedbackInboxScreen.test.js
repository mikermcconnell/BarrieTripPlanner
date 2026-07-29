const React = require('react');
const { act, create } = require('react-test-renderer');

const mockGetAccess = jest.fn();
const mockList = jest.fn();
const mockRemove = jest.fn();
const mockUpdateStatus = jest.fn();
const mockAlert = jest.fn();

jest.mock('react-native', () => {
  const ReactForMock = require('react');
  return {
    ActivityIndicator: 'ActivityIndicator',
    Alert: { alert: (...args) => mockAlert(...args) },
    Dimensions: { get: () => ({ height: 844, width: 390 }) },
    FlatList: ({ data = [], renderItem, ListEmptyComponent, ListFooterComponent, ...props }) => ReactForMock.createElement(
      'FlatList',
      props,
      data.length ? data.map((item, index) => ReactForMock.createElement(
        ReactForMock.Fragment,
        { key: item.id },
        renderItem({ item, index })
      )) : ListEmptyComponent,
      ListFooterComponent
    ),
    Platform: { OS: 'android' },
    StyleSheet: { create: (styles) => styles },
    Text: 'Text',
    TouchableOpacity: 'TouchableOpacity',
    useWindowDimensions: () => ({ height: 844, width: 390 }),
    View: 'View',
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));

jest.mock('../services/appFeedbackService', () => ({
  appFeedbackService: {
    getAccess: (...args) => mockGetAccess(...args),
    list: (...args) => mockList(...args),
    remove: (...args) => mockRemove(...args),
    updateStatus: (...args) => mockUpdateStatus(...args),
  },
}));

const AppFeedbackInboxScreen = require('../screens/AppFeedbackInboxScreen').default;

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children ?? node.children);
};

const findButton = (root, label) => root.findAllByType('TouchableOpacity')
  .find((node) => collectText(node).join(' ').includes(label));

describe('AppFeedbackInboxScreen', () => {
  beforeEach(() => {
    mockGetAccess.mockReset().mockResolvedValue({ canManage: true });
    mockList.mockReset().mockResolvedValue({ feedback: [], nextCursor: null });
    mockRemove.mockReset().mockResolvedValue({ ok: true });
    mockUpdateStatus.mockReset();
    mockAlert.mockReset();
  });

  test('loads filtered pages and appends older feedback', async () => {
    mockList
      .mockResolvedValueOnce({
        feedback: [{ id: 'feedback-2', category: 'bug', message: 'Newest open report', status: 'new', createdAt: 2 }],
        nextCursor: 'feedback-2',
      })
      .mockResolvedValueOnce({
        feedback: [{ id: 'feedback-1', category: 'idea', message: 'Older open report', status: 'reviewed', createdAt: 1 }],
        nextCursor: null,
      });

    let instance;
    await act(async () => {
      instance = create(React.createElement(AppFeedbackInboxScreen, { navigation: { goBack: jest.fn() } }));
      await Promise.resolve();
    });
    expect(mockList).toHaveBeenCalledWith({ limit: 50, status: 'open', cursor: null });
    expect(collectText(instance.toJSON())).toContain('Newest open report');

    await act(async () => findButton(instance.root, 'Load more').props.onPress());
    expect(mockList).toHaveBeenLastCalledWith({ limit: 50, status: 'open', cursor: 'feedback-2' });
    expect(collectText(instance.toJSON())).toEqual(expect.arrayContaining(['Newest open report', 'Older open report']));
  });

  test('shows a persistent error state instead of an empty inbox', async () => {
    mockGetAccess.mockRejectedValueOnce(new Error('Developer access is required.'));
    let instance;
    await act(async () => {
      instance = create(React.createElement(AppFeedbackInboxScreen, { navigation: { goBack: jest.fn() } }));
      await Promise.resolve();
    });
    const text = collectText(instance.toJSON());
    expect(text).toContain('Feedback unavailable');
    expect(text).toContain('Developer access is required.');
    expect(text).not.toContain('No feedback in this view.');
  });

  test('permanently deletes resolved feedback after confirmation', async () => {
    mockList
      .mockResolvedValueOnce({ feedback: [], nextCursor: null })
      .mockResolvedValueOnce({
        feedback: [{ id: 'feedback-1', category: 'bug', message: 'Resolved report', status: 'resolved', createdAt: 1 }],
        nextCursor: null,
      });
    let instance;
    await act(async () => {
      instance = create(React.createElement(AppFeedbackInboxScreen, { navigation: { goBack: jest.fn() } }));
      await Promise.resolve();
    });
    await act(async () => findButton(instance.root, 'Resolved').props.onPress());
    await act(async () => { await Promise.resolve(); });
    act(() => findButton(instance.root, 'Delete').props.onPress());
    const confirm = mockAlert.mock.calls[0][2].find((button) => button.text === 'Delete');
    await act(async () => confirm.onPress());
    expect(mockRemove).toHaveBeenCalledWith('feedback-1');
    expect(collectText(instance.toJSON())).not.toContain('Resolved report');
  });
});
