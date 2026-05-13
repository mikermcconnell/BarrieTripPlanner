const {
  buildProfileAccountViewModel,
  buildProfileStatsViewModel,
  formatSavedTransitSummary,
} = require('../utils/profileViewModel');

describe('profileViewModel', () => {
  test('labels the active signed-in account with name, email, and sync context', () => {
    const account = buildProfileAccountViewModel({
      isAuthenticated: true,
      user: { displayName: 'Mike McConnell', email: 'mike@example.com' },
    });

    expect(account).toEqual({
      state: 'signed-in',
      eyebrow: 'Signed in as',
      primaryIdentity: 'Mike McConnell',
      secondaryIdentity: 'mike@example.com',
      helperText: 'Your saved transit syncs to this account.',
      avatarInitial: 'M',
    });
  });

  test('uses email as the primary identity when the signed-in account has no display name', () => {
    const account = buildProfileAccountViewModel({
      isAuthenticated: true,
      user: { displayName: '', email: 'mike@example.com' },
    });

    expect(account.primaryIdentity).toBe('mike@example.com');
    expect(account.secondaryIdentity).toBeNull();
    expect(account.avatarInitial).toBe('M');
  });

  test('clearly explains the signed-out state and why signing in helps', () => {
    const account = buildProfileAccountViewModel({ isAuthenticated: false, user: null });

    expect(account).toMatchObject({
      state: 'signed-out',
      eyebrow: "You're not signed in",
      title: 'Sign in to save your transit',
      subtitle: 'Save places, trips, stops, and routes across devices.',
    });
  });

  test('hides empty stats for signed-out users instead of showing a generic start-exploring card', () => {
    const stats = buildProfileStatsViewModel({
      isAuthenticated: false,
      favorites: { stops: [], routes: [] },
      tripHistory: [],
      savedPlaces: [],
      savedTrips: [],
    });

    expect(stats.shouldRender).toBe(false);
  });

  test('summarizes saved transit with one short count for the menu row', () => {
    expect(formatSavedTransitSummary({ savedPlaces: [1, 2], savedTrips: [1], favoriteStops: [1], favoriteRoutes: [] }))
      .toBe('4 saved items');
    expect(formatSavedTransitSummary({ savedPlaces: [], savedTrips: [], favoriteStops: [], favoriteRoutes: [] }))
      .toBe('No saved transit yet');
  });
});
