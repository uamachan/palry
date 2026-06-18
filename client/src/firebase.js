import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { browserSessionPersistence, connectAuthEmulator, getAuth, setPersistence } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const requiredConfig = {
  VITE_FIREBASE_API_KEY: firebaseConfig.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: firebaseConfig.authDomain,
  VITE_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
  VITE_FIREBASE_APP_ID: firebaseConfig.appId
};

const missingConfigKeys = Object.entries(requiredConfig)
  .filter(([, value]) => !String(value || '').trim())
  .map(([key]) => key);

function firebaseConfigError() {
  return new Error(
    missingConfigKeys.length
      ? `Firebase設定が不足しています: ${missingConfigKeys.join(', ')}。RenderのEnvironmentにFirebase Web Appの値を設定して再デプロイしてください。`
      : 'Firebaseの初期化に失敗しました。Firebase設定を確認してください。'
  );
}

let app = null;
let auth = null;
let appCheck = null;

if (missingConfigKeys.length) {
  console.warn('[firebase] Missing Firebase config:', missingConfigKeys.join(', '));
} else {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
  } catch (error) {
    console.error('[firebase] Failed to initialize Firebase:', error);
    throw firebaseConfigError();
  }
}

if (!auth) {
  throw firebaseConfigError();
}

const appCheckSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
if (app && appCheckSiteKey) {
  try {
    const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
    if (debugToken && typeof globalThis !== 'undefined') {
      globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken === 'true' ? true : debugToken;
    }
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.warn('[firebase] Failed to initialize App Check:', error);
  }
}

export const firebaseApp = app;
export const firebaseAuth = auth;
export const firebaseDb = app ? getFirestore(app) : null;
export const firebaseAppCheck = appCheck;

if (import.meta.env.VITE_USE_EMULATOR === 'true' && app) {
  connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  if (firebaseDb) connectFirestoreEmulator(firebaseDb, '127.0.0.1', 8080);
}

export const firebaseReady = setPersistence(firebaseAuth, browserSessionPersistence)
  .then(() => true)
  .catch((error) => {
    console.warn('[firebase] Failed to set auth persistence:', error);
    return true;
  });
