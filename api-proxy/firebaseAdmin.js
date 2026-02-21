const admin = require('firebase-admin');

let db = null;
let initialized = false;

function initFirebase() {
  if (initialized) return;
  initialized = true;

  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    } else {
      console.warn('[firebaseAdmin] No Firebase credentials configured — Firestore publishing disabled');
      return;
    }
    db = admin.firestore();
  } catch (err) {
    console.error('[firebaseAdmin] Initialization failed:', err.message);
  }
}

function getDb() {
  if (!initialized) initFirebase();
  return db;
}

module.exports = { getDb };
