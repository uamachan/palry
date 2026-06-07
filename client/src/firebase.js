import { initializeApp } from 'firebase/app';
import { browserSessionPersistence, getAuth, setPersistence } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const hasFirebaseConfig = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);

export const firebaseApp = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;

export const firebaseReady = firebaseAuth
  ? setPersistence(firebaseAuth, browserSessionPersistence).then(() => true).catch((error) => {
      console.warn('[firebase] Failed to set auth persistence:', error);
      return true;
    })
  : Promise.resolve(false);
