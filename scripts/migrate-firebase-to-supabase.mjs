import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Load them from .env.local or the process environment.');
}

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || resolve(__dirname, '../server/firebase-service-account.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
const firebaseApp = initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id }, 'firebase-to-supabase-migration');
const firebaseAuth = getAuth(firebaseApp);
const firestore = getFirestore(firebaseApp);
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const ADMIN_EMAILS = new Set(['fountainsdata234@gmail.com']);
const counters = { authUsersCreated: 0, authUsersMapped: 0, profiles: 0, posts: 0, likes: 0, saves: 0, ratings: 0, messages: 0, discoveryEvents: 0, settings: 0, mediaUploaded: 0, mediaFallbacks: 0, skipped: 0, errors: 0 };

const asText = (value, fallback = '') => typeof value === 'string' ? value.trim() : fallback;
const asArray = (value) => Array.isArray(value) ? value : [];
const asIso = (value, fallback = new Date().toISOString()) => {
  if (!value) return fallback;
  const date = value instanceof Date ? value : typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
};
const normalizeRole = (value) => ['admin', 'tailor', 'fabric_seller', 'buyer'].includes(String(value || '').trim().toLowerCase())
  ? String(value).trim().toLowerCase()
  : 'buyer';
const stableUuid = (kind, legacyId) => {
  const bytes = createHash('sha256').update(`fabrilux:${kind}:${legacyId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

async function listFirebaseUsers() {
  const users = [];
  let pageToken;
  do {
    const page = await firebaseAuth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

async function listSupabaseUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

async function upsertRows(table, rows, onConflict, ignoreDuplicates = false) {
  const conflictColumns = onConflict.split(',');
  const uniqueRows = [...new Map(rows.map((row) => [conflictColumns.map((column) => String(row[column])).join('|'), row])).values()];
  for (let offset = 0; offset < uniqueRows.length; offset += 100) {
    const { error } = await supabase.from(table).upsert(uniqueRows.slice(offset, offset + 100), { onConflict, ignoreDuplicates });
    if (error) throw error;
  }
  return uniqueRows.length;
}

async function migrateMedia(sourceUrl, ownerId, category) {
  if (typeof sourceUrl !== 'string' || !/^https:\/\/(firebasestorage\.googleapis\.com|storage\.googleapis\.com)\//i.test(sourceUrl)) return sourceUrl || null;
  try {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Firebase Storage returned HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const extension = contentType.split('/')[1]?.split(';')[0]?.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
    const objectPath = `migration/${category}/${ownerId}/${createHash('sha256').update(sourceUrl).digest('hex').slice(0, 20)}.${extension}`;
    const { error } = await supabase.storage.from('uploads').upload(objectPath, new Uint8Array(await response.arrayBuffer()), {
      cacheControl: '31536000',
      contentType,
      upsert: true,
    });
    if (error) throw error;
    counters.mediaUploaded += 1;
    return supabase.storage.from('uploads').getPublicUrl(objectPath).data.publicUrl;
  } catch {
    counters.mediaFallbacks += 1;
    return sourceUrl;
  }
}

async function main() {
  const [firebaseUsers, profileSnapshot, postSnapshot, messageSnapshot, eventSnapshot, settingsSnapshot] = await Promise.all([
    listFirebaseUsers(),
    firestore.collection('profiles').get(),
    firestore.collection('posts').get(),
    firestore.collection('messages').get(),
    firestore.collection('discoveryEvents').get(),
    firestore.collection('settings').get(),
  ]);

  const legacyProfiles = new Map(profileSnapshot.docs.map((doc) => [doc.id, doc.data()]));
  const firebaseUsersById = new Map(firebaseUsers.map((user) => [user.uid, user]));
  for (const [uid, profile] of legacyProfiles) {
    const email = asText(profile.email).toLowerCase();
    if (email && !firebaseUsersById.has(uid)) {
      firebaseUsersById.set(uid, {
        uid,
        email,
        displayName: asText(profile.name),
        photoURL: asText(profile.avatarUrl),
        disabled: profile.isBlocked === true,
        customClaims: { role: profile.role },
        metadata: { creationTime: profile.createdAt },
      });
    }
  }

  const existingUsers = await listSupabaseUsers();
  const supabaseUsersByEmail = new Map(existingUsers.filter((user) => user.email).map((user) => [user.email.toLowerCase(), user]));
  const userIds = new Map();
  const profileRows = [];
  const adminIds = new Set();

  for (const [legacyId, firebaseUser] of firebaseUsersById) {
    const email = asText(firebaseUser.email).toLowerCase();
    if (!email) {
      counters.skipped += 1;
      continue;
    }
    const legacy = legacyProfiles.get(legacyId) || {};
    const isAdmin = legacy.role === 'admin' || firebaseUser.customClaims?.admin === true || firebaseUser.customClaims?.role === 'admin' || ADMIN_EMAILS.has(email);
    let authUser = supabaseUsersByEmail.get(email);
    if (!authUser) {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: randomBytes(32).toString('base64url'),
        email_confirm: true,
        user_metadata: { name: asText(legacy.name, firebaseUser.displayName || email.split('@')[0]), role: isAdmin ? 'admin' : normalizeRole(legacy.role || firebaseUser.customClaims?.role) },
      });
      if (error) throw error;
      authUser = data.user;
      supabaseUsersByEmail.set(email, authUser);
      counters.authUsersCreated += 1;
    }
    userIds.set(legacyId, authUser.id);
    if (isAdmin) adminIds.add(authUser.id);
  }
  counters.authUsersMapped = userIds.size;

  const adminId = [...adminIds][0] || [...userIds.values()][0];
  for (const [legacyId, firebaseUser] of firebaseUsersById) {
    const id = userIds.get(legacyId);
    if (!id) continue;
    const legacy = legacyProfiles.get(legacyId) || {};
    const email = asText(firebaseUser.email).toLowerCase();
    const isAdmin = legacy.role === 'admin' || firebaseUser.customClaims?.admin === true || firebaseUser.customClaims?.role === 'admin' || ADMIN_EMAILS.has(email);
    const role = isAdmin ? 'admin' : normalizeRole(legacy.role || firebaseUser.customClaims?.role);
    const name = asText(legacy.name, firebaseUser.displayName || email.split('@')[0] || 'Atelier Member');
    const followers = asArray(legacy.followers).map((uid) => userIds.get(String(uid))).filter(Boolean);
    const avatarUrl = await migrateMedia(asText(legacy.avatarUrl, firebaseUser.photoURL || ''), id, 'avatars');
    const userMetadata = {
      ...(supabaseUsersByEmail.get(email)?.user_metadata || {}),
      name,
      role,
      avatar_url: avatarUrl || '',
      is_super_admin: isAdmin && (legacy.isSuperAdmin === true || ADMIN_EMAILS.has(email)),
    };
    const appMetadata = { ...(supabaseUsersByEmail.get(email)?.app_metadata || {}), role, is_admin: isAdmin };
    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(id, { user_metadata: userMetadata, app_metadata: appMetadata });
    if (authUpdateError) throw authUpdateError;

    profileRows.push({
      id,
      email,
      name,
      role,
      phone: asText(legacy.phone, firebaseUser.phoneNumber || ''),
      country_code: asText(legacy.countryCode),
      location: legacy.location && typeof legacy.location === 'object' ? legacy.location : {},
      whatsapp_number: asText(legacy.whatsappNumber),
      shop_name: asText(legacy.shopName),
      bio: asText(legacy.bio),
      handle: asText(legacy.handle, `@${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'atelier_member'}`),
      avatar_url: avatarUrl,
      is_promoted: legacy.isPromoted === true,
      is_blocked: legacy.isBlocked === true || firebaseUser.disabled === true,
      is_warned: legacy.isWarned === true,
      warning_note: asText(legacy.warningNote),
      followers,
      is_super_admin: isAdmin && (legacy.isSuperAdmin === true || ADMIN_EMAILS.has(email)),
      added_by_email: asText(legacy.addedByEmail, isAdmin ? 'fountainsdata234@gmail.com' : ''),
      created_at: asIso(firebaseUser.metadata?.creationTime || legacy.createdAt),
      updated_at: asIso(legacy.updatedAt),
    });
  }
  counters.profiles = await upsertRows('profiles', profileRows, 'id');

  const postIdMap = new Map(postSnapshot.docs.map((doc) => [doc.id, stableUuid('post', doc.id)]));
  const postRows = [];
  const likeRows = [];
  const saveRows = [];
  const ratingRows = [];
  for (const doc of postSnapshot.docs) {
    const legacy = doc.data();
    const authorId = userIds.get(asText(legacy.authorId));
    if (!authorId) {
      counters.skipped += 1;
      continue;
    }
    const postId = postIdMap.get(doc.id);
    postRows.push({
      id: postId,
      author_id: authorId,
      title: asText(legacy.title, 'Untitled'),
      description: asText(legacy.description),
      image_url: await migrateMedia(asText(legacy.imageUrl), postId, 'posts') || '',
      image_alt: asText(legacy.imageAlt),
      tags: asArray(legacy.tags).map(String),
      pricing: legacy.pricing && typeof legacy.pricing === 'object' ? legacy.pricing : {},
      is_promoted: legacy.isPromoted === true,
      is_blocked: legacy.isBlocked === true,
      created_at: asIso(legacy.createdAt),
      updated_at: asIso(legacy.updatedAt || legacy.createdAt),
    });
    for (const uid of asArray(legacy.likes)) {
      const userId = userIds.get(String(uid));
      if (userId) likeRows.push({ post_id: postId, user_id: userId });
    }
    for (const uid of asArray(legacy.saves)) {
      const userId = userIds.get(String(uid));
      if (userId) saveRows.push({ post_id: postId, user_id: userId });
    }
    for (const [uid, value] of Object.entries(legacy.ratingsByUser || {})) {
      const userId = userIds.get(uid);
      const rating = Number(value);
      if (userId && Number.isInteger(rating) && rating >= 1 && rating <= 5) {
        ratingRows.push({ post_id: postId, user_id: userId, rating });
      }
    }
    for (const [collection, rows] of [['likes', likeRows], ['saves', saveRows], ['ratings', ratingRows]]) {
      const snapshot = await doc.ref.collection(collection).get();
      for (const interaction of snapshot.docs) {
        const userId = userIds.get(interaction.id);
        if (!userId) continue;
        if (collection === 'ratings') {
          const rating = Number(interaction.data().rating);
          if (Number.isInteger(rating) && rating >= 1 && rating <= 5) rows.push({ post_id: postId, user_id: userId, rating });
        } else {
          rows.push({ post_id: postId, user_id: userId });
        }
      }
    }
  }
  counters.posts = await upsertRows('posts', postRows, 'id');
  counters.likes = await upsertRows('post_likes', likeRows, 'post_id,user_id', true);
  counters.saves = await upsertRows('post_saves', saveRows, 'post_id,user_id', true);
  counters.ratings = await upsertRows('ratings', ratingRows, 'post_id,user_id');

  const messageRows = messageSnapshot.docs.flatMap((doc) => {
    const legacy = doc.data();
    const senderId = userIds.get(asText(legacy.senderId)) || (asText(legacy.senderId) === 'atelier-system' ? adminId : null);
    const recipientId = userIds.get(asText(legacy.recipientId));
    if (!senderId || !recipientId) {
      counters.skipped += 1;
      return [];
    }
    const oldPostId = asText(legacy.postId);
    return [{
      id: stableUuid('message', doc.id),
      sender_id: senderId,
      sender_name: asText(legacy.senderName, 'Atelier Member'),
      sender_role: normalizeRole(legacy.senderRole),
      recipient_id: recipientId,
      recipient_name: asText(legacy.recipientName, 'Atelier Member'),
      post_id: postIdMap.get(oldPostId) || oldPostId,
      post_title: asText(legacy.postTitle),
      content: asText(legacy.content),
      timestamp: asIso(legacy.timestamp),
      is_read: legacy.isRead === true,
      read_at: legacy.readAt ? asIso(legacy.readAt) : null,
      type: legacy.type === 'general' ? 'general' : 'chat',
    }];
  });
  counters.messages = await upsertRows('messages', messageRows, 'id');

  const eventRows = eventSnapshot.docs.map((doc) => {
    const legacy = doc.data();
    const eventType = asText(legacy.eventType).toUpperCase();
    return {
      id: stableUuid('discovery-event', doc.id),
      user_id: userIds.get(asText(legacy.userId)) || null,
      item_id: postIdMap.get(asText(legacy.itemId)) || asText(legacy.itemId),
      event_type: ['VIEW', 'LIKE', 'SAVE', 'SHARE', 'ENQUIRY', 'ADD_TO_CART', 'PURCHASE', 'RATING'].includes(eventType) ? eventType : 'VIEW',
      timestamp: asIso(legacy.timestamp),
      session_id: asText(legacy.sessionId, `legacy-${doc.id}`),
    };
  });
  counters.discoveryEvents = await upsertRows('discovery_events', eventRows, 'id');

  const settingsRows = settingsSnapshot.docs.map((doc) => {
    const settings = doc.data();
    return { id: doc.id, data: { plans: asArray(settings.plans) } };
  });
  counters.settings = await upsertRows('settings', settingsRows, 'id');
  console.log('Firebase-to-Supabase migration finished:', JSON.stringify(counters));
  if (counters.mediaFallbacks > 0) console.warn('Some Firebase-hosted images remain at their original URLs; check the uploads bucket and rerun the migration after correcting it.');
  if (counters.skipped > 0) console.warn('Some records were skipped because their linked user could not be mapped.');
}

main().catch((error) => {
  counters.errors += 1;
  const safeError = error instanceof Error
    ? error.message
    : error && typeof error === 'object'
      ? JSON.stringify({ code: error.code, message: error.message, details: error.details, hint: error.hint })
      : String(error);
  console.error('Firebase-to-Supabase migration failed:', safeError);
  process.exitCode = 1;
});