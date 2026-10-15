import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getMessaging } from 'firebase-admin/messaging';
import { FieldValue } from 'firebase-admin/firestore';
import type { Transaction } from 'firebase-admin/firestore';
import multer from 'multer';
import sharp from 'sharp';
import { adminAuth, firebaseAdminEnabled, firestore } from './firebaseAdmin.js';
import type { UserRole } from '../src/types.js';
import {
  createBroadcast,
  createDiscoveryEvent,
  createFabricRequest,
  createMessage,
  createNotifications,
  createPostWithUser,
  createSellerCollection,
  createListingReport,
  deleteUserUploads,
  deleteMessage,
  getListingsForModeration,
  getListingReports,
  getDiscoveryEvents,
  getFabricRequests,
  getMessages,
  getNotifications,
  getPost,
  getPostInteractions,
  getPosts,
  getSellerListings,
  getProfile,
  getProfileByEmail,
  getPromoPlans,
  getPromoPlansData,
  getSellerCollections,
  removeUserFromFollowers,
  getUsers,
  listProfiles,
  markMessagesRead,
  markNotificationsRead,
  removePushToken,
  recordListingChange,
  savePromoPlans,
  toggleFollow,
  savePushToken,
  setRating,
  supabaseDataEnabled,
  toggleLike,
  toggleSave,
  softDeleteListing,
  updateListing,
  updateListingReport,
  updateFabricRequest,
  updateAuthorPromotion,
  uploadImage,
  updateProfile,
  upsertProfile,
} from './supabaseData.js';

const app = express();
const port = Number(process.env.PORT || 8787);
if (!supabaseDataEnabled) {
  throw new Error('Supabase server credentials are required to start the Atelier API.');
}
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001,http://192.168.186.15:3001').split(',').map((origin) => origin.trim()).filter(Boolean);

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled API promise rejection; server kept alive.', reason);
});

function isLocalNetworkOrigin(origin: string) {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '0.0.0.0'
      || hostname.startsWith('192.168.')
      || hostname.startsWith('10.')
      || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
  } catch {
    return false;
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(origin) || isLocalNetworkOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

interface AuthenticatedRequest extends Request {
  authUser?: { uid: string; email?: string; name?: string; avatarUrl?: string; admin?: boolean; blocked?: boolean };
}

interface StoredMessage {
  id: string;
  timestamp?: string;
  [key: string]: unknown;
}

const DISCOVERY_EVENT_TYPES = new Set(['VIEW', 'LIKE', 'SAVE', 'SHARE', 'ENQUIRY', 'ADD_TO_CART', 'PURCHASE', 'RATING']);
const PUBLIC_CACHE_TTL_MS = 60_000;
const WEB_APP_URL = process.env.APP_URL?.trim() || 'https://fabrilux-atelier.vercel.app';
let postsCache: { expiresAt: number; value: unknown } | null = null;
let usersCache: { expiresAt: number; value: unknown } | null = null;

function invalidatePublicCaches() {
  postsCache = null;
  usersCache = null;
}

async function deleteSupabaseAccount(uid: string) {
  await removeUserFromFollowers(uid);
  await deleteUserUploads(uid);
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { error } = await supabase.auth.admin.deleteUser(uid);
  if (error && error.code !== 'user_not_found') throw error;
  invalidatePublicCaches();
}

async function readProfile(uid: string) {
  if (supabaseDataEnabled) return snakeToCamel(await getProfile(uid));
  const snapshot = await firestore.collection('profiles').doc(uid).get();
  return snapshot.exists ? snapshot.data() as Record<string, unknown> : null;
}

async function writeProfile(uid: string, values: Record<string, unknown>) {
  if (supabaseDataEnabled) return updateProfile(uid, values);
  await firestore.collection('profiles').doc(uid).set(values, { merge: true });
  const snapshot = await firestore.collection('profiles').doc(uid).get();
  return snapshot.data() as Record<string, unknown>;
}

function pushTokenDocumentId(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function sendTopicPush(topic: string, title: string, body: string, url: string, type: string) {
  if (!firebaseAdminEnabled) return;
  try {
    const link = new URL(url, WEB_APP_URL).toString();
    await getMessaging().send({
      topic,
      notification: { title, body },
      data: { title, body, url: link, type, tag: `fabrilux-${type}` },
      webpush: {
        notification: { title, body, icon: `${WEB_APP_URL}/logo.png`, badge: `${WEB_APP_URL}/favicon.svg`, tag: `fabrilux-${type}`, data: { url: link } },
        fcmOptions: { link },
      },
    });
  } catch (error) {
    console.warn('Push notification delivery failed.', error);
  }
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const accessToken = header.slice(7);
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  let authenticatedUser: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
    google_identity_data?: Record<string, unknown>;
  };

  try {
    if (supabaseUrl && supabaseServiceRoleKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });
      const { data: { user }, error } = await supabase.auth.getUser(accessToken);
      if (error || !user) throw new Error('Supabase user is unavailable.');
      authenticatedUser = {
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata,
        app_metadata: user.app_metadata,
        google_identity_data: user.identities?.find(identity => identity.provider === 'google')?.identity_data,
      };
    } else {
      const token = await adminAuth.verifyIdToken(accessToken);
      authenticatedUser = {
        id: token.uid,
        email: token.email,
      };
    }
  } catch {
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
    return;
  }

  try {
    const profileData = await readProfile(authenticatedUser.id) || {};
    const appMetadata = authenticatedUser.app_metadata || {};
    const userMetadata = authenticatedUser.user_metadata || {};
    const googleIdentityData = authenticatedUser.google_identity_data || {};
    const isAdminFromProfile = profileData.role === 'admin'
      || authenticatedUser.email?.trim().toLowerCase() === 'fountainsdata234@gmail.com'
      || appMetadata.role === 'admin'
      || appMetadata.is_admin === true
      || (authenticatedUser as { admin?: boolean; role?: string }).admin === true
      || (authenticatedUser as { admin?: boolean; role?: string }).role === 'admin';
    const name = [userMetadata.name, userMetadata.full_name]
      .find(value => typeof value === 'string' && value.trim());
    const avatarUrl = [userMetadata.avatar_url, userMetadata.picture, googleIdentityData.avatar_url, googleIdentityData.picture]
      .find(value => {
        if (typeof value !== 'string' || !value.trim()) return false;
        try {
          return new URL(value).protocol === 'https:';
        } catch {
          return false;
        }
      });
    req.authUser = {
      uid: authenticatedUser.id,
      email: authenticatedUser.email,
      name: typeof name === 'string' ? name.trim().slice(0, 120) : undefined,
      avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : undefined,
      admin: Boolean(isAdminFromProfile),
      blocked: profileData.isBlocked === true || profileData.is_blocked === true,
    };
    next();
  } catch (error) {
    console.error('Unable to load authenticated profile.', error);
    res.status(503).json({ error: 'Authentication service is temporarily unavailable. Please try again shortly.' });
  }
}

function requireActiveAccount(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.authUser?.blocked) {
    res.status(403).json({ error: 'This account is blocked. Publishing and messaging are disabled until an administrator unblocks it.' });
    return;
  }
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.authUser?.admin) {
    res.status(403).json({ error: 'Administrator access required.' });
    return;
  }
  next();
}

function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const isSuperAdmin = req.authUser?.email?.trim().toLowerCase() === 'fountainsdata234@gmail.com';
  if (!isSuperAdmin) {
    res.status(403).json({ error: 'Primary administrator access required.' });
    return;
  }
  next();
}

function snakeToCamel<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => snakeToCamel(item)) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
    snakeToCamel(entry),
  ])) as T;
}

function listingText(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/<[^>]*>/g, '').trim().slice(0, limit);
}

function isOwnedListingAsset(value: unknown, userId: string): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    const projectUrl = new URL(process.env.SUPABASE_URL!);
    return (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
      && url.origin === projectUrl.origin
      && url.pathname.startsWith(`/storage/v1/object/public/uploads/posts/${userId}/`);
  } catch {
    return false;
  }
}

