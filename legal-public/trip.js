import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js';
import { doc, getFirestore, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyB4u2cJOxaqHUH6LY_yFFpQd1Tn-ET8dbs',
  authDomain: 'barrie-transit-trip-plan-cc84e.firebaseapp.com',
  projectId: 'barrie-transit-trip-plan-cc84e',
  storageBucket: 'barrie-transit-trip-plan-cc84e.firebasestorage.app',
  messagingSenderId: '648843426695',
  appId: '1:648843426695:web:14d220f26fb7001a72f122',
};

const elements = {
  loading: document.querySelector('#loading'),
  error: document.querySelector('#error'),
  errorMessage: document.querySelector('#error-message'),
  trip: document.querySelector('#trip'),
  name: document.querySelector('#trip-name'),
  from: document.querySelector('#trip-from'),
  to: document.querySelector('#trip-to'),
  updated: document.querySelector('#trip-updated'),
  openApp: document.querySelector('#open-app'),
  copyLink: document.querySelector('#copy-link'),
  copyStatus: document.querySelector('#copy-status'),
};

const showError = (message) => {
  elements.loading.hidden = true;
  elements.trip.hidden = true;
  elements.error.hidden = false;
  elements.errorMessage.textContent = message;
};

const shareId = new URLSearchParams(window.location.search).get('id') || '';
if (!/^[A-Za-z0-9_-]{20,128}$/.test(shareId)) {
  showError('This shared-trip link is incomplete or invalid.');
} else {
  elements.openApp.href = `barrie-transit://trip/${encodeURIComponent(shareId)}`;
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  onSnapshot(doc(db, 'sharedTrips', shareId), (snapshot) => {
    if (!snapshot.exists()) {
      showError('This shared trip is no longer available.');
      return;
    }

    const sharedTrip = snapshot.data();
    const trip = sharedTrip.trip || {};
    elements.name.textContent = trip.name || 'Shared trip';
    elements.from.textContent = trip.from?.name || 'Start';
    elements.to.textContent = trip.to?.name || 'Destination';
    const updatedAt = sharedTrip.updatedAt?.toDate?.();
    elements.updated.textContent = updatedAt
      ? `Updated ${updatedAt.toLocaleString()} · Version ${sharedTrip.revision || 1}`
      : `Live shared trip · Version ${sharedTrip.revision || 1}`;
    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.trip.hidden = false;
  }, () => showError('This shared trip could not be opened. Please try again.'));
}

elements.copyLink.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    elements.copyStatus.textContent = 'Edit link copied.';
  } catch {
    elements.copyStatus.textContent = 'Copy the address from your browser to share this trip.';
  }
});
