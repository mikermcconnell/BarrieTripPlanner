const {
  buildSubscriberIndex,
  resolveRecipients,
} = require('../pushNotifier');

describe('pushNotifier quiet notification policy', () => {
  test('route-scoped news only notifies users subscribed to the affected route', () => {
    const users = [
      { pushToken: 'token-all', subscribedRoutes: [], transitNewsEnabled: true },
      { pushToken: 'token-8', subscribedRoutes: ['8'], transitNewsEnabled: true },
      { pushToken: 'token-1', subscribedRoutes: ['1'], transitNewsEnabled: true },
    ];

    const index = buildSubscriberIndex(users);
    const recipients = resolveRecipients(
      { affectedRoutes: ['8'], affectsAllRoutes: false },
      index
    );

    expect([...recipients]).toEqual(['token-8']);
  });

  test('system-wide news can notify every user who opted into transit news', () => {
    const users = [
      { pushToken: 'token-all', subscribedRoutes: [], transitNewsEnabled: true },
      { pushToken: 'token-8', subscribedRoutes: ['8'], transitNewsEnabled: true },
      { pushToken: 'token-off', subscribedRoutes: ['8'], transitNewsEnabled: false },
    ];

    const index = buildSubscriberIndex(users);
    const recipients = resolveRecipients(
      { affectedRoutes: [], affectsAllRoutes: true },
      index
    );

    expect([...recipients].sort()).toEqual(['token-8', 'token-all']);
  });

  test('general news without an all-routes flag does not generate a push', () => {
    const users = [
      { pushToken: 'token-all', subscribedRoutes: [], transitNewsEnabled: true },
      { pushToken: 'token-8', subscribedRoutes: ['8'], transitNewsEnabled: true },
    ];

    const index = buildSubscriberIndex(users);
    const recipients = resolveRecipients(
      { affectedRoutes: [], affectsAllRoutes: false },
      index
    );

    expect([...recipients]).toEqual([]);
  });
});