function validateListingInput(input: Record<string, unknown>, userId: string, profile: Record<string, unknown>, unchangedLegacyImageUrl?: string) {
  const role = profile.role;
  const listingType = input.listingType;
  if (listingType !== 'CLOTHING' && listingType !== 'FABRIC' && listingType !== 'TAILOR_PORTFOLIO') {
    return { error: 'Choose a valid listing type.' };
  }
  if ((role === 'fabric_seller' && listingType !== 'FABRIC')
    || (role === 'tailor' && listingType === 'FABRIC')
    || (role !== 'tailor' && role !== 'fabric_seller')) {
    return { error: 'This listing type is not available for your seller account.' };
  }

  const title = listingText(input.title, 160);
  const description = listingText(input.description, 3000);
  if (title.length < 3 || description.length < 10) return { error: 'Enter a title of at least 3 characters and a description of at least 10 characters.' };

  if (Array.isArray(input.imageAssets) && input.imageAssets.length > 8) return { error: 'A listing can include up to 8 images.' };
  const rawAssets = Array.isArray(input.imageAssets) ? input.imageAssets : [];
  const imageAssets: Array<Record<string, unknown>> = [];
  for (const entry of rawAssets) {
    if (!entry || typeof entry !== 'object') return { error: 'Listing images must be uploaded through the secure image uploader.' };
    const asset = entry as Record<string, unknown>;
    const unchangedLegacyAsset = rawAssets.length === 1 && asset.url === unchangedLegacyImageUrl;
    if ((!isOwnedListingAsset(asset.url, userId) && !unchangedLegacyAsset)
      || (asset.thumbnailUrl !== undefined && !isOwnedListingAsset(asset.thumbnailUrl, userId))) {
      return { error: 'Use images uploaded to your seller account through the secure image uploader.' };
    }
    imageAssets.push({
      url: asset.url,
      ...(typeof asset.thumbnailUrl === 'string' ? { thumbnailUrl: asset.thumbnailUrl } : {}),
      ...(Number.isInteger(asset.width) && Number(asset.width) > 0 ? { width: Number(asset.width) } : {}),
      ...(Number.isInteger(asset.height) && Number(asset.height) > 0 ? { height: Number(asset.height) } : {}),
      mimeType: 'image/jpeg',
    });
  }
  const imageUrl = typeof input.imageUrl === 'string' && (isOwnedListingAsset(input.imageUrl, userId) || input.imageUrl === unchangedLegacyImageUrl)
    ? input.imageUrl
    : imageAssets[0]?.url;
  if (imageAssets.length === 0 && unchangedLegacyImageUrl && imageUrl === unchangedLegacyImageUrl) imageAssets.push({ url: unchangedLegacyImageUrl });
  if (!imageUrl || imageAssets.length === 0) return { error: 'Upload at least one listing image.' };
  if (!imageAssets.some(asset => asset.url === imageUrl)) return { error: 'The primary image must be one of the uploaded listing images.' };

  const currency = typeof input.currency === 'string' ? input.currency.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}$/.test(currency)) return { error: 'Enter a valid three-letter currency code.' };
  const priceMin = input.priceMin === undefined || input.priceMin === null || input.priceMin === '' ? null : Number(input.priceMin);
  const priceMax = input.priceMax === undefined || input.priceMax === null || input.priceMax === '' ? null : Number(input.priceMax);
  if ((priceMin !== null && (!Number.isFinite(priceMin) || priceMin < 0 || priceMin > 1_000_000_000))
    || (priceMax !== null && (!Number.isFinite(priceMax) || priceMax < 0 || priceMax > 1_000_000_000))
    || (priceMin !== null && priceMax !== null && priceMax < priceMin)) {
    return { error: 'Enter a valid non-negative price or price range.' };
  }
  const stockQuantity = input.stockQuantity === undefined || input.stockQuantity === null || input.stockQuantity === '' ? null : Number(input.stockQuantity);
  if (stockQuantity !== null && (!Number.isFinite(stockQuantity) || stockQuantity <= 0 || stockQuantity > 1_000_000_000)) {
    return { error: 'Available stock must be greater than zero; leave it blank if quantity is not tracked.' };
  }
  const rawDetails = input.listingDetails && typeof input.listingDetails === 'object'
    ? input.listingDetails as Record<string, unknown>
    : {};
  const listingDetails: Record<string, unknown> = {};
  let availability = 'available';
  if (listingType === 'FABRIC') {
    const material = listingText(rawDetails.material, 100);
    const colour = listingText(rawDetails.colour, 80);
    const priceUnit = rawDetails.priceUnit;
    const minimumOrder = Number(rawDetails.minimumOrder);
    if (!material || !colour || !['yard', 'metre', 'piece', 'roll'].includes(String(priceUnit))
      || !Number.isFinite(minimumOrder) || minimumOrder <= 0) {
      return { error: 'Fabric listings require material, colour, price unit, and a positive minimum order.' };
    }
    if (stockQuantity !== null && minimumOrder > stockQuantity) return { error: 'Minimum order cannot exceed the available quantity.' };
    const width = rawDetails.width === undefined || rawDetails.width === null || rawDetails.width === '' ? null : Number(rawDetails.width);
    if (width !== null && (!Number.isFinite(width) || width <= 0 || width > 100_000)) {
      return { error: 'Fabric width must be a positive measurement.' };
    }
    Object.assign(listingDetails, {
      material,
      colour,
      pattern: listingText(rawDetails.pattern, 100),
      ...(width !== null ? { width } : {}),
      widthUnit: rawDetails.widthUnit === 'in' ? 'in' : 'cm',
      priceUnit,
      minimumOrder,
    });
    if (stockQuantity !== null) availability = 'limited';
  } else {
    const garmentType = listingText(rawDetails.garmentType, 100);
    const fulfilment = rawDetails.fulfilment;
    if (listingType === 'CLOTHING' && (!garmentType || !['ready_made', 'made_to_order'].includes(String(fulfilment)))) {
      return { error: 'Clothing listings require a garment type and a ready-made or made-to-order selection.' };
    }
    const leadTimeDays = rawDetails.leadTimeDays === undefined || rawDetails.leadTimeDays === null || rawDetails.leadTimeDays === '' ? null : Number(rawDetails.leadTimeDays);
    if (leadTimeDays !== null && (!Number.isInteger(leadTimeDays) || leadTimeDays < 0 || leadTimeDays > 365)) {
      return { error: 'Lead time must be a whole number between 0 and 365 days.' };
    }
    Object.assign(listingDetails, {
      ...(garmentType ? { garmentType } : {}),
      gender: listingText(rawDetails.gender, 40),
      sizes: Array.isArray(rawDetails.sizes) ? rawDetails.sizes
        .filter((size): size is string => typeof size === 'string').map(size => listingText(size, 20)).filter(Boolean).slice(0, 20) : [],
      customizationOptions: Array.isArray(rawDetails.customizationOptions) ? rawDetails.customizationOptions
        .filter((option): option is string => typeof option === 'string').map(option => listingText(option, 80)).filter(Boolean).slice(0, 20) : [],
      ...(leadTimeDays !== null ? { leadTimeDays } : {}),
      ...(fulfilment === 'ready_made' || fulfilment === 'made_to_order' ? { fulfilment } : {}),
    });
    if (fulfilment === 'made_to_order') availability = 'made_to_order';
    else if (stockQuantity !== null) availability = 'limited';
  }

  const tags = Array.isArray(input.tags)
    ? input.tags.filter((tag): tag is string => typeof tag === 'string')
      .map(tag => listingText(tag, 40)).filter(Boolean).slice(0, 20)
    : [];
  const imageAlt = listingText(input.imageAlt, 250) || `${title} by ${listingText(profile.shop_name || profile.shopName || profile.name, 120) || 'Atelier seller'}`;
  return {
    value: {
      listing_type: listingType,
      title,
      description,
      category_id: listingText(input.categoryId, 80) || null,
      tags,
      currency,
      location: profile.location && typeof profile.location === 'object' ? profile.location : {},
      image_url: imageUrl,
      image_assets: imageAssets,
      image_alt: imageAlt,
      pricing: { currency, basic: priceMin ?? 0, premiumMaterial: 0, bespokeComplexity: 0 },
      price_min: priceMin,
      price_max: priceMax,
      stock_quantity: stockQuantity,
      availability,
      listing_details: listingDetails,
    },
  };
}

function cleanProfile(input: Record<string, unknown>, allowAdmin: boolean) {
  return {
    name: typeof input.name === 'string' ? input.name.trim().slice(0, 120) : '',
    ...(allowAdmin && input.role === 'admin' ? { role: 'admin' } : ['buyer', 'tailor', 'fabric_seller'].includes(String(input.role)) ? { role: input.role } : {}),
    phone: typeof input.phone === 'string' ? input.phone.slice(0, 40) : '',
    countryCode: typeof input.countryCode === 'string' ? input.countryCode.slice(0, 8) : '',
    location: input.location && typeof input.location === 'object' ? input.location : {},
    whatsappNumber: typeof input.whatsappNumber === 'string' ? input.whatsappNumber.slice(0, 40) : '',
    shopName: typeof input.shopName === 'string' ? input.shopName.trim().slice(0, 120) : '',
    bio: typeof input.bio === 'string' ? input.bio.trim().slice(0, 1000) : '',
    handle: typeof input.handle === 'string' ? input.handle.trim().slice(0, 60) : '',
    avatarUrl: typeof input.avatarUrl === 'string' ? input.avatarUrl.slice(0, 2_000_000) : '',
    ...(typeof input.isWarned === 'boolean' ? { isWarned: input.isWarned } : {}),
    ...(typeof input.warningNote === 'string' ? { warningNote: input.warningNote.trim().slice(0, 500) } : {}),
    updatedAt: new Date().toISOString(),
  };
}

function buildProfileUpdate(input: Record<string, unknown>) {
  const updates: Record<string, unknown> = {};

  if (typeof input.name === 'string') updates.name = input.name.trim().slice(0, 120);
  if (typeof input.role === 'string' && ['buyer', 'tailor', 'fabric_seller'].includes(input.role)) updates.role = input.role;
  if (typeof input.phone === 'string') updates.phone = input.phone.slice(0, 40);
  if (typeof input.countryCode === 'string') updates.countryCode = input.countryCode.slice(0, 8);
  if (input.location && typeof input.location === 'object') updates.location = input.location;
  if (typeof input.whatsappNumber === 'string') updates.whatsappNumber = input.whatsappNumber.slice(0, 40);
  if (typeof input.shopName === 'string') updates.shopName = input.shopName.trim().slice(0, 120);
  if (typeof input.bio === 'string') updates.bio = input.bio.trim().slice(0, 1000);
  if (typeof input.handle === 'string') updates.handle = input.handle.trim().slice(0, 60);
  if (typeof input.avatarUrl === 'string') updates.avatarUrl = input.avatarUrl.slice(0, 2_000_000);
  if (typeof input.isPromoted === 'boolean') updates.isPromoted = input.isPromoted;
  if (typeof input.isBlocked === 'boolean') updates.isBlocked = input.isBlocked;
  if (typeof input.isWarned === 'boolean') updates.isWarned = input.isWarned;
  if (typeof input.warningNote === 'string') updates.warningNote = input.warningNote.trim().slice(0, 500);
  if (typeof input.isSuperAdmin === 'boolean') updates.isSuperAdmin = input.isSuperAdmin;
  if (typeof input.addedByEmail === 'string') updates.addedByEmail = input.addedByEmail.slice(0, 200);
  if (Array.isArray(input.followers)) updates.followers = input.followers.filter((item): item is string => typeof item === 'string').slice(0, 200);
  updates.updatedAt = new Date().toISOString();

  return updates;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'atelier-api' });
});

app.post('/api/push/subscribe', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token || token.length > 4096) {
    res.status(400).json({ error: 'A valid push subscription token is required.' });
    return;
  }

  const uid = req.authUser!.uid;
  if (supabaseDataEnabled) {
    try {
      await savePushToken(uid, token);
      res.json({ ok: true });
    } catch (error) {
      console.error('Supabase push subscription registration failed.', error);
      res.status(503).json({ error: 'Push alerts could not be enabled on this device.' });
    }
    return;
  }
  const tokenRef = firestore.collection('pushTokens').doc(pushTokenDocumentId(token));
  const existing = await tokenRef.get();
  const previousUid = existing.data()?.uid;
  if (typeof previousUid === 'string' && previousUid !== uid) {
    await getMessaging().unsubscribeFromTopic(token, `user_${previousUid}`).catch(() => undefined);
  }
  try {
    await Promise.all([
      getMessaging().subscribeToTopic(token, `user_${uid}`),
      getMessaging().subscribeToTopic(token, 'marketplace_updates'),
    ]);
    await tokenRef.set({ uid, token, updatedAt: FieldValue.serverTimestamp() });
    res.json({ ok: true });
  } catch (error) {
    console.error('Push subscription registration failed.', error);
    res.status(503).json({ error: 'Push alerts could not be enabled on this device.' });
  }
});

