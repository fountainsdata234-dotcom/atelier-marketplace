import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const uid = process.argv[2];

if (!uid) {
  console.error('Usage: node scripts/set-admin-claim.js <uid>');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function loadServiceAccount() {
  const envJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (envJson) {
    return JSON.parse(envJson);
  }

  const filePath = path.resolve(rootDir, 'server', 'firebase-service-account.json');
  if (!fs.existsSync(filePath)) {
    throw new Error('Missing Firebase admin JSON. Add FIREBASE_SERVICE_ACCOUNT_JSON or place the service account in server/firebase-service-account.json');
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

try {
  const serviceAccount = loadServiceAccount();
  const app = initializeApp({
    credential: cert(serviceAccount),
  });

  const auth = getAuth(app);
  await auth.setCustomUserClaims(uid, { admin: true });
  console.log(`Admin claim set successfully for UID ${uid}`);
  process.exit(0);
} catch (error) {
  console.error('Failed to set admin claim:', error);
  process.exit(1);
}
