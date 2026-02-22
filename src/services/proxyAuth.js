const CLIENT_ID = 'barrie-transit-app';
const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;
const IS_TEST = process.env.NODE_ENV === 'test';

async function getFirebaseIdToken() {
  let firebaseAuth = null;
  try {
    ({ auth: firebaseAuth } = require('../config/firebase'));
  } catch {
    return '';
  }

  const currentUser = firebaseAuth?.currentUser;
  if (!currentUser || typeof currentUser.getIdToken !== 'function') {
    return '';
  }

  try {
    return await currentUser.getIdToken();
  } catch {
    return '';
  }
}

export async function getApiProxyRequestOptions(proxyToken = '') {
  const headers = {
    'x-client-id': CLIENT_ID,
  };

  // Shared proxy tokens are only allowed during development/testing.
  if ((IS_DEV || IS_TEST) && proxyToken) {
    headers['x-api-token'] = proxyToken;
  }

  const idToken = await getFirebaseIdToken();
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  return { headers };
}
