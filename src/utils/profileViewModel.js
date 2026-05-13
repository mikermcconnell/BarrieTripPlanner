const asList = (value) => (Array.isArray(value) ? value : []);

const cleanText = (value) => String(value || '').trim();

export const buildProfileAccountViewModel = ({ isAuthenticated, user } = {}) => {
  if (!isAuthenticated) {
    return {
      state: 'signed-out',
      eyebrow: "You're not signed in",
      title: 'Sign in to save your transit',
      subtitle: 'Save places, trips, stops, and routes across devices.',
    };
  }

  const displayName = cleanText(user?.displayName);
  const email = cleanText(user?.email);
  const primaryIdentity = displayName || email || 'Signed in';
  const secondaryIdentity = displayName && email ? email : null;
  const avatarSource = displayName || email;

  return {
    state: 'signed-in',
    eyebrow: 'Signed in as',
    primaryIdentity,
    secondaryIdentity,
    helperText: 'Your saved transit syncs to this account.',
    avatarInitial: cleanText(avatarSource).charAt(0).toUpperCase() || null,
  };
};

export const buildProfileStatsViewModel = ({
  isAuthenticated,
  favorites = {},
  tripHistory = [],
  savedPlaces = [],
  savedTrips = [],
} = {}) => {
  if (!isAuthenticated) {
    return { shouldRender: false, isEmpty: true, stats: [] };
  }

  const favoriteStops = asList(favorites.stops);
  const favoriteRoutes = asList(favorites.routes);
  const places = asList(savedPlaces);
  const trips = asList(savedTrips);
  const history = asList(tripHistory);

  const stats = [
    { id: 'places', value: places.length, label: 'Places' },
    { id: 'trips', value: trips.length + history.length, label: 'Trips' },
    { id: 'stops', value: favoriteStops.length, label: 'Stops' },
    { id: 'routes', value: favoriteRoutes.length, label: 'Routes' },
  ];

  return {
    shouldRender: true,
    isEmpty: stats.every((stat) => stat.value === 0),
    stats,
  };
};

export const formatSavedTransitSummary = ({
  savedPlaces = [],
  savedTrips = [],
  favoriteStops = [],
  favoriteRoutes = [],
} = {}) => {
  const total = asList(savedPlaces).length +
    asList(savedTrips).length +
    asList(favoriteStops).length +
    asList(favoriteRoutes).length;

  if (total === 0) return 'No saved transit yet';
  if (total === 1) return '1 saved item';
  return `${total} saved items`;
};
