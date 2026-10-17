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
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { compressImageBlob } from '../utils/imageProgram';
import { customerMessageForHttpError } from '../utils/customerMessages';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const firebaseAvailable = Object.values(firebaseConfig).every(Boolean);

let app: ReturnType<typeof initializeApp> | undefined;
export let firebaseAuth: ReturnType<typeof getAuth> | null = null;
export let firebaseStorage: ReturnType<typeof getStorage> | null = null;
export let googleProvider: GoogleAuthProvider | null = null;

if (firebaseAvailable) {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  firebaseAuth = getAuth(app);
  firebaseStorage = getStorage(app);
  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
}

const normalizeAvatarUrl = (url?: string | null): string | undefined => {
  if (typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  try {
    const parsedUrl = new URL(trimmed);
    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      return trimmed;
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const resolveAuthPhotoUrl = (firebaseUser: FirebaseUser): string | undefined => {
  const providerPhotos = firebaseUser.providerData
    .map((provider) => provider.photoURL)
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));

  const fallbackPhoto = (firebaseUser as FirebaseUser & {
    reloadUserInfo?: { photoUrl?: string | null };
  }).reloadUserInfo?.photoUrl;

  const candidate = [firebaseUser.photoURL, fallbackPhoto, ...providerPhotos].find((value): value is string => Boolean(value && normalizeAvatarUrl(value)));
  return candidate ? normalizeAvatarUrl(candidate) : undefined;
};

export async function configureFirebaseAuth() {
  if (!firebaseAuth || !navigator.onLine) {
    return;
  }

  try {
    await setPersistence(firebaseAuth, browserLocalPersistence);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/network|timed out|offline|ERR_CONNECTION_TIMED_OUT/i.test(message)) {
      console.warn('Firebase auth persistence skipped while offline.', error);
      return;
    }
    console.warn('Firebase auth persistence setup failed; continuing without network auth.', error);
  }
}

export function subscribeToFirebaseAuth(listener: (user: FirebaseUser | null) => void) {
  if (!firebaseAuth) return () => undefined;
  return onAuthStateChanged(firebaseAuth, listener);
}

export async function registerWithEmail(email: string, password: string, displayName: string, photoURL?: string) {
  if (!firebaseAuth) {
    throw new Error('Firebase authentication is not configured. Use Supabase auth or add Firebase env values.');
  }
  const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
  await updateProfile(credential.user, { displayName, photoURL: photoURL || null });
  return credential.user;
}

export async function loginWithEmail(email: string, password: string) {
  if (!firebaseAuth) {
    throw new Error('Firebase authentication is not configured. Use Supabase auth or add Firebase env values.');
  }
  const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
  return credential.user;
}

export async function resetPassword(email: string) {
  if (!firebaseAuth) {
    throw new Error('Firebase authentication is not configured. Use Supabase auth or add Firebase env values.');
  }
  const redirectUrl = import.meta.env.VITE_AUTH_REDIRECT_URL || 'http://localhost:3000';

  await sendPasswordResetEmail(firebaseAuth, email, {
    url: redirectUrl,
    handleCodeInApp: false,
  });
}

export async function loginWithGoogle() {
  if (!firebaseAuth || !googleProvider) {
    throw new Error('Firebase authentication is not configured. Use Supabase auth or add Firebase env values.');
  }
  const credential = await signInWithPopup(firebaseAuth, googleProvider);
  return credential.user;
}

export async function requestPushToken() {
  if (!app || !firebaseAvailable) {
    throw new Error('Firebase web push is not configured. Use Supabase notifications or add Firebase env values.');
  }
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    throw new Error('This browser does not support background push alerts.');
  }
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    throw new Error('Push alerts are not configured for this site yet.');
  }
  if (!(await isSupported())) {
    throw new Error('This browser does not support Firebase web push.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Allow notifications in your browser settings to enable push alerts.');
  const serviceWorkerRegistration = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration });
  if (!token) throw new Error('The browser did not issue a push subscription token.');
  return token;
}

export async function listenForForegroundPush(listener: (notification: { title: string; body: string; url: string }) => void) {
  if (!app || !firebaseAvailable || !(await isSupported())) return () => undefined;
  return onMessage(getMessaging(app), payload => listener({
    title: payload.notification?.title || payload.data?.title || 'FABSATTIRE',
    body: payload.notification?.body || payload.data?.body || 'You have a new marketplace update.',
    url: payload.data?.url || payload.fcmOptions?.link || '/',
  }));
}

export async function logoutFromFirebase() {
  if (!firebaseAuth) {
    return;
  }
  await signOut(firebaseAuth);
}

export async function uploadUserImage(file: Blob, userId: string, folder: 'profiles' | 'posts' | 'atelier' | string, fileName: string, alreadyOptimized = false) {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8787';
  const { getAuthToken } = await import('./auth');
  const token = await getAuthToken();
  const formData = new FormData();
  const compressedFile = file.type.startsWith('image/') && !alreadyOptimized ? await compressImageBlob(file) : file;
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
    throw new Error(customerMessageForHttpError(response.status, body.error, '/api/upload', body.code));
  }

  const data = await response.json() as { url?: string };
  if (!data.url) {
    throw new Error("We couldn't finish uploading your image. Please try again.");
  }

  return data.url;
}

export async function isFirebaseAdmin(user: FirebaseUser) {
  const token = await user.getIdTokenResult();
  return user.email?.trim().toLowerCase() === 'fountainsdata234@gmail.com' || token.claims.admin === true || token.claims.role === 'admin';
}

export async function toAppUser(firebaseUser: FirebaseUser, role: UserRole = 'buyer'): Promise<User> {
  const admin = await isFirebaseAdmin(firebaseUser);
  const safeName = firebaseUser.displayName?.trim() || firebaseUser.email?.split('@')[0] || 'Atelier Member';
  const avatarUrl = resolveAuthPhotoUrl(firebaseUser);
  const handleBase = safeName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'atelier_member';
  return {
    id: firebaseUser.uid,
    email: firebaseUser.email || '',
    name: safeName,
    role: admin ? 'admin' : role,
    phone: firebaseUser.phoneNumber || '',
    countryCode: '',
    location: { country: '', state: '', city: '' },
    handle: `@${handleBase}`,
    avatarUrl,
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