app.get('/api/seller-collections', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (supabaseDataEnabled) {
    res.json(snakeToCamel(await getSellerCollections(req.authUser!.uid)));
    return;
  }
  const snapshot = await firestore.collection('profiles').doc(req.authUser!.uid)
    .collection('sellerCollections').orderBy('createdAt', 'desc').limit(50).get();
  res.json(snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })));
});

app.post('/api/seller-collections', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const profile = await readProfile(req.authUser!.uid);
  if (profile?.role !== 'tailor' && profile?.role !== 'fabric_seller') {
    res.status(403).json({ error: 'Only tailor and fabric seller accounts can publish collections.' });
    return;
  }
  if (profile.isBlocked === true) {
    res.status(403).json({ error: 'Blocked seller accounts cannot publish collections.' });
    return;
  }

  const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 120) : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 1000) : '';
  const imageUrls = Array.isArray(req.body?.imageUrls)
    ? req.body.imageUrls.filter((value: unknown): value is string => typeof value === 'string' && /^https:\/\//i.test(value)).slice(0, 12)
    : [];
  if (!title || imageUrls.length === 0) {
    res.status(400).json({ error: 'A collection title and at least one valid HTTPS image URL are required.' });
    return;
  }

  const existingCollections = supabaseDataEnabled
    ? await getSellerCollections(req.authUser!.uid)
    : (await firestore.collection('profiles').doc(req.authUser!.uid).collection('sellerCollections').get()).docs;
  const collectionLimit = profile.isPromoted === true ? 50 : 3;
  if (existingCollections.length >= collectionLimit) {
    res.status(403).json({ error: `Your account has reached its ${collectionLimit}-collection limit.` });
    return;
  }

  if (supabaseDataEnabled) {
    const collection = await createSellerCollection(req.authUser!.uid, {
      title,
      description,
      imageUrls,
    });
    res.status(201).json(snakeToCamel(collection));
    return;
  }

  const collection = await firestore.collection('profiles').doc(req.authUser!.uid)
    .collection('sellerCollections').add({
      sellerId: req.authUser!.uid,
      title,
      description,
      imageUrls,
      createdAt: new Date().toISOString(),
    });
  const saved = await collection.get();
  res.status(201).json({ id: saved.id, ...(saved.data() as Record<string, unknown>) });
});

app.delete('/api/push/subscribe', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token || token.length > 4096) {
    res.status(400).json({ error: 'A valid push subscription token is required.' });
    return;
  }

  if (supabaseDataEnabled) {
    try {
      await removePushToken(req.authUser!.uid, token);
      res.status(204).send();
    } catch (error) {
      console.error('Supabase push subscription removal failed.', error);
      res.status(503).json({ error: 'Push subscription could not be removed.' });
    }
    return;
  }
  const tokenRef = firestore.collection('pushTokens').doc(pushTokenDocumentId(token));
  const existing = await tokenRef.get();
  if (!existing.exists) {
    res.status(204).send();
    return;
  }
  if (existing.data()?.uid !== req.authUser!.uid) {
    res.status(403).json({ error: 'This push subscription belongs to another account.' });
    return;
  }
  await Promise.all([
    getMessaging().unsubscribeFromTopic(token, `user_${req.authUser!.uid}`).catch(() => undefined),
    getMessaging().unsubscribeFromTopic(token, 'marketplace_updates').catch(() => undefined),
    tokenRef.delete(),
  ]);
  res.status(204).send();
});

app.post('/api/upload', requireAuth, upload.single('image'), async (req: AuthenticatedRequest, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No image file was provided.' });
    return;
  }

  const requestedFolder = String(req.body?.folder || 'atelier');
  const safeFolder = ['profiles', 'posts', 'atelier'].includes(requestedFolder) ? requestedFolder : 'atelier';
  if (safeFolder === 'posts') {
    if (req.authUser?.blocked) {
      res.status(403).json({ error: 'Blocked accounts cannot upload listing images.' });
      return;
    }
    const profile = await readProfile(req.authUser!.uid);
    if (profile?.role !== 'tailor' && profile?.role !== 'fabric_seller') {
      res.status(403).json({ error: 'Only active sellers can upload listing images.' });
      return;
    }
  }

  try {
    const metadata = await sharp(req.file.buffer, { limitInputPixels: 40_000_000 }).metadata();
    if (!metadata.width || !metadata.height || !['jpeg', 'png', 'webp', 'gif'].includes(metadata.format || '')) {
      res.status(400).json({ error: 'Upload a valid JPEG, PNG, WebP, or GIF image.' });
      return;
    }
    const [optimizedBuffer, thumbnailBuffer] = await Promise.all([
      sharp(req.file.buffer, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, progressive: true, mozjpeg: true })
        .toBuffer(),
      sharp(req.file.buffer, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 72, progressive: true, mozjpeg: true })
        .toBuffer(),
    ]);

    const fileName = `${Date.now()}-${createHash('sha256').update(req.file.buffer).digest('hex').slice(0, 12)}`;
    const [original, thumbnail] = await Promise.all([
      uploadImage(req.authUser!.uid, safeFolder, `${fileName}.jpg`, optimizedBuffer, 'image/jpeg'),
      uploadImage(req.authUser!.uid, safeFolder, `${fileName}-thumb.jpg`, thumbnailBuffer, 'image/jpeg'),
    ]);
    res.status(201).json({
      url: original.url,
      thumbnailUrl: thumbnail.url,
      publicId: original.path,
      width: metadata.width,
      height: metadata.height,
      mimeType: 'image/jpeg',
    });
  } catch (error) {
    console.error('Media upload failed', error);
    if (error instanceof Error && /unsupported image format|input buffer contains unsupported image format/i.test(error.message)) {
      res.status(400).json({ error: 'The uploaded file is not a supported image.' });
      return;
    }
    res.status(500).json({ error: 'Image upload failed on the server.' });
  }
});

