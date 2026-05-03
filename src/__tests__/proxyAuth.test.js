const loadProxyAuth = ({ currentUser = null, anonymousUser = null, signInError = null } = {}) => {
  jest.resetModules();

  const auth = { currentUser };
  const signInAnonymously = signInError
    ? jest.fn().mockRejectedValue(signInError)
    : jest.fn().mockResolvedValue({ user: anonymousUser });

  jest.doMock('../config/firebase', () => ({ auth }));
  jest.doMock('firebase/auth', () => ({ signInAnonymously }));

  const module = require('../services/proxyAuth');
  return { ...module, auth, signInAnonymously };
};

describe('proxyAuth', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('adds Firebase bearer token from the current user', async () => {
    const currentUser = {
      getIdToken: jest.fn().mockResolvedValue('signed-in-token'),
    };
    const { getApiProxyRequestOptions, signInAnonymously } = loadProxyAuth({ currentUser });

    const options = await getApiProxyRequestOptions();

    expect(signInAnonymously).not.toHaveBeenCalled();
    expect(currentUser.getIdToken).toHaveBeenCalledTimes(1);
    expect(options.headers.Authorization).toBe('Bearer signed-in-token');
  });

  test('signs in anonymously before proxy calls when no user is signed in', async () => {
    const anonymousUser = {
      getIdToken: jest.fn().mockResolvedValue('anonymous-token'),
    };
    const { getApiProxyRequestOptions, auth, signInAnonymously } = loadProxyAuth({
      anonymousUser,
    });

    const options = await getApiProxyRequestOptions();

    expect(signInAnonymously).toHaveBeenCalledWith(auth);
    expect(anonymousUser.getIdToken).toHaveBeenCalledTimes(1);
    expect(options.headers.Authorization).toBe('Bearer anonymous-token');
  });

  test('omits auth header if anonymous sign-in is unavailable', async () => {
    const { getApiProxyRequestOptions } = loadProxyAuth({
      signInError: new Error('anonymous auth disabled'),
    });

    const options = await getApiProxyRequestOptions();

    expect(options.headers.Authorization).toBeUndefined();
    expect(options.headers['x-client-id']).toBe('barrie-transit-app');
  });
});
