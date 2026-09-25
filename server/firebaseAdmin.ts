import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';
import path from 'node:path';

function loadServiceAccount() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
  if (json) {
    try {
      return JSON.parse(json);
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid Firebase service-account JSON.');
    }
  }
  if (encoded) {
    try {
      return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 must contain valid base64-encoded Firebase service-account JSON.');
    }
  }

  const filePath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : path.resolve(process.cwd(), 'server', 'firebase-service-account.json');

  if (!fs.existsSync(filePath)) {
    throw new Error('Firebase Admin credentials were not found. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.');
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const rawServiceAccount = loadServiceAccount() as {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};
const configuredProjectId = process.env.FIREBASE_PROJECT_ID?.trim();

if (configuredProjectId && rawServiceAccount.project_id && configuredProjectId !== rawServiceAccount.project_id) {
  throw new Error(`Firebase project mismatch: FIREBASE_PROJECT_ID is ${configuredProjectId}, but the service account belongs to ${rawServiceAccount.project_id}.`);
}

const serviceAccount = {
  projectId: rawServiceAccount.project_id,
  clientEmail: rawServiceAccount.client_email,
  privateKey: rawServiceAccount.private_key,
};

const firebaseAdmin = getApps().length > 0
  ? getApps()[0]
  : initializeApp({
      credential: cert(serviceAccount),
      projectId: configuredProjectId || rawServiceAccount.project_id,
    });

export const adminAuth = getAuth(firebaseAdmin);
export const firestore = getFirestore(firebaseAdmin);
