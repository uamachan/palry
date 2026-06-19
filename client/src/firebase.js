import { initializeApp } from 'firebase/app';
import { initializeAppCheck, CustomProvider } from 'firebase/app-check';
import { browserLocalPersistence, connectAuthEmulator, getAuth, setPersistence } from 'firebase/auth';
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

// App Check は Cloudflare Turnstile をカスタムプロバイダとして使う。
// クライアントで Turnstile トークンを取得 → exchangeTurnstileToken で検証＆App Checkトークン発行。
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const appCheckExchangeUrl = import.meta.env.VITE_APPCHECK_EXCHANGE_URL
  || 'https://asia-northeast1-ren12-9388b.cloudfunctions.net/exchangeTurnstileToken';

let _turnstileScriptPromise = null;
function loadTurnstile() {
  if (_turnstileScriptPromise) return _turnstileScriptPromise;
  _turnstileScriptPromise = new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.turnstile) return resolve(window.turnstile);
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(window.turnstile);
    s.onerror = () => { _turnstileScriptPromise = null; reject(new Error('Turnstile script load failed')); };
    document.head.appendChild(s);
  });
  return _turnstileScriptPromise;
}

// 使い捨ての非表示ウィジェットを描画して Turnstile トークンを1つ取得する。
function getTurnstileToken(siteKey) {
  return new Promise((resolve, reject) => {
    loadTurnstile().then((turnstile) => {
      const container = document.createElement('div');
      // display:none だと実行されないことがあるため画面外に逃がす。
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      document.body.appendChild(container);
      const cleanup = (widgetId) => {
        try { turnstile.remove(widgetId); } catch { /* noop */ }
        container.remove();
      };
      let widgetId;
      widgetId = turnstile.render(container, {
        sitekey: siteKey,
        callback: (token) => { resolve(token); cleanup(widgetId); },
        'error-callback': () => { reject(new Error('Turnstile error')); cleanup(widgetId); },
        'timeout-callback': () => { reject(new Error('Turnstile timeout')); cleanup(widgetId); },
      });
    }).catch(reject);
  });
}

if (app && turnstileSiteKey) {
  try {
    appCheck = initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: async () => {
          const turnstileToken = await getTurnstileToken(turnstileSiteKey);
          const resp = await fetch(appCheckExchangeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ turnstileToken }),
          });
          if (!resp.ok) throw new Error('App Check exchange failed: ' + resp.status);
          const data = await resp.json();
          if (!data?.token) throw new Error('App Check exchange returned no token');
          return { token: data.token, expireTimeMillis: Date.now() + Number(data.ttlMillis || 0) };
        },
      }),
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

export const firebaseReady = setPersistence(firebaseAuth, browserLocalPersistence)
  .then(() => true)
  .catch((error) => {
    console.warn('[firebase] Failed to set auth persistence:', error);
    return true;
  });
