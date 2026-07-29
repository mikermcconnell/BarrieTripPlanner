const express = require('express');
const request = require('supertest');
const { registerAccountRoutes } = require('../routes/accountRoutes');

function buildApp({ decoded, verifyError, deleteError, now = 1_800_000_000_000 } = {}) {
  const verifyIdToken = verifyError
    ? jest.fn().mockRejectedValue(verifyError)
    : jest.fn().mockResolvedValue(decoded || { uid: 'user-123', auth_time: Math.floor(now / 1000) - 60 });
  const deleteUser = deleteError
    ? jest.fn().mockRejectedValue(deleteError)
    : jest.fn().mockResolvedValue(undefined);
  const userRef = { path: 'users/user-123' };
  const doc = jest.fn(() => userRef);
  const collection = jest.fn(() => ({ doc }));
  const recursiveDelete = jest.fn().mockResolvedValue(undefined);
  const app = express();
  registerAccountRoutes(app, {
    authProvider: () => ({ verifyIdToken, deleteUser }),
    dbProvider: () => ({ collection, recursiveDelete }),
    now: () => now,
  });
  return { app, verifyIdToken, deleteUser, collection, doc, recursiveDelete, userRef };
}

describe('account deletion route', () => {
  test('requires a Firebase bearer token', async () => {
    const { app, verifyIdToken } = buildApp();
    const response = await request(app).delete('/api/account');
    expect(response.status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  test('rejects a valid but stale sign-in', async () => {
    const now = 1_800_000_000_000;
    const { app, recursiveDelete, deleteUser } = buildApp({
      now,
      decoded: { uid: 'user-123', auth_time: Math.floor(now / 1000) - 301 },
    });
    const response = await request(app).delete('/api/account').set('Authorization', 'Bearer token');
    expect(response.status).toBe(401);
    expect(recursiveDelete).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  test('rejects a token without a valid recent-authentication time', async () => {
    const { app, recursiveDelete, deleteUser } = buildApp({
      decoded: { uid: 'user-123', auth_time: 'not-a-timestamp' },
    });
    const response = await request(app).delete('/api/account').set('Authorization', 'Bearer token');
    expect(response.status).toBe(401);
    expect(recursiveDelete).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  test('derives the target UID from the verified token and deletes data before Auth', async () => {
    const { app, verifyIdToken, deleteUser, collection, doc, recursiveDelete, userRef } = buildApp();
    const response = await request(app).delete('/api/account').set('Authorization', 'Bearer token');
    expect(response.status).toBe(204);
    expect(verifyIdToken).toHaveBeenCalledWith('token', true);
    expect(collection).toHaveBeenCalledWith('users');
    expect(doc).toHaveBeenCalledWith('user-123');
    expect(recursiveDelete).toHaveBeenCalledWith(userRef);
    expect(deleteUser).toHaveBeenCalledWith('user-123');
    expect(recursiveDelete.mock.invocationCallOrder[0]).toBeLessThan(deleteUser.mock.invocationCallOrder[0]);
  });

  test('does not delete Auth when application-data deletion fails', async () => {
    const setup = buildApp();
    setup.recursiveDelete.mockRejectedValue(new Error('firestore unavailable'));
    const response = await request(setup.app).delete('/api/account').set('Authorization', 'Bearer token');
    expect(response.status).toBe(500);
    expect(setup.deleteUser).not.toHaveBeenCalled();
  });
});
