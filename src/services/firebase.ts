import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  User as FirebaseUser,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { User, UserRole } from '../types';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { compressImageBlob } from '../utils/imageProgram';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const missingConfig = Object.entries(firebaseConfig).filter(([, value]) => !value).map(([key]) => key);
if (missingConfig.length > 0) {
  throw new Error(`Missing Firebase configuration: ${missingConfig.join(', ')}`);
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);
export const firebaseStorage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function configureFirebaseAuth() {
  await setPersistence(firebaseAuth, browserLocalPersistence);
}

export function subscribeToFirebaseAuth(listener: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(firebaseAuth, listener);
}

export async function registerWithEmail(email: string, password: string, displayName: string, photoURL?: string) {
  const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
  await updateProfile(credential.user, { displayName, photoURL: photoURL || null });
  return credential.user;
}

export async function loginWithEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
  return credential.user;
}

export async function resetPassword(email: string) {
  const redirectUrl = import.meta.env.VITE_AUTH_REDIRECT_URL || 'http://localhost:3000';

  await sendPasswordResetEmail(firebaseAuth, email, {
    url: redirectUrl,
    handleCodeInApp: false,
  });
}

export async function loginWithGoogle() {
  const credential = await signInWithPopup(firebaseAuth, googleProvider);
  return credential.user;
}

export async function logoutFromFirebase() {
  await signOut(firebaseAuth);
}

export async function uploadUserImage(file: Blob, userId: string, folder: 'profiles' | 'posts', fileName: string) {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8787';
  const token = firebaseAuth.currentUser ? await firebaseAuth.currentUser.getIdToken() : null;
  const formData = new FormData();
  const compressedFile = file.type.startsWith('image/') ? await compressImageBlob(file) : file;
  formData.append('image', compressedFile, `${fileName.replace(/\.[^.]+$/, '')}.jpg`);
  formData.append('folder', folder);
  formData.append('userId', userId);

  const response = await fetch(`${apiUrl}/api/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Image upload failed.');
  }

  const data = await response.json() as { url?: string };
  if (!data.url) {
    throw new Error('Image upload did not return a valid URL.');
  }

  return data.url;
}

export async function isFirebaseAdmin(user: FirebaseUser) {
  const token = await user.getIdTokenResult();
  return user.email?.trim().toLowerCase() === 'fountainsdata234@gmail.com' || token.claims.admin === true || token.claims.role === 'admin';
}

export async function toAppUser(firebaseUser: FirebaseUser, role: UserRole = 'buyer'): Promise<User> {
  const admin = await isFirebaseAdmin(firebaseUser);
  const name = firebaseUser.displayName?.trim() || firebaseUser.email?.split('@')[0] || 'Atelier Member';
  return {
    id: firebaseUser.uid,
    email: firebaseUser.email || '',
    name,
    role: admin ? 'admin' : role,
    phone: firebaseUser.phoneNumber || '',
    countryCode: '',
    location: { country: '', state: '', city: '' },
    handle: `@${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'atelier_member'}`,
    avatarUrl: firebaseUser.photoURL || undefined,
    isPromoted: false,
    isBlocked: false,
    followers: [],
    createdAt: firebaseUser.metadata.creationTime || new Date().toISOString(),
    isSuperAdmin: admin,
  };
}

export function firebaseErrorMessage(error: unknown) {
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'An account already exists for this email.',
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
    'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow popups and try again.',
    'auth/weak-password': 'Use a stronger password with at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
  };
  return messages[code || ''] || 'Authentication failed. Check your details and try again.';
}
