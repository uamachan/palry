import React, { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api.js';
import PublicPricing from './Pricing.jsx';

const LazyAppDashboard = lazy(() => import('./AppDashboard.jsx'));
const LazyAuthForms = lazy(() => import('./AuthForms.jsx'));
import Safety from './Safety.jsx';
import SiteHeader from './SiteHeader.jsx';
import { appTabs, defaultRole, planLabel } from './constants.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { initAnalytics, track, shouldAskConsent, setConsent } from './analytics.js';
import { initMonitoring } from './monitoring.js';
import { NotFound } from './ui/primitives.jsx';
import './dm-submit-guard.js';
import './ui/tokens.css';
import './styles.css';
import './profile-setup.css';
import './profile-validation.css';
import './design-polish.css';
import './matching-icons.css';
import './profile-visual.css';
import './golden-ratio.css';
import './mobile-fixes.css';
import './app-format-polish.css';
import './dm-mobile-reference.css';

let firebaseModsPromise = null;
function getFirebaseMods() {
  if (!firebaseModsPromise) {
    firebaseModsPromise = Promise.all([
      import('firebase/auth'),
      import('./firebase.js'),
    ]).then(([auth, firebase]) => ({
      browserLocalPersistence: auth.browserLocalPersistence,
      createUserWithEmailAndPassword: auth.createUserWithEmailAndPassword,
      GoogleAuthProvider: auth.GoogleAuthProvider,
      onAuthStateChanged: auth.onAuthStateChanged,
      sendEmailVerification: auth.sendEmailVerification,
      sendPasswordResetEmail: auth.sendPasswordResetEmail,
      setPersistence: auth.setPersistence,
      signInWithEmailAndPassword: auth.signInWithEmailAndPassword,
      signInWithPopup: auth.signInWithPopup,
      signOut: auth.signOut,
      firebaseAuth: firebase.firebaseAuth,
      firebaseReady: firebase.firebaseReady,
    }));
  }
  return firebaseModsPromise;
}