app.get('/api/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  let profile = await readProfile(req.authUser!.uid);
  if (!profile) {
    const email = req.authUser!.email || '';
    profile = await upsertProfile(req.authUser!.uid, {
      id: req.authUser!.uid,
      email,
      name: req.authUser!.name || email.split('@')[0] || 'Atelier Member',
      role: req.authUser!.admin ? 'admin' : 'buyer',
      handle: `@${(email.split('@')[0] || 'atelier_member').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
      avatarUrl: req.authUser!.avatarUrl || '',
      isSuperAdmin: email.trim().toLowerCase() === 'fountainsdata234@gmail.com',
    });
  }
  res.json({ id: req.authUser!.uid, ...snakeToCamel(profile) });
});

app.get('/api/notifications', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (supabaseDataEnabled) {
    res.json(snakeToCamel(await getNotifications(req.authUser!.uid)));
    return;
  }
  const snapshot = await firestore.collection('profiles').doc(req.authUser!.uid)
    .collection('notifications').orderBy('createdAt', 'desc').limit(100).get();
  res.json(snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })));
});

app.post('/api/notifications/read', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (supabaseDataEnabled) {
    await markNotificationsRead(req.authUser!.uid);
  } else {
    const snapshot = await firestore.collection('profiles').doc(req.authUser!.uid)
      .collection('notifications').where('isRead', '==', false).limit(500).get();
    if (!snapshot.empty) {
      const batch = firestore.batch();
      snapshot.docs.forEach(doc => batch.update(doc.ref, { isRead: true }));
      await batch.commit();
    }
  }
  res.status(204).send();
});

app.get('/api/promo-plans', async (_req, res) => {
  if (supabaseDataEnabled) {
    res.json(await getPromoPlansData());
    return;
  }
  const snapshot = await firestore.collection('settings').doc('promoPlans').get();
  res.json(snapshot.exists && Array.isArray(snapshot.data()?.plans) ? snapshot.data()?.plans : []);
});

app.put('/api/promo-plans', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
  const plans = Array.isArray(req.body?.plans) ? req.body.plans.slice(0, 3).map((plan: Record<string, unknown>, index: number) => ({
    id: typeof plan.id === 'string' ? plan.id.slice(0, 80) : `promo-${index + 1}`,
    caption: String(plan.caption || '').trim().slice(0, 120),
    timeRange: String(plan.timeRange || '').trim().slice(0, 80),
    description: String(plan.description || '').trim().slice(0, 600),
    amount: Math.max(0, Number(plan.amount) || 0),
    currency: String(plan.currency || 'USD').slice(0, 8),
    whatsappNumber: String(plan.whatsappNumber || '').slice(0, 40),
    badgeLabel: String(plan.badgeLabel || '').trim().slice(0, 60),
    accentColor: String(plan.accentColor || '#d97706').slice(0, 20),
    isActive: plan.isActive !== false,
  })) : null;
  if (!plans || plans.length !== 3) {
    res.status(400).json({ error: 'Exactly three promotion plans are required.' });
    return;
  }
  if (supabaseDataEnabled) {
    res.json(await savePromoPlans(plans));
    return;
  }
  await firestore.collection('settings').doc('promoPlans').set({ plans, updatedAt: FieldValue.serverTimestamp(), updatedBy: req.authUser!.uid });
  res.json(plans);
});

app.put('/api/users/:uid/profile', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
  const updates = buildProfileUpdate(req.body || {});
  const uid = req.params.uid;
  const existing = await readProfile(uid);
  if (!existing) {
    res.status(404).json({ error: 'User profile not found.' });
    return;
  }
  const existingRole = existing.role;
  if (existingRole === 'admin' && req.authUser?.email?.trim().toLowerCase() !== 'fountainsdata234@gmail.com') {
    res.status(403).json({ error: 'Only the Super Admin can change administrator access.' });
    return;
  }

  if (typeof req.body?.isBlocked === 'boolean' || typeof req.body?.isWarned === 'boolean' || typeof req.body?.warningNote === 'string') {
    if (existingRole !== 'tailor' && existingRole !== 'fabric_seller') {
      res.status(403).json({ error: 'Customer accounts cannot be blocked or warned.' });
      return;
    }
  }

  if (supabaseDataEnabled) {
    await writeProfile(uid, updates);
    if (typeof req.body?.isPromoted === 'boolean') await updateAuthorPromotion(uid, req.body.isPromoted);
    res.json({ id: uid, ...(await readProfile(uid) || {}) });
    return;
  }

  const profileRef = firestore.collection('profiles').doc(uid);
  const existingProfile = await profileRef.get();
  const legacyRole = existingProfile.data()?.role;
  if (legacyRole === 'admin' && req.authUser?.email?.trim().toLowerCase() !== 'fountainsdata234@gmail.com') {
    res.status(403).json({ error: 'Only the Super Admin can change administrator access.' });
    return;
  }

  if (typeof req.body?.isBlocked === 'boolean' || typeof req.body?.isWarned === 'boolean' || typeof req.body?.warningNote === 'string') {
    const targetRole = legacyRole;
    if (targetRole !== 'tailor' && targetRole !== 'fabric_seller') {
      res.status(403).json({ error: 'Customer accounts cannot be blocked or warned.' });
      return;
    }
  }

  await profileRef.set(updates, { merge: true });

  if (typeof req.body?.isPromoted === 'boolean') {
    const postsSnapshot = await firestore.collection('posts').where('authorId', '==', uid).get();
    await Promise.all(postsSnapshot.docs.map(doc =>
      doc.ref.set({ isPromoted: req.body.isPromoted, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    ));
  }

  const saved = await profileRef.get();
  res.json({ id: uid, ...(saved.data() || {}) });
});

app.post('/api/admin/admins', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'A valid administrator email is required.' });
    return;
  }

  if (supabaseDataEnabled) {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    const target = (users as Array<{ id: string; email?: string; user_metadata: Record<string, unknown>; app_metadata: Record<string, unknown> }>).find(user => user.email?.toLowerCase() === email);
    if (!target) {
      res.status(404).json({ error: 'That email does not belong to a registered Supabase account yet.' });
      return;
    }
    const profile = await readProfile(target.id) || {};
    const { error: authError } = await supabase.auth.admin.updateUserById(target.id, {
      user_metadata: { ...target.user_metadata, role: 'admin' },
      app_metadata: { ...target.app_metadata, role: 'admin', is_admin: true },
    });
    if (authError) throw authError;
    const saved = await upsertProfile(target.id, { ...profile, id: target.id, email, role: 'admin', isSuperAdmin: false, updatedAt: new Date().toISOString() });
    invalidatePublicCaches();
    res.status(201).json({ id: target.id, ...snakeToCamel(saved) });
    return;
  }

  try {
    const firebaseUser = await adminAuth.getUserByEmail(email);
    const claims = firebaseUser.customClaims || {};
    await adminAuth.setCustomUserClaims(firebaseUser.uid, { ...claims, admin: true, role: 'admin' });
    const profileRef = firestore.collection('profiles').doc(firebaseUser.uid);
    await profileRef.set({ role: 'admin', isSuperAdmin: false, email, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const saved = await profileRef.get();
    res.status(201).json({ id: firebaseUser.uid, ...(saved.data() || {}) });
  } catch (error) {
    if ((error as { code?: string }).code === 'auth/user-not-found') {
      res.status(404).json({ error: 'That email does not belong to a registered Firebase account yet.' });
      return;
    }
    throw error;
  }
});

app.delete('/api/admin/admins/:uid', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
  if (req.params.uid === req.authUser!.uid) {
    res.status(400).json({ error: 'The primary administrator cannot remove their own access.' });
    return;
  }
  if (supabaseDataEnabled) {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { data: { user }, error } = await supabase.auth.admin.getUserById(req.params.uid);
    if (error || !user) {
      res.status(404).json({ error: 'Administrator account not found.' });
      return;
    }
    const { error: authError } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, role: 'buyer' },
      app_metadata: { ...user.app_metadata, role: 'buyer', is_admin: false },
    });
    if (authError) throw authError;
    await writeProfile(user.id, { role: 'buyer', isSuperAdmin: false, updatedAt: new Date().toISOString() });
    invalidatePublicCaches();
    res.status(204).send();
    return;
  }
  const target = await adminAuth.getUser(req.params.uid);
  const claims = { ...(target.customClaims || {}) };
  delete claims.admin;
  delete claims.role;
  await adminAuth.setCustomUserClaims(req.params.uid, claims);
  await firestore.collection('profiles').doc(req.params.uid).set({ role: 'buyer', isSuperAdmin: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  res.status(204).send();
});

app.put('/api/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  const profile = buildProfileUpdate(req.body || {});
  const existingProfile = await readProfile(req.authUser!.uid);
  if (existingProfile) delete profile.role;
  delete profile.isPromoted;
  delete profile.isBlocked;
  delete profile.isWarned;
  delete profile.warningNote;
  delete profile.isSuperAdmin;
  delete profile.addedByEmail;
  delete profile.followers;
  const profileValues = { ...profile, id: req.authUser!.uid, email: req.authUser!.email || '' };
  if (supabaseDataEnabled) {
    const saved = await upsertProfile(req.authUser!.uid, profileValues);
    const welcome = await getMessages(req.authUser!.uid);
    if (!welcome.some(message => message.type === 'general' && message.post_title === 'Welcome to Atelier')) {
      const profileName = String(profile.name || req.authUser!.email?.split('@')[0] || 'Atelier Member');
      await createMessage({
        sender_id: req.authUser!.uid,
        sender_name: 'Atelier Team',
        sender_role: 'admin',
        recipient_id: req.authUser!.uid,
        recipient_name: profileName,
        post_id: '',
        post_title: 'Welcome to Atelier',
        content: `Welcome, ${profileName}. Welcome to FABSATTIRE. Explore the marketplace, follow trusted studios, and discover tailored fashion and fabric sellers whenever you are ready.`,
        timestamp: new Date().toISOString(),
        is_read: false,
        type: 'general',
      });
    }
    res.json(saved);
    return;
  }
  await firestore.collection('profiles').doc(req.authUser!.uid).set(profileValues, { merge: true });
  const welcomeSnapshot = await firestore.collection('messages')
    .where('recipientId', '==', req.authUser!.uid)
    .limit(200)
    .get();
  const hasWelcomeMessage = welcomeSnapshot.docs.some(doc => doc.data().senderId === 'atelier-system');
  if (!hasWelcomeMessage) {
    const profileName = String(profile.name || req.authUser!.email?.split('@')[0] || 'Atelier Member');
    await firestore.collection('messages').add({
      senderId: 'atelier-system', senderName: 'Atelier Team', senderRole: 'admin', recipientId: req.authUser!.uid,
      recipientName: profileName, postId: '', postTitle: 'Welcome to Atelier',
      content: `Welcome, ${profileName}. Welcome to FABSATTIRE. Explore the marketplace, follow trusted studios, and discover tailored fashion and fabric sellers whenever you are ready.`,
      timestamp: new Date().toISOString(), isRead: false, type: 'general',
    });
  }
  const saved = await firestore.collection('profiles').doc(req.authUser!.uid).get();
  res.json(saved.data());
});

app.delete('/api/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.authUser!.uid;
  if (supabaseDataEnabled) {
    await deleteSupabaseAccount(uid);
    res.status(204).send();
    return;
  }
  const postsSnapshot = await firestore.collection('posts').where('authorId', '==', uid).get();
  const messages = await Promise.all([
    firestore.collection('messages').where('senderId', '==', uid).get(),
    firestore.collection('messages').where('recipientId', '==', uid).get(),
  ]);
  const discoveryEvents = await firestore.collection('discoveryEvents').where('userId', '==', uid).get();
  const pushTokens = await firestore.collection('pushTokens').where('uid', '==', uid).get();
  const fabricRequests = await Promise.all([
    firestore.collection('fabricRequests').where('buyerId', '==', uid).get(),
    firestore.collection('fabricRequests').where('sellerId', '==', uid).get(),
  ]);
  const removableDocs = [
    ...messages.flatMap(snapshot => snapshot.docs),
    ...discoveryEvents.docs,
    ...pushTokens.docs,
    ...fabricRequests.flatMap(snapshot => snapshot.docs),
  ];
  await Promise.all(pushTokens.docs.map(async doc => {
    const token = doc.data().token;
    if (typeof token !== 'string') return;
    await Promise.all([
      getMessaging().unsubscribeFromTopic(token, `user_${uid}`).catch(() => undefined),
      getMessaging().unsubscribeFromTopic(token, 'marketplace_updates').catch(() => undefined),
    ]);
  }));
  for (let index = 0; index < removableDocs.length; index += 400) {
    const batch = firestore.batch();
    removableDocs.slice(index, index + 400).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
  await Promise.all(postsSnapshot.docs.map(post => firestore.recursiveDelete(post.ref)));
  await firestore.recursiveDelete(firestore.collection('profiles').doc(uid));
  try {
    await adminAuth.deleteUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
  }
  res.status(204).send();
});

app.get('/api/posts', async (req, res) => {
  const search = typeof req.query.q === 'string' ? listingText(req.query.q, 80) : '';
  try {
    if (!search && postsCache && postsCache.expiresAt > Date.now()) {
      res.json(postsCache.value);
      return;
    }

    let posts: Array<Record<string, unknown> & { id: string; isBlocked?: boolean }>;
    if (supabaseDataEnabled) {
      const rows = await getPosts(24, search || undefined);
      const enriched = await Promise.all(rows.map(async row => {
        const author = row.author as Record<string, unknown> || {};
        const interactions = await getPostInteractions(String(row.id));
        const ratings = Object.values(interactions.ratings).map(value => Number(value));
        const normalized = snakeToCamel({ ...row, author }) as Record<string, unknown>;
        return {
          ...normalized,
          id: String(normalized.id),
          authorName: String(author.shop_name || author.shopName || author.name || 'Atelier Member'),
          authorRole: author.role || 'tailor',
          authorHandle: author.handle || '@atelier_member',
          authorAvatar: author.avatar_url || author.avatarUrl || '',
          authorLocation: author.location || { country: '', state: '', city: '' },
          authorIsBlocked: author.is_blocked === true || author.isBlocked === true,
          authorWhatsapp: author.whatsapp_number || author.whatsappNumber || '',
          isBlocked: normalized.isBlocked === true,
          likes: interactions.likes,
          saves: interactions.saves,
          rating: ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0,
          ratingCount: ratings.length,
          ratingsByUser: interactions.ratings,
          imageAlt: typeof normalized.imageAlt === 'string' ? normalized.imageAlt.trim() : undefined,
        };
      }));
      posts = enriched.filter(post => post.isBlocked !== true && post.authorIsBlocked !== true);
    } else {
      const snapshot = await firestore.collection('posts').orderBy('createdAt', 'desc').limit(24).get();
      const authorIds = [...new Set(snapshot.docs.map(doc => String(doc.data().authorId || '')).filter(Boolean))];
      const authorRefs = authorIds.map(uid => firestore.collection('profiles').doc(uid));
      const authorSnapshots = authorRefs.length > 0 ? await firestore.getAll(...authorRefs) : [];
      const profiles = new Map(authorSnapshots.map(doc => [doc.id, doc.data()]));
      posts = (await Promise.all(snapshot.docs.map(async doc => {
        const data = doc.data() as Record<string, unknown>;
        const author = profiles.get(String(data.authorId)) || {};
        const [likesSnapshot, savesSnapshot, ratingsSnapshot] = await Promise.all([
          doc.ref.collection('likes').get(), doc.ref.collection('saves').get(), doc.ref.collection('ratings').get(),
        ]);
        const validRatings = ratingsSnapshot.docs.map(item => ({ userId: item.id, rating: Number(item.data().rating) })).filter(item => item.rating >= 1 && item.rating <= 5);
        return {
          id: doc.id, ...data,
          authorName: author.shopName || author.name || 'Atelier Member', authorRole: author.role || 'tailor',
          authorHandle: author.handle || '@atelier_member', authorAvatar: author.avatarUrl || '', authorLocation: author.location || { country: '', state: '', city: '' },
          authorIsBlocked: author.isBlocked === true, authorWhatsapp: author.whatsappNumber || '', isBlocked: data.isBlocked === true,
          likes: likesSnapshot.docs.map(item => item.id), saves: savesSnapshot.docs.map(item => item.id),
          rating: validRatings.length ? validRatings.reduce((sum, item) => sum + item.rating, 0) / validRatings.length : 0,
          ratingCount: validRatings.length, ratingsByUser: Object.fromEntries(validRatings.map(item => [item.userId, item.rating])),
          imageAlt: typeof data.imageAlt === 'string' ? data.imageAlt.trim() : undefined,
        };
      }))).filter(post => post.isBlocked !== true && post.authorIsBlocked !== true);
    }
    if (!search) postsCache = { expiresAt: Date.now() + PUBLIC_CACHE_TTL_MS, value: posts };
    res.json(posts);
  } catch (error) {
    console.error('Unable to load marketplace posts', error);
    res.status(503).json({ error: 'Marketplace data is temporarily unavailable. Please try again shortly.' });
  }
});

async function listAllAuthUsers() {
  const users = [];
  let pageToken: string | undefined;
  do {
    const page = await adminAuth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

app.get('/api/users', async (_req, res) => {
  try {
    if (usersCache && usersCache.expiresAt > Date.now()) {
      res.json(usersCache.value);
      return;
    }

    if (supabaseDataEnabled) {
      const profiles = await getUsers();
      const users = profiles.map(profile => {
        const email = String(profile.email || '');
        const role = profile.role === 'admin' ? 'admin' : ['tailor', 'fabric_seller', 'buyer'].includes(String(profile.role)) ? String(profile.role) : 'buyer';
        const name = String(profile.name || email.split('@')[0] || 'Atelier Member');
        return {
          id: String(profile.id), email, name, role: role as UserRole,
          phone: String(profile.phone || ''), countryCode: String(profile.country_code || ''),
          location: profile.location && typeof profile.location === 'object' ? profile.location : { country: '', state: '', city: '' },
          whatsappNumber: String(profile.whatsapp_number || ''), shopName: String(profile.shop_name || ''), bio: String(profile.bio || ''),
          handle: String(profile.handle || `@${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'atelier_member'}`),
          avatarUrl: String(profile.avatar_url || ''), isPromoted: profile.is_promoted === true, isBlocked: profile.is_blocked === true,
          isWarned: profile.is_warned === true, warningNote: String(profile.warning_note || ''), followers: Array.isArray(profile.followers) ? profile.followers.filter((value): value is string => typeof value === 'string') : [],
          createdAt: String(profile.created_at || new Date().toISOString()), isSuperAdmin: profile.is_super_admin === true,
          addedByEmail: String(profile.added_by_email || ''),
        };
      });
      usersCache = { expiresAt: Date.now() + PUBLIC_CACHE_TTL_MS, value: users };
      res.json(users);
      return;
    }

    const profileSnapshot = await firestore.collection('profiles').get();
    let authUsers: Awaited<ReturnType<typeof listAllAuthUsers>> = [];
    try {
      authUsers = await listAllAuthUsers();
    } catch (error) {
      console.warn('Firebase Auth unavailable; serving profile-backed users.', error);
    }
    const profiles = new Map(profileSnapshot.docs.map(doc => [doc.id, doc.data() as Record<string, unknown>]));
    const userRecords = authUsers.length > 0 ? authUsers : profileSnapshot.docs.map(doc => ({
      uid: doc.id,
      email: '',
      displayName: '',
      phoneNumber: '',
      photoURL: '',
      disabled: false,
      customClaims: {},
      metadata: { creationTime: undefined },
    }));
    const users = userRecords.map(authUser => {
      const profile = profiles.get(authUser.uid) || {};
      const claims = (authUser.customClaims || {}) as Record<string, unknown>;
      const isAdmin = profile.role === 'admin'
        || authUser.email?.trim().toLowerCase() === 'fountainsdata234@gmail.com'
        || claims.admin === true
        || claims.role === 'admin';
      const role = isAdmin ? 'admin' : ['tailor', 'fabric_seller', 'buyer'].includes(String(profile.role)) ? profile.role : 'buyer';
      const name = String(profile.name || authUser.displayName || authUser.email?.split('@')[0] || 'Atelier Member');
      return {
        id: authUser.uid,
        email: authUser.email || '',
        name,
        role,
        phone: String(profile.phone || authUser.phoneNumber || ''),
        countryCode: String(profile.countryCode || ''),
        location: profile.location && typeof profile.location === 'object' ? profile.location : { country: '', state: '', city: '' },
        whatsappNumber: String(profile.whatsappNumber || ''),
        shopName: String(profile.shopName || ''),
        bio: String(profile.bio || ''),
        handle: String(profile.handle || `@${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'atelier_member'}`),
        avatarUrl: String(profile.avatarUrl || authUser.photoURL || ''),
        isPromoted: profile.isPromoted === true,
        isBlocked: profile.isBlocked === true || authUser.disabled === true,
        isWarned: profile.isWarned === true,
        warningNote: String(profile.warningNote || ''),
        followers: Array.isArray(profile.followers) ? profile.followers.filter((value): value is string => typeof value === 'string') : [],
        createdAt: String(profile.createdAt || authUser.metadata.creationTime || new Date().toISOString()),
        isSuperAdmin: isAdmin && authUser.email?.trim().toLowerCase() === 'fountainsdata234@gmail.com',
        addedByEmail: String(profile.addedByEmail || ''),
      };
    });
    usersCache = { expiresAt: Date.now() + PUBLIC_CACHE_TTL_MS, value: users };
    res.json(users);
  } catch (error) {
    console.error('Unable to load registered users', error);
    res.status(503).json({ error: 'Registered-user data is temporarily unavailable. Please try again shortly.' });
  }
});

app.post('/api/users/:uid/follow', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.params.uid === req.authUser!.uid) {
    res.status(400).json({ error: 'You cannot follow your own account.' });
    return;
  }
  const target = await readProfile(req.params.uid);
  if (!target) {
    res.status(404).json({ error: 'That artisan account no longer exists.' });
    return;
  }
  if (supabaseDataEnabled) {
    const updated = await toggleFollow(req.params.uid, req.authUser!.uid);
    invalidatePublicCaches();
    res.json(updated);
    return;
  }
  const targetRef = firestore.collection('profiles').doc(req.params.uid);
  const updated = await firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(targetRef);
    const data = snapshot.data() || {};
    const followers = Array.isArray(data.followers) ? data.followers.filter((value): value is string => typeof value === 'string') : [];
    const index = followers.indexOf(req.authUser!.uid);
    const isFollowing = index < 0;
    if (isFollowing) followers.push(req.authUser!.uid);
    else followers.splice(index, 1);
    transaction.set(targetRef, { followers, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { followers, isFollowing };
  });
  invalidatePublicCaches();
  res.json(updated);
});

app.get('/api/discovery-events', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (supabaseDataEnabled) {
    const events = await getDiscoveryEvents(req.authUser!.uid);
    res.json(events.filter(event => event.item_id && DISCOVERY_EVENT_TYPES.has(String(event.event_type))));
    return;
  }
  const snapshot = await firestore.collection('discoveryEvents').limit(5000).get();
  const events = snapshot.docs.map(doc => {
    const event = doc.data();
    return {
      itemId: String(event.itemId || ''), eventType: String(event.eventType || 'VIEW'), timestamp: String(event.timestamp || ''),
      sessionId: String(event.sessionId || ''), ...(event.userId === req.authUser!.uid ? { userId: req.authUser!.uid } : {}),
    };
  }).filter(event => event.itemId && DISCOVERY_EVENT_TYPES.has(event.eventType));
  res.json(events);
});

app.post('/api/discovery-events', requireAuth, async (req: AuthenticatedRequest, res) => {
  const itemId = typeof req.body?.itemId === 'string' ? req.body.itemId.trim().slice(0, 160) : '';
  const eventType = typeof req.body?.eventType === 'string' ? req.body.eventType : '';
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim().slice(0, 120) : '';
  if (!itemId || !DISCOVERY_EVENT_TYPES.has(eventType) || !sessionId) {
    res.status(400).json({ error: 'A valid item, event type, and session are required.' });
    return;
  }
  const event = {
    user_id: req.authUser!.uid, item_id: itemId, event_type: eventType, session_id: sessionId, timestamp: new Date().toISOString(),
  };
  if (supabaseDataEnabled) {
    const created = await createDiscoveryEvent(event);
    res.status(201).json({ id: created.id, ...event });
    return;
  }
  const created = await firestore.collection('discoveryEvents').add({ userId: event.user_id, itemId, eventType, sessionId, timestamp: event.timestamp });
  res.status(201).json({ id: created.id, ...event });
});

app.get('/api/listings/mine', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const listings = await getSellerListings(req.authUser!.uid);
    const enriched = await Promise.all(listings.map(async listing => {
      const interactions = await getPostInteractions(String(listing.id));
      const ratings = Object.values(interactions.ratings).map(Number);
      const author = listing.author as Record<string, unknown> || {};
      return {
        ...snakeToCamel(listing),
        authorId: req.authUser!.uid,
        authorName: author.shop_name || author.name || 'Atelier Member',
        authorRole: author.role || 'tailor',
        authorHandle: author.handle || '@atelier_member',
        authorAvatar: author.avatar_url || '',
        authorLocation: author.location || {},
        authorWhatsapp: author.whatsapp_number || '',
        likes: interactions.likes,
        saves: interactions.saves,
        rating: ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0,
        ratingCount: ratings.length,
        ratingsByUser: interactions.ratings,
      };
    }));
    res.json(enriched);
  } catch (error) {
    console.error('Unable to load seller listings.', error);
    res.status(503).json({ error: 'Your listings could not be loaded right now.' });
  }
});

app.get('/api/admin/listings/moderation', requireAuth, requireAdmin, async (_req, res) => {
  try {
    res.json(snakeToCamel(await getListingsForModeration()));
  } catch (error) {
    console.error('Unable to load moderation queue.', error);
    res.status(503).json({ error: 'The moderation queue could not be loaded right now.' });
  }
});

app.get('/api/admin/listing-reports', requireAuth, requireAdmin, async (_req, res) => {
  try {
    res.json(snakeToCamel(await getListingReports()));
  } catch (error) {
    console.error('Unable to load listing reports.', error);
    res.status(503).json({ error: 'Listing reports could not be loaded right now.' });
  }
});

app.patch('/api/admin/listing-reports/:reportId', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
  const status = req.body?.status;
  if (status !== 'reviewed' && status !== 'dismissed') {
    res.status(400).json({ error: 'Choose reviewed or dismissed.' });
    return;
  }
  await updateListingReport(req.params.reportId, status);
  res.status(204).send();
});

app.post('/api/posts', requireAuth, requireActiveAccount, async (req: AuthenticatedRequest, res) => {
  const input = req.body || {};
  const authorProfile = await readProfile(req.authUser!.uid);
  const authorRole = authorProfile?.role;
  if (authorRole !== 'tailor' && authorRole !== 'fabric_seller') {
    res.status(403).json({ error: 'Only approved tailors and fabric sellers can publish marketplace items.' });
    return;
  }
  const validation = validateListingInput(input, req.authUser!.uid, authorProfile || {});
  if ('error' in validation) {
    res.status(400).json({ error: validation.error });
    return;
  }
  const intent = input.intent === 'draft' ? 'draft' : 'pending_review';
  const timestamp = new Date().toISOString();
  const post = {
    ...validation.value,
    author_id: req.authUser!.uid,
    status: intent,
    moderation_status: 'pending',
    moderation_note: '',
    created_at: timestamp,
    updated_at: timestamp,
    published_at: null,
    is_promoted: authorProfile?.isPromoted === true || authorProfile?.is_promoted === true,
    is_blocked: false,
  };
  if (supabaseDataEnabled) {
    const created = await createPostWithUser(post, req.authUser!.uid);
    const createdId = String(created.id);
    await recordListingChange(createdId, req.authUser!.uid, intent === 'draft' ? 'draft_created' : 'submitted_for_review');
    invalidatePublicCaches();
    res.status(201).json({ id: createdId, ...snakeToCamel(post), authorId: req.authUser!.uid, authorRole, authorName: authorProfile?.shopName || authorProfile?.name, likes: [], saves: [] });
    return;
  }
  res.status(503).json({ error: 'Listing publishing requires the configured Supabase database.' });
});

app.put('/api/posts/:postId', requireAuth, requireActiveAccount, async (req: AuthenticatedRequest, res) => {
  const existing = await getPost(req.params.postId);
  if (!existing) {
    res.status(404).json({ error: 'That listing is no longer available.' });
    return;
  }
  if (existing.author_id !== req.authUser!.uid) {
    res.status(403).json({ error: 'You can only edit your own listings.' });
    return;
  }
  const profile = await readProfile(req.authUser!.uid);
  const validation = validateListingInput(req.body || {}, req.authUser!.uid, profile || {}, typeof existing.image_url === 'string' ? existing.image_url : undefined);
  if ('error' in validation) {
    res.status(400).json({ error: validation.error });
    return;
  }
  const timestamp = new Date().toISOString();
  const nextStatus = req.body?.intent === 'draft' ? 'draft' : 'pending_review';
  const values = {
    ...validation.value,
    status: nextStatus,
    moderation_status: 'pending',
    moderation_note: '',
    published_at: null,
    updated_at: timestamp,
  };
  const updated = await updateListing(req.params.postId, values);
  const changes = Object.fromEntries(Object.entries(validation.value)
    .filter(([field, value]) => JSON.stringify(existing[field] ?? null) !== JSON.stringify(value))
    .map(([field, value]) => [field, { from: existing[field] ?? null, to: value }]));
  await recordListingChange(req.params.postId, req.authUser!.uid, nextStatus === 'draft' ? 'draft_updated' : 'resubmitted_for_review', {
    changes,
  });
  invalidatePublicCaches();
  res.json(snakeToCamel(updated));
});

app.patch('/api/posts/:postId/status', requireAuth, requireActiveAccount, async (req: AuthenticatedRequest, res) => {
  const listing = await getPost(req.params.postId);
  if (!listing) {
    res.status(404).json({ error: 'That listing is no longer available.' });
    return;
  }
  if (listing.author_id !== req.authUser!.uid) {
    res.status(403).json({ error: 'You can only manage your own listings.' });
    return;
  }
  const action = req.body?.action;
  const timestamp = new Date().toISOString();
  let values: Record<string, unknown>;
  let auditAction: string;
  if (action === 'publish') {
    const details = listing && typeof listing.listing_details === 'object' ? listing.listing_details as Record<string, unknown> : {};
    const availability = details.fulfilment === 'made_to_order'
      ? 'made_to_order'
      : Number(listing.stock_quantity) > 0 ? 'limited' : 'available';
    values = { status: 'pending_review', moderation_status: 'pending', moderation_note: '', availability, published_at: null };
    auditAction = 'submitted_for_review';
  } else if (action === 'pause' && listing.status === 'published') {
    values = { status: 'paused' };
    auditAction = 'paused';
  } else if (action === 'archive') {
    values = { status: 'archived' };
    auditAction = 'archived';
  } else if (action === 'sold_out' && listing.status === 'published') {
    values = { status: 'sold_out' };
    auditAction = 'marked_sold_out';
  } else {
    res.status(400).json({ error: 'That listing status change is not allowed.' });
    return;
  }
  const updated = await updateListing(req.params.postId, { ...values, updated_at: timestamp });
  await recordListingChange(req.params.postId, req.authUser!.uid, auditAction);
  invalidatePublicCaches();
  res.json(snakeToCamel(updated));
});

app.patch('/api/admin/listings/:listingId/moderation', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
  const listing = await getPost(req.params.listingId);
  if (!listing || listing.status !== 'pending_review' || listing.moderation_status !== 'pending') {
    res.status(404).json({ error: 'The listing is not waiting for moderation.' });
    return;
  }
  const decision = req.body?.decision;
  if (decision !== 'approve' && decision !== 'reject') {
    res.status(400).json({ error: 'Choose approve or reject.' });
    return;
  }
  const timestamp = new Date().toISOString();
  const reason = listingText(req.body?.reason, 300);
  const values = decision === 'approve'
    ? { status: 'published', moderation_status: 'approved', moderation_note: '', published_at: timestamp, updated_at: timestamp }
    : { status: 'rejected', moderation_status: 'rejected', moderation_note: reason, published_at: null, updated_at: timestamp };
  const updated = await updateListing(req.params.listingId, values);
  await recordListingChange(req.params.listingId, req.authUser!.uid, decision === 'approve' ? 'approved' : 'rejected', {
    reason,
  });
  if (decision === 'approve') {
    const author = listing.author as Record<string, unknown> || {};
    const authorHandle = String(author.handle || '').replace(/^@/, '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-') || 'atelier';
    void sendTopicPush('marketplace_updates', 'New atelier listing', `${String(listing.title || 'A new listing')} is now available.`, `/@${authorHandle}/post/${encodeURIComponent(req.params.listingId)}`, 'new-post');
  }
  invalidatePublicCaches();
  res.json(snakeToCamel(updated));
});

app.post('/api/posts/:postId/report', requireAuth, async (req: AuthenticatedRequest, res) => {
  const listing = await getPost(req.params.postId);
  if (!listing || listing.status !== 'published' || listing.moderation_status !== 'approved') {
    res.status(404).json({ error: 'That published listing could not be found.' });
    return;
  }
  const reason = listingText(req.body?.reason, 80);
  const details = listingText(req.body?.details, 1000);
  if (!['Misleading content', 'Prohibited item', 'Impersonation', 'Inappropriate content', 'Other'].includes(reason)) {
    res.status(400).json({ error: 'Choose a valid report reason.' });
    return;
  }
  try {
    await createListingReport(req.params.postId, req.authUser!.uid, reason, details);
    res.status(201).json({ ok: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      res.status(409).json({ error: 'You have already reported this listing.' });
      return;
    }
    throw error;
  }
});

app.post('/api/posts/:postId/rating', requireAuth, async (req: AuthenticatedRequest, res) => {
  const rating = Number(req.body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: 'Rating must be an integer from 1 to 5.' });
    return;
  }
  const post = await getPost(req.params.postId);
  if (!post || (supabaseDataEnabled && (post.status !== 'published' || post.moderation_status !== 'approved' || post.deleted_at))) {
    res.status(404).json({ error: 'That published marketplace listing no longer exists.' });
    return;
  }
  if (supabaseDataEnabled) {
    const result = await setRating(req.params.postId, req.authUser!.uid, rating);
    invalidatePublicCaches();
    res.json(result);
    return;
  }
  const postRef = firestore.collection('posts').doc(req.params.postId);
  const ratingRef = postRef.collection('ratings').doc(req.authUser!.uid);
  await firestore.runTransaction(async (transaction: Transaction) => {
    transaction.set(ratingRef, { rating, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(postRef, { updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  const ratingsSnapshot = await postRef.collection('ratings').get();
  const validRatings = ratingsSnapshot.docs.map(doc => ({ userId: doc.id, rating: Number(doc.data().rating) })).filter(item => item.rating >= 1 && item.rating <= 5);
  invalidatePublicCaches();
  res.json({ rating: validRatings.length ? validRatings.reduce((sum, item) => sum + item.rating, 0) / validRatings.length : 0, ratingCount: validRatings.length, ratingsByUser: Object.fromEntries(validRatings.map(item => [item.userId, item.rating])) });
});

app.get('/api/messages', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (supabaseDataEnabled) {
    res.json(snakeToCamel(await getMessages(req.authUser!.uid)));
    return;
  }
  const [sent, received] = await Promise.all([
    firestore.collection('messages').where('senderId', '==', req.authUser!.uid).limit(200).get(),
    firestore.collection('messages').where('recipientId', '==', req.authUser!.uid).limit(200).get(),
  ]);
  const messages = [...sent.docs, ...received.docs].map<StoredMessage>(doc => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })).sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
  res.json(messages);
});

app.post('/api/messages/read', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (supabaseDataEnabled) {
    await markMessagesRead(req.authUser!.uid);
    res.status(204).send();
    return;
  }
  const snapshot = await firestore.collection('messages')
    .where('recipientId', '==', req.authUser!.uid)
    .limit(200)
    .get();
  const unreadMessages = snapshot.docs.filter(doc => doc.data().isRead !== true);
  if (unreadMessages.length > 0) {
    const batch = firestore.batch();
    unreadMessages.forEach(doc => batch.update(doc.ref, { isRead: true, readAt: FieldValue.serverTimestamp() }));
    await batch.commit();
  }
  res.status(204).send();
});

app.delete('/api/admin/messages/:messageId', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  if (supabaseDataEnabled) {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { data, error } = await supabase.from('messages').select('sender_id, sender_role').eq('id', req.params.messageId).maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: 'Message not found.' });
      return;
    }
    if (data.sender_id !== req.authUser!.uid && data.sender_role !== 'admin') {
      res.status(403).json({ error: 'Administrators can only delete messages they sent or platform announcements.' });
      return;
    }
    await deleteMessage(req.params.messageId);
    res.status(204).send();
    return;
  }
  const messageRef = firestore.collection('messages').doc(req.params.messageId);
  const message = await messageRef.get();
  if (!message.exists) {
    res.status(404).json({ error: 'Message not found.' });
    return;
  }
  const data = message.data() || {};
  if (data.senderId !== req.authUser!.uid && data.senderRole !== 'admin' && data.senderId !== 'atelier-system') {
    res.status(403).json({ error: 'Administrators can only delete messages they sent or platform announcements.' });
    return;
  }
  await messageRef.delete();
  res.status(204).send();
});

app.post('/api/messages', requireAuth, requireActiveAccount, async (req: AuthenticatedRequest, res) => {
  const input = req.body || {};
  if (input.senderId !== req.authUser!.uid || typeof input.recipientId !== 'string' || typeof input.content !== 'string' || !input.content.trim()) {
    res.status(400).json({ error: 'Invalid message.' });
    return;
  }
  const recipient = await readProfile(input.recipientId);
  if (!recipient) {
    res.status(404).json({ error: 'That recipient no longer exists.' });
    return;
  }
  if (req.authUser!.admin && recipient.role !== 'tailor' && recipient.role !== 'fabric_seller') {
    res.status(403).json({ error: 'Administrators can only message tailors and fabric sellers.' });
    return;
  }
  if (recipient.isBlocked === true) {
    res.status(403).json({ error: 'This seller is currently unavailable for messaging.' });
    return;
  }
  const message = {
    sender_id: req.authUser!.uid, sender_name: String(input.senderName || '').slice(0, 120), sender_role: String(input.senderRole || 'buyer'),
    recipient_id: input.recipientId, recipient_name: String(input.recipientName || '').slice(0, 120),
    post_id: typeof input.postId === 'string' ? input.postId : '', post_title: typeof input.postTitle === 'string' ? input.postTitle.slice(0, 160) : '',
    content: input.content.trim().slice(0, 3000), timestamp: new Date().toISOString(), is_read: false,
  };
  if (supabaseDataEnabled) {
    const created = await createMessage(message);
    void sendTopicPush(`user_${message.recipient_id}`, `New message from ${message.sender_name}`, message.content.slice(0, 180), '/', 'message');
    res.status(201).json({ id: created.id, ...message, senderId: message.sender_id, recipientId: message.recipient_id, isRead: false });
    return;
  }
  const created = await firestore.collection('messages').add({ senderId: message.sender_id, senderName: message.sender_name, senderRole: message.sender_role, recipientId: message.recipient_id, recipientName: message.recipient_name, postId: message.post_id, postTitle: message.post_title, content: message.content, timestamp: message.timestamp, isRead: false });
  void sendTopicPush(`user_${message.recipient_id}`, `New message from ${message.sender_name}`, message.content.slice(0, 180), '/', 'message');
  res.status(201).json({ id: created.id, ...message, senderId: message.sender_id, recipientId: message.recipient_id, isRead: false });
});

app.post('/api/admin/broadcast', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
  const target = ['all', 'sellers', 'buyers'].includes(String(req.body?.target)) ? String(req.body.target) : 'all';
  const title = String(req.body?.title || '').trim().slice(0, 160);
  const body = String(req.body?.body || '').trim().slice(0, 3000);
  if (!title || !body) {
    res.status(400).json({ error: 'Broadcast title and message are required.' });
    return;
  }
  const recipients = supabaseDataEnabled
    ? (await getUsers()).filter(profile => {
        const role = String(profile.role || '');
        return target === 'all' || (target === 'sellers' && (role === 'tailor' || role === 'fabric_seller')) || (target === 'buyers' && role === 'buyer');
      })
    : (await firestore.collection('profiles').limit(500).get()).docs
        .filter(doc => {
          const role = doc.data().role;
          return target === 'all' || (target === 'sellers' && (role === 'tailor' || role === 'fabric_seller')) || (target === 'buyers' && role === 'buyer');
        });
  const createdAt = new Date().toISOString();
  if (supabaseDataEnabled) {
    await createBroadcast(recipients.map(profile => ({
      user_id: String(profile.id), title, body, type: 'system', created_at: createdAt, is_read: false, action_url: '/',
    })));
    await Promise.all(recipients.map(profile => sendTopicPush(`user_${String(profile.id)}`, title, body.slice(0, 180), '/', 'broadcast')));
  } else {
    const batch = firestore.batch();
    recipients.forEach(doc => {
      const recipientId = String(doc.id);
      const ref = firestore.collection('profiles').doc(recipientId).collection('notifications').doc();
      batch.set(ref, { userId: recipientId, title, body, type: 'system', createdAt, isRead: false, actionUrl: '/' });
    });
    await batch.commit();
    await Promise.all(recipients.map(doc => sendTopicPush(`user_${String(doc.id)}`, title, body.slice(0, 180), '/', 'broadcast')));
  }
  res.status(201).json({ id: `broadcast-${Date.now()}`, sender: String(req.body?.sender || 'Atelier Administration'), target, title, body, createdAt });
});

app.post('/api/posts/:postId/like', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (supabaseDataEnabled) {
    const listing = await getPost(req.params.postId);
    if (!listing || listing.status !== 'published' || listing.moderation_status !== 'approved' || listing.deleted_at) {
      res.status(404).json({ error: 'That published listing no longer exists.' });
      return;
    }
    const result = await toggleLike(req.params.postId, req.authUser!.uid);
    invalidatePublicCaches();
    res.json(result);
    return;
  }
  const postRef = firestore.collection('posts').doc(req.params.postId);
  if (!(await postRef.get()).exists) {
    res.status(404).json({ error: 'That marketplace item no longer exists.' });
    return;
  }
  const likeRef = postRef.collection('likes').doc(req.authUser!.uid);
  const result = await firestore.runTransaction(async transaction => {
    const like = await transaction.get(likeRef);
    if (like.exists) transaction.delete(likeRef);
    else transaction.set(likeRef, { createdAt: FieldValue.serverTimestamp() });
    return !like.exists;
  });
  const likesSnapshot = await postRef.collection('likes').get();
  invalidatePublicCaches();
  res.json({ isLiked: result, likesCount: likesSnapshot.size });
});

app.post('/api/posts/:postId/save', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (supabaseDataEnabled) {
    const listing = await getPost(req.params.postId);
    if (!listing || listing.status !== 'published' || listing.moderation_status !== 'approved' || listing.deleted_at) {
      res.status(404).json({ error: 'That published listing no longer exists.' });
      return;
    }
    const result = await toggleSave(req.params.postId, req.authUser!.uid);
    invalidatePublicCaches();
    res.json(result);
    return;
  }
  const postRef = firestore.collection('posts').doc(req.params.postId);
  if (!(await postRef.get()).exists) {
    res.status(404).json({ error: 'That marketplace item no longer exists.' });
    return;
  }
  const saveRef = postRef.collection('saves').doc(req.authUser!.uid);
  const isSaved = await firestore.runTransaction(async transaction => {
    const existing = await transaction.get(saveRef);
    if (existing.exists) transaction.delete(saveRef);
    else transaction.set(saveRef, { createdAt: FieldValue.serverTimestamp() });
    return !existing.exists;
  });
  const savesSnapshot = await postRef.collection('saves').get();
  invalidatePublicCaches();
  res.json({ isSaved, savesCount: savesSnapshot.size });
});

app.delete('/api/posts/:postId', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (supabaseDataEnabled) {
    const listing = await getPost(req.params.postId);
    if (!listing) {
      res.status(204).send();
      return;
    }
    if (listing.author_id !== req.authUser!.uid && !req.authUser!.admin) {
      res.status(403).json({ error: 'You cannot delete this listing.' });
      return;
    }
    await softDeleteListing(req.params.postId, new Date().toISOString());
    await recordListingChange(req.params.postId, req.authUser!.uid, 'deleted');
    invalidatePublicCaches();
    res.status(204).send();
    return;
  }
  const postRef = firestore.collection('posts').doc(req.params.postId);
  const post = await postRef.get();
  if (!post.exists) {
    res.status(204).send();
    return;
  }

  const profile = await firestore.collection('profiles').doc(req.authUser!.uid).get();
  const profileData = profile.exists ? profile.data() as Record<string, unknown> : {};
  const isAdminUser = Boolean(req.authUser!.admin || profileData.role === 'admin');

  if (post.data()?.authorId !== req.authUser!.uid && !isAdminUser) {
    res.status(403).json({ error: 'You cannot delete this post.' });
    return;
  }

  await postRef.delete();
  invalidatePublicCaches();
  res.status(204).send();
});

app.post('/api/fabric-requests', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const input = req.body || {};
  const quantity = Number(input.quantity);
  const postId = typeof input.postId === 'string' ? input.postId : '';
  const sellerId = typeof input.sellerId === 'string' ? input.sellerId : '';

  if (input.buyerId !== req.authUser!.uid || !postId || !sellerId || !Number.isFinite(quantity) || quantity <= 0) {
    res.status(400).json({ error: 'A valid buyer, seller, post, and quantity are required.' });
    return;
  }

  if (supabaseDataEnabled) {
    const [post, seller] = await Promise.all([getPost(postId), readProfile(sellerId)]);
    if (!post || post.author_id !== sellerId || !seller) {
      res.status(400).json({ error: 'The selected marketplace item is no longer available.' });
      return;
    }
    const request = {
      post_id: postId,
      post_title: String(input.postTitle || post.title || '').trim().slice(0, 160),
      post_image_url: String(input.postImageUrl || post.image_url || '').slice(0, 2_000_000),
      seller_id: sellerId,
      seller_name: String(input.sellerName || seller.shopName || seller.name || '').trim().slice(0, 120),
      seller_role: seller.role === 'fabric_seller' ? 'fabric_seller' : 'tailor',
      buyer_id: req.authUser!.uid,
      buyer_name: String(input.buyerName || '').trim().slice(0, 120),
      buyer_email: String(input.buyerEmail || req.authUser!.email || '').trim().slice(0, 200),
      quantity: Math.min(quantity, 100000),
      quantity_unit: ['yards', 'meters', 'pieces'].includes(input.quantityUnit) ? input.quantityUnit : 'pieces',
      preferred_color: typeof input.preferredColor === 'string' ? input.preferredColor.trim().slice(0, 80) : '',
      budget: Number.isFinite(Number(input.budget)) && Number(input.budget) > 0 ? Math.min(Number(input.budget), 1_000_000_000) : null,
      currency: String(input.currency || 'USD').slice(0, 8),
      delivery_location: String(input.deliveryLocation || '').trim().slice(0, 240),
      needed_by: typeof input.neededBy === 'string' ? input.neededBy.slice(0, 10) : '',
      notes: String(input.notes || '').trim().slice(0, 2000),
      status: 'new',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const created = await createFabricRequest(request);
    void sendTopicPush(`user_${sellerId}`, 'New fabric inquiry', `${request.buyer_name} requested ${request.post_title}.`, '/', 'fabric-inquiry');
    res.status(201).json(snakeToCamel(created));
    return;
  }

  const postSnapshot = await firestore.collection('posts').doc(postId).get();
  if (!postSnapshot.exists || postSnapshot.data()?.authorId !== sellerId) {
    res.status(400).json({ error: 'The selected marketplace item is no longer available.' });
    return;
  }

  const post = postSnapshot.data() || {};
  const request = {
    postId,
    postTitle: String(input.postTitle || post.title || '').trim().slice(0, 160),
    postImageUrl: String(input.postImageUrl || post.imageUrl || '').slice(0, 2_000_000),
    sellerId,
    sellerName: String(input.sellerName || '').trim().slice(0, 120),
    sellerRole: input.sellerRole === 'fabric_seller' ? 'fabric_seller' : 'tailor',
    buyerId: req.authUser!.uid,
    buyerName: String(input.buyerName || '').trim().slice(0, 120),
    buyerEmail: String(input.buyerEmail || req.authUser!.email || '').trim().slice(0, 200),
    quantity: Math.min(quantity, 100000),
    quantityUnit: ['yards', 'meters', 'pieces'].includes(input.quantityUnit) ? input.quantityUnit : 'pieces',
    preferredColor: typeof input.preferredColor === 'string' ? input.preferredColor.trim().slice(0, 80) : '',
    budget: Number.isFinite(Number(input.budget)) && Number(input.budget) > 0 ? Math.min(Number(input.budget), 1_000_000_000) : null,
    currency: String(input.currency || 'USD').slice(0, 8),
    deliveryLocation: String(input.deliveryLocation || '').trim().slice(0, 240),
    neededBy: typeof input.neededBy === 'string' ? input.neededBy.slice(0, 10) : '',
    notes: String(input.notes || '').trim().slice(0, 2000),
    status: 'new',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const created = await firestore.collection('fabricRequests').add(request);
  void sendTopicPush(`user_${request.sellerId}`, 'New fabric inquiry', `${request.buyerName} requested ${request.postTitle}.`, '/', 'fabric-inquiry');
  res.status(201).json({ id: created.id, ...request });
});

app.get('/api/fabric-requests', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (supabaseDataEnabled) {
    const records = await getFabricRequests(req.authUser!.uid);
    const unique = new Map<string, Record<string, unknown>>();
    records.forEach(record => unique.set(String(record.id), snakeToCamel(record)));
    const requests = [...unique.values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    res.json(requests);
    return;
  }
  const [buyerRequests, sellerRequests] = await Promise.all([
    firestore.collection('fabricRequests').where('buyerId', '==', req.authUser!.uid).limit(200).get(),
    firestore.collection('fabricRequests').where('sellerId', '==', req.authUser!.uid).limit(200).get(),
  ]);
  const unique = new Map<string, Record<string, unknown>>();
  [...buyerRequests.docs, ...sellerRequests.docs].forEach(doc => unique.set(doc.id, { id: doc.id, ...doc.data() }));
  const requests = [...unique.values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  res.json(requests);
});

app.patch('/api/fabric-requests/:requestId/status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const status = ['new', 'reviewed', 'quoted', 'closed'].includes(req.body?.status) ? req.body.status : null;
  const requestRef = firestore.collection('fabricRequests').doc(req.params.requestId);
  const requestSnapshot = await requestRef.get();
  const requestData = requestSnapshot.data();
  if (!requestSnapshot.exists || (!req.authUser!.admin && requestData?.sellerId !== req.authUser!.uid && requestData?.buyerId !== req.authUser!.uid)) {
    res.status(403).json({ error: 'You cannot update this request.' });
    return;
  }
  if (!status) {
    res.status(400).json({ error: 'Invalid request status.' });
    return;
  }
  if (supabaseDataEnabled) {
    const records = await getFabricRequests(req.authUser!.uid);
    const request = records.find(record => String(record.id) === req.params.requestId);
    if (!request || (!req.authUser!.admin && request.seller_id !== req.authUser!.uid && request.buyer_id !== req.authUser!.uid)) {
      res.status(403).json({ error: 'You cannot update this request.' });
      return;
    }
    const updatedAt = new Date().toISOString();
    const updated = await updateFabricRequest(req.params.requestId, { status, updated_at: updatedAt });
    res.json(snakeToCamel(updated));
    return;
  }
  const updatedAt = new Date().toISOString();
  await requestRef.set({ status, updatedAt }, { merge: true });
  res.json({ id: requestSnapshot.id, ...requestData, status, updatedAt });
});

app.post('/api/admin/users/:uid/block', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
  const blocked = Boolean(req.body?.blocked);
  if (supabaseDataEnabled) {
    const profile = await readProfile(req.params.uid);
    const targetRole = profile?.role;
    const isSuperAdmin = req.authUser?.email?.trim().toLowerCase() === 'fountainsdata234@gmail.com';
    if (!profile) {
      res.status(404).json({ error: 'User profile not found.' });
      return;
    }
    if (targetRole === 'admin' && !isSuperAdmin) {
      res.status(403).json({ error: 'Only the Super Admin can block an administrator.' });
      return;
    }
    if (targetRole !== 'tailor' && targetRole !== 'fabric_seller' && targetRole !== 'admin') {
      res.status(403).json({ error: 'Customer accounts cannot be blocked.' });
      return;
    }
    await writeProfile(req.params.uid, { isBlocked: blocked, updatedAt: new Date().toISOString() });
    invalidatePublicCaches();
    res.json({ ok: true, blocked });
    return;
  }
  const profileRef = firestore.collection('profiles').doc(req.params.uid);
  const profileSnapshot = await profileRef.get();
  const targetRole = profileSnapshot.data()?.role;
  const isSuperAdmin = req.authUser?.email?.trim().toLowerCase() === 'fountainsdata234@gmail.com';
  if (targetRole === 'admin' && !isSuperAdmin) {
    res.status(403).json({ error: 'Only the Super Admin can block an administrator.' });
    return;
  }
  if (targetRole !== 'tailor' && targetRole !== 'fabric_seller' && targetRole !== 'admin') {
    res.status(403).json({ error: 'Customer accounts cannot be blocked.' });
    return;
  }
  await profileRef.set({ isBlocked: blocked, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await adminAuth.updateUser(req.params.uid, { disabled: blocked });
  res.json({ ok: true, blocked });
});

app.delete('/api/admin/sellers/:uid', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
  const uid = req.params.uid;
  if (uid === req.authUser!.uid) {
    res.status(400).json({ error: 'You cannot delete your own administrator account.' });
    return;
  }

  if (supabaseDataEnabled) {
    const profile = await readProfile(uid);
    if (!profile) {
      res.status(404).json({ error: 'Seller profile not found.' });
      return;
    }
    if (profile.role !== 'tailor' && profile.role !== 'fabric_seller') {
      res.status(403).json({ error: 'Only tailor and fabric seller accounts can be deleted here.' });
      return;
    }
    await deleteSupabaseAccount(uid);
    res.status(204).send();
    return;
  }

  const profileRef = firestore.collection('profiles').doc(uid);
  const profileSnapshot = await profileRef.get();
  if (!profileSnapshot.exists) {
    res.status(404).json({ error: 'Seller profile not found.' });
    return;
  }
  const role = profileSnapshot.data()?.role;
  if (role !== 'tailor' && role !== 'fabric_seller') {
    res.status(403).json({ error: 'Only tailor and fabric seller accounts can be deleted here.' });
    return;
  }

  const postsSnapshot = await firestore.collection('posts').where('authorId', '==', uid).get();
  const messages = await Promise.all([
    firestore.collection('messages').where('senderId', '==', uid).get(),
    firestore.collection('messages').where('recipientId', '==', uid).get(),
  ]);
  const batch = firestore.batch();
  messages.flatMap(snapshot => snapshot.docs).forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  await Promise.all(postsSnapshot.docs.map(post => firestore.recursiveDelete(post.ref)));
  await firestore.recursiveDelete(profileRef);
  try {
    await adminAuth.deleteUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
  }
  res.status(204).send();
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'Images must be 15 MB or smaller.' });
    return;
  }
  console.error('API error', error);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(port, () => {
  console.log(`Atelier API listening on http://localhost:${port}`);
});
