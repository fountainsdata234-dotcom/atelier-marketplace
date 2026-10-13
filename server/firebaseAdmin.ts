import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

export const firebaseAdminEnabled = false;

const unavailableFirebaseService = new Proxy({}, {
  get() {
    throw new Error('Firebase Admin is disabled. Use Supabase Auth and Postgres.');
  },
});

export const adminAuth = unavailableFirebaseService as Auth;
export const firestore = unavailableFirebaseService as Firestore;
