import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getMessaging } from 'firebase-admin/messaging';
import { FieldValue } from 'firebase-admin/firestore';
import type { Transaction } from 'firebase-admin/firestore';
import multer from 'multer';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import { listLocationCountries, listLocationCurrencies, listLocationRegions, resolveMapLocation, searchLocationCities } from './locationData.js';
import { adminAuth, firebaseAdminEnabled, firestore } from './firebaseAdmin.js';
import type { UserLocation, UserRole } from '../src/types.js';
import { parseMarketplaceSearch } from '../src/utils/marketplaceSearch.js';
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
  getMarketplacePostsPage,
  getMarketplaceTrendingPage,
  getMarketplaceViewerInteractions,
  getMarketplaceReviewSummaries,
  getMarketplaceReviews,
  getSellerReviewSummaries,
  submitMarketplaceReview,
  getReviewModerationQueue,
  moderateMarketplaceReview,
  respondToMarketplaceReview,
  toggleReviewHelpful,
  reportMarketplaceReview,
  createMarketplaceReviewAppeal,
  resolveMarketplaceReviewAppeal,
  updateReviewReport,
  consumeMarketplaceAbuseLimit,
  getMarketplaceBlockedSellerIds,
  getMarketplaceUserPreferences,
  resetMarketplacePersonalization,
  saveMarketplaceUserPreferences,
  setMarketplaceRecommendationFeedback,
  recordMarketplaceRecommendationImpression,
  isMissingRpcFunction,
  setMarketplaceUserBlock,
  setMarketplaceAccountBlock,
  getMarketplaceAbuseFlags,
  resolveMarketplaceAbuseFlag,
  recordMarketplaceEngagementEvent,
  recordMarketplaceSearchAuditEvent,
  refreshMarketplaceTrends,
  type MarketplaceEngagementEventType,
  type MarketplaceTrendCategory,
  type MarketplaceCursor,
  getSellerListings,
  getProfile,
  getProfileByEmail,
  getPromoPlans,
  getPromoPlansData,
  getSellerCollections,
  removeUserFromFollowers,
  getUsers,
  findNearbySellers,
  listProfiles,
  markMessagesRead,
  markNotificationsRead,
  removePushToken,
  recordListingChange,
  savePromoPlans,
  toggleFollow,
  savePushToken,
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
  type ProfileRecord,
} from './supabaseData.js';

const app = express();
const port = Number(process.env.PORT || 8787);
const gemini = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
app.disable('x-powered-by');
if (!supabaseDataEnabled) {
  throw new Error('Supabase server credentials are required to start the Atelier API.');
}
const configuredOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean);
const allowedOrigins = new Set([
  ...configuredOrigins,
  'https://fabsattire.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://192.168.186.15:3001',
]);

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
  limits: { fileSize: 8 * 1024 * 1024 },
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.has(origin)
      || (process.env.NODE_ENV !== 'production' && isLocalNetworkOrigin(origin))) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
  credentials: true,
}));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.json({ limit: '1mb' }));

interface AuthenticatedRequest extends Request {
  authUser?: {
    uid: string;
    email?: string;
    name?: string;
    avatarUrl?: string;
    admin?: boolean;
    blocked?: boolean;
    userMetadata?: Record<string, unknown>;
  };
}

interface StoredMessage {
  id: string;
  timestamp?: string;
  [key: string]: unknown;
}

const DISCOVERY_EVENT_TYPES = new Set(['VIEW', 'LIKE', 'SAVE', 'SHARE', 'ENQUIRY']);
const PUBLIC_CACHE_TTL_MS = 60_000;
const PUBLIC_CACHE_STALE_MS = 15 * 60_000;
const WEB_APP_URL = process.env.APP_URL?.trim() || 'https://fabsattire.vercel.app';
let postsCache: { expiresAt: number; staleUntil: number; value: unknown } | null = null;
let usersCache: { expiresAt: number; value: unknown } | null = null;
const marketplaceFeedCache = new Map<string, { expiresAt: number; staleUntil: number; value: unknown }>();
const reverseGeocodeCache = new Map<string, { expiresAt: number; value: Record<string, unknown> }>();
const reverseGeocodeRateLimit = new Map<string, number>();
let nominatimQueue: Promise<void> = Promise.resolve();
let lastNominatimRequestAt = 0;

type BusinessLocationTokenPayload = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  location: Pick<UserLocation, 'country' | 'countryCode' | 'state' | 'city'>;
  address: string;
  locationSource?: 'device_geolocation' | 'address_search';
  issuedAt: number;
};

const getLocationSigningSecret = () => process.env.GEOLOCATION_TOKEN_SECRET?.trim()
  || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  || '';

const signLocationPayload = (payload: BusinessLocationTokenPayload) => {
  const secret = getLocationSigningSecret();
  if (!secret) throw new Error('Business location signing secret is not configured.');
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
};

const verifyLocationPayload = (token: unknown): BusinessLocationTokenPayload | null => {
  if (typeof token !== 'string' || token.length > 5000) return null;
  const [encoded, suppliedSignature, extra] = token.split('.');
  const secret = getLocationSigningSecret();
  if (!encoded || !suppliedSignature || extra || !secret) return null;
  const expectedSignature = createHmac('sha256', secret).update(encoded).digest();
  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(suppliedSignature, 'base64url');
  } catch {
    return null;
  }
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as BusinessLocationTokenPayload;
    if (!Number.isFinite(payload.latitude) || payload.latitude < -90 || payload.latitude > 90
      || !Number.isFinite(payload.longitude) || payload.longitude < -180 || payload.longitude > 180
      || !Number.isFinite(payload.accuracyMeters) || payload.accuracyMeters < 0 || payload.accuracyMeters > 100_000
      || !Number.isFinite(payload.issuedAt) || Date.now() - payload.issuedAt > 15 * 60_000
      || typeof payload.address !== 'string'
      || !payload.location || typeof payload.location.country !== 'string') return null;
    return payload;
  } catch {
    return null;
  }
};

const searchBusinessLocationsWithNominatim = async (query: string) => {
  const pending = nominatimQueue.then(async () => {
    const wait = Math.max(0, 1_000 - (Date.now() - lastNominatimRequestAt));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    lastNominatimRequestAt = Date.now();
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({
      format: 'jsonv2',
      q: query,
      addressdetails: '1',
      limit: '5',
    }).toString();
    const response = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'Fabsattire Marketplace/1.0' }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Address search returned HTTP ${response.status}.`);
    return await response.json() as Array<Record<string, unknown>>;
  });
  nominatimQueue = pending.then(() => undefined, () => undefined);
  return pending;
};

const reverseGeocodeWithNominatim = async (latitude: number, longitude: number) => {
  const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const pending = nominatimQueue.then(async () => {
    const wait = Math.max(0, 1_000 - (Date.now() - lastNominatimRequestAt));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    lastNominatimRequestAt = Date.now();
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.search = new URLSearchParams({
      format: 'jsonv2',
      lat: String(latitude),
      lon: String(longitude),
      addressdetails: '1',
      zoom: '18',
    }).toString();
    const response = await fetch(url, {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'Fabsattire Marketplace/1.0',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Reverse geocoder returned HTTP ${response.status}.`);
    const result = await response.json() as Record<string, unknown>;
    if (!result.address || typeof result.address !== 'object' || Array.isArray(result.address)) {
      throw new Error('Reverse geocoder returned no address details.');
    }
    if (reverseGeocodeCache.size >= 2_000) {
      const firstKey = reverseGeocodeCache.keys().next().value;
      if (firstKey) reverseGeocodeCache.delete(firstKey);
    }
    reverseGeocodeCache.set(cacheKey, { expiresAt: Date.now() + 30 * 86_400_000, value: result });
    return result;
  });
  nominatimQueue = pending.then(() => undefined, () => undefined);
  return pending;
};

function setMarketplaceResponseCacheHeaders(req: Request, res: Response) {
  if (req.headers.authorization) {
    res.setHeader('Cache-Control', 'private, no-store');
    return;
  }
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=900, stale-if-error=86400');
}

function invalidatePublicCaches() {
  postsCache = null;
  usersCache = null;
  marketplaceFeedCache.clear();
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

function getPublicSellerLocation(profile: Record<string, unknown>): UserLocation {
  const raw = profile.location && typeof profile.location === 'object' && !Array.isArray(profile.location)
    ? profile.location as Record<string, unknown>
    : {};
  const country = typeof raw.country === 'string' ? raw.country : '';
  const countryCode = typeof raw.countryCode === 'string' ? raw.countryCode : '';
  const state = typeof raw.state === 'string' ? raw.state : '';
  const city = typeof raw.city === 'string' ? raw.city : '';
  const latitude = profile.business_latitude;
  const longitude = profile.business_longitude;
  const isConfirmed = profile.location_status === 'seller_confirmed'
    && typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
  if (!isConfirmed) return { country, countryCode, state, city, verificationStatus: 'needs_confirmation' };
  return {
    country,
    countryCode,
    state,
    city,
    lat: latitude as number,
    lng: longitude as number,
    ...(typeof raw.businessAddress === 'string' ? { businessAddress: raw.businessAddress } : {}),
    ...(typeof profile.location_accuracy_m === 'number' ? { accuracyMeters: profile.location_accuracy_m } : {}),
    verificationStatus: 'seller_confirmed',
    locationSource: 'device_geolocation',
    ...(typeof profile.location_confirmed_at === 'string' ? { confirmedAt: profile.location_confirmed_at } : {}),
  };
}

function pushTokenDocumentId(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function currencyMinorUnitMultiplier(currency: string): number | null {
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  try {
    const fractionDigits = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits;
    return 10 ** (fractionDigits ?? 2);
  } catch {
    return null;
  }
}

function serializeRecommendationPreferences(values: Record<string, unknown> | null) {
  if (!values) return null;
  const currency = String(values.currency || '').trim().toUpperCase();
  const multiplier = currencyMinorUnitMultiplier(currency) || 100;
  const minorToAmount = (value: unknown) => {
    const minor = typeof value === 'number' ? value
      : typeof value === 'string' && /^\d+$/.test(value) ? Number(value)
      : Number.NaN;
    return Number.isSafeInteger(minor) ? minor / multiplier : null;
  };
  return {
    enabled: values.consented_to_personalization === true,
    categories: Array.isArray(values.preferred_categories) ? values.preferred_categories : [],
    styles: Array.isArray(values.preferred_styles) ? values.preferred_styles : [],
    minimumPrice: minorToAmount(values.minimum_price_minor),
    maximumPrice: minorToAmount(values.maximum_price_minor),
    currency,
    country: String(values.preferred_country || ''),
    state: String(values.preferred_region || ''),
  };
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
      userMetadata,
    };
    next();
  } catch (error) {
    console.error('Unable to load authenticated profile.', error);
    res.status(503).json({ error: 'Authentication service is temporarily unavailable. Please try again shortly.' });
  }
}

function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.headers.authorization) {
    next();
    return;
  }
  void requireAuth(req, res, next);
}

function requireActiveAccount(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.authUser?.blocked) {
    res.status(403).json({ error: 'This account is blocked. Publishing and messaging are disabled until an administrator unblocks it.' });
    return;
  }
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.authUser?.blocked) {
    res.status(403).json({ error: 'Blocked accounts cannot access administrator tools.' });
    return;
  }
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

type AdminAiPendingAction = {
  id: string;
  expiresAt: number;
  actorId: string;
  targetId: string;
  action: 'block' | 'warn' | 'promote' | 'pause_listing' | 'archive_listing' | 'approve_listing' | 'reject_listing' | 'broadcast';
  reason: string;
  listingId?: string;
  broadcast?: { target: 'all' | 'sellers' | 'buyers'; title: string; body: string };
};
const adminAiPendingActions = new Map<string, AdminAiPendingAction>();

const adminAiCorrections: Record<string, string> = {
  seach: 'search', serach: 'search', findd: 'find', shwo: 'show', profle: 'profile',
  tailro: 'tailor', tailer: 'tailor', merchanet: 'merchant', merhcant: 'merchant',
  warnn: 'warn', warnning: 'warn', bloock: 'block', blok: 'block', promot: 'promote',
  promte: 'promote', sellerz: 'sellers', merchat: 'merchant', merchnt: 'merchant',
};

const adminAiVocabulary = new Set([
  'search', 'find', 'show', 'get', 'open', 'profile', 'seller', 'sellers', 'tailor',
  'tailors', 'merchant', 'merchants', 'fabric', 'warn', 'block', 'promote', 'please',
  'the', 'for', 'me', 'account', 'accounts', 'top', 'new', 'latest',   'whatsapp', 'listing', 'listings', 'post', 'posts', 'pause', 'archive', 'approve',
  'reject', 'broadcast', 'announce', 'announcement', 'analytics', 'overview', 'stats',
  'statistics', 'users', 'buyers', 'live', 'published', 'blocked', 'promoted',
]);

const editDistance = (left: string, right: string) => {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let column = 1; column <= left.length; column += 1) {
    let previous = row[0];
    row[0] = column;
    for (let index = 1; index <= right.length; index += 1) {
      const current = row[index];
      row[index] = Math.min(
        row[index] + 1,
        row[index - 1] + 1,
        previous + (left[column - 1] === right[index - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[right.length];
};

const normalizeAdminAiPrompt = (prompt: string) => prompt
  .toLowerCase()
  .replace(/[^\p{L}\p{N}@._' -]/gu, ' ')
  .split(/\s+/)
  .filter(Boolean)
  .map(word => {
    if (adminAiCorrections[word]) return adminAiCorrections[word];
    if (word.startsWith('@') || word.length < 4) return word;
    const closeWord = [...adminAiVocabulary].find(candidate => (
      editDistance(word, candidate) <= Math.max(1, Math.floor(candidate.length * 0.25))
    ));
    return closeWord || word;
  })
  .join(' ');

const adminAiIntentWords = adminAiVocabulary;

function requireAbuseLimit(action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    void enforceAbuseLimit(req as AuthenticatedRequest, res, action)
      .then(allowed => {
        if (allowed) next();
      })
      .catch(next);
  };
}

async function enforceAbuseLimit(
  req: AuthenticatedRequest,
  res: Response,
  action: string,
  targetId?: string,
): Promise<boolean> {
  const allowed = await consumeMarketplaceAbuseLimit({
    action,
    actorId: req.authUser!.uid,
    targetId,
  });
  if (!allowed) {
    res.status(429).json({ error: 'This action is temporarily limited. Please try again later.' });
    return false;
  }
  return true;
}

function reviewRoute(handler: (req: AuthenticatedRequest, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req as AuthenticatedRequest, res).catch(error => {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      const message = error instanceof Error ? error.message : 'Review request failed.';
      if (code === '42501') {
        res.status(403).json({ error: "You don't have permission to perform this action.", code: 'FORBIDDEN' });
      } else if (code === '22023') {
        const safeMessage = message === 'Review submission limit reached. Try again tomorrow.'
          || message === 'The 14-day review edit window has ended'
          ? message
          : 'Please check your review details and try again.';
        res.status(400).json({ error: safeMessage, code: 'INVALID_REVIEW' });
      } else if (code === '23505') {
        res.status(409).json({ error: 'A matching review, report, or appeal already exists.', code: 'ALREADY_EXISTS' });
      } else if (code === 'P0002') {
        res.status(404).json({ error: 'This review or listing is no longer available.', code: 'NOT_FOUND' });
      } else {
        next(error);
      }
    });
  };
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

app.get('/api/location/countries', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.json(listLocationCountries());
});

app.get('/api/location/currencies', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.json(listLocationCurrencies());
});

app.get('/api/location/search-business', requireAuth, requireActiveAccount, async (req: AuthenticatedRequest, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 160) : '';
  if (query.length < 3) {
    res.status(400).json({ error: 'Enter at least 3 characters to search for a shop address.' });
    return;
  }
  try {
    const results = await searchBusinessLocationsWithNominatim(query);
    const locations = results.flatMap(result => {
      const latitude = Number(result.lat);
      const longitude = Number(result.lon);
      const address = result.address && typeof result.address === 'object' ? result.address as Record<string, unknown> : {};
      const text = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 120) : '';
      const country = text(address.country);
      const city = text(address.city || address.town || address.village || address.municipality || address.suburb);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !country || !city) return [];
      const location: UserLocation = {
        country,
        countryCode: text(address.country_code).toUpperCase(),
        state: text(address.state || address.province || address.region || address.county),
        city,
        lat: latitude,
        lng: longitude,
        businessAddress: text(result.display_name),
      };
      return [{ location, confirmationToken: signLocationPayload({ latitude, longitude, accuracyMeters: 0, location, address: location.businessAddress || query, locationSource: 'address_search', issuedAt: Date.now() }) }];
    });
    res.set('Cache-Control', 'private, no-store');
    res.json(locations);
  } catch (error) {
    console.error('Business address search failed.', error);
    res.status(503).json({ error: 'Shop address search is temporarily unavailable. Please retry.' });
  }
});

app.post('/api/location/reverse-business', requireAuth, requireActiveAccount, async (req: AuthenticatedRequest, res) => {
  const profile = await readProfile(req.authUser!.uid);
  if (profile?.role !== 'tailor' && profile?.role !== 'fabric_seller') {
    res.status(403).json({ error: 'Only seller accounts can confirm a business location.' });
    return;
  }
  const latitude = req.body?.lat;
  const longitude = req.body?.lng;
  const accuracyMeters = req.body?.accuracyMeters;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    || typeof accuracyMeters !== 'number' || !Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 100_000) {
    res.status(400).json({ error: 'Share a valid current device position.' });
    return;
  }

  const lastLookup = reverseGeocodeRateLimit.get(req.authUser!.uid) || 0;
  if (Date.now() - lastLookup < 10_000) {
    res.status(429).json({ error: 'Please wait a few seconds before detecting the location again.' });
    return;
  }
  reverseGeocodeRateLimit.set(req.authUser!.uid, Date.now());
  if (reverseGeocodeRateLimit.size > 5_000) {
    for (const [userId, timestamp] of reverseGeocodeRateLimit) {
      if (Date.now() - timestamp > 10 * 60_000) reverseGeocodeRateLimit.delete(userId);
    }
  }

  try {
    const reverse = await reverseGeocodeWithNominatim(latitude, longitude);
    const address = reverse.address as Record<string, unknown>;
    const text = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 120) : '';
    const country = text(address.country);
    const countryCode = text(address.country_code).toUpperCase();
    const city = text(address.city || address.town || address.village || address.municipality || address.hamlet || address.suburb);
    const state = text(address.state || address.province || address.region || address.county);
    if (!country || !city) {
      res.status(422).json({ error: 'The detected point could not be matched to a city and country. Move outdoors and retry.' });
      return;
    }
    const geocodedAddress = typeof reverse.display_name === 'string' ? reverse.display_name.trim().slice(0, 300) : '';
    if (!geocodedAddress) {
      res.status(422).json({ error: 'The detected point did not return a usable address. Please retry.' });
      return;
    }
    const location: UserLocation = { country, countryCode, state, city };
    const confirmationToken = signLocationPayload({
      latitude,
      longitude,
      accuracyMeters,
      location,
      address: geocodedAddress,
      issuedAt: Date.now(),
    });
    res.set('Cache-Control', 'private, no-store');
    res.json({
      location: {
        ...location,
        lat: latitude,
        lng: longitude,
        accuracyMeters,
        businessAddress: geocodedAddress,
      },
      confirmationToken,
    });
  } catch (error) {
    console.error('Seller business address could not be reverse-geocoded.', error);
    res.status(503).json({ error: 'Address lookup is temporarily unavailable. Please retry in a moment.' });
  }
});

app.put('/api/profile/business-location', requireAuth, requireActiveAccount, async (req: AuthenticatedRequest, res) => {
  const profile = await readProfile(req.authUser!.uid);
  if (profile?.role !== 'tailor' && profile?.role !== 'fabric_seller') {
    res.status(403).json({ error: 'Only seller accounts can update a business location.' });
    return;
  }
  if (req.body?.confirmBusinessLocation !== true) {
    res.status(400).json({ error: 'Confirm that this detected point is your public business location.' });
    return;
  }
  const signedLocation = verifyLocationPayload(req.body?.confirmationToken);
  if (!signedLocation) {
    res.status(400).json({ error: 'This location confirmation expired or is invalid. Detect your location again.' });
    return;
  }
  const businessAddress = typeof req.body?.businessAddress === 'string'
    ? req.body.businessAddress.trim().slice(0, 300)
    : '';
  if (!businessAddress) {
    res.status(400).json({ error: 'Add a business address before confirming your location.' });
    return;
  }
  if (!await enforceAbuseLimit(req, res, 'profile_write', req.authUser!.uid)) return;

  const confirmedAt = new Date().toISOString();
  const location: UserLocation = {
    ...signedLocation.location,
    lat: signedLocation.latitude,
    lng: signedLocation.longitude,
    accuracyMeters: signedLocation.accuracyMeters,
    businessAddress,
    verificationStatus: 'seller_confirmed',
    locationSource: signedLocation.locationSource || 'device_geolocation',
    confirmedAt,
  };
  try {
    await updateProfile(req.authUser!.uid, {
      location,
      businessLatitude: signedLocation.latitude,
      businessLongitude: signedLocation.longitude,
      locationAccuracyM: signedLocation.accuracyMeters,
      locationStatus: 'seller_confirmed',
      locationConfirmedAt: confirmedAt,
      updatedAt: confirmedAt,
    });
    usersCache = null;
    res.set('Cache-Control', 'private, no-store');
    res.json(location);
  } catch (error) {
    console.error('Seller business location could not be saved.', error);
    res.status(503).json({ error: 'Your business location could not be saved. Please try again.' });
  }
});

app.get('/api/sellers/nearby', async (req, res) => {
  const latitude = typeof req.query.lat === 'string' ? Number(req.query.lat) : NaN;
  const longitude = typeof req.query.lng === 'string' ? Number(req.query.lng) : NaN;
  const radiusKm = typeof req.query.radiusKm === 'string' ? Number(req.query.radiusKm) : NaN;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    || ![1, 5, 10, 25, 50].includes(radiusKm)) {
    res.status(400).json({ error: 'Use valid coordinates and a supported 1, 5, 10, 25, or 50 km radius.' });
    return;
  }
  try {
    const sellers = await findNearbySellers(latitude, longitude, radiusKm);
    res.set('Cache-Control', 'private, no-store');
    res.json(sellers);
  } catch (error) {
    console.error('Nearby confirmed-seller search failed.', error);
    res.status(503).json({ error: 'Nearby sellers could not be loaded. Please retry.' });
  }
});

app.post('/api/location/resolve', (req, res) => {
  const locations = req.body?.locations;
  if (!Array.isArray(locations) || locations.length === 0 || locations.length > 250) {
    res.status(400).json({ error: 'Resolve between 1 and 250 seller locations at a time.' });
    return;
  }
  const candidates: Array<{ id: string; location: UserLocation }> = [];
  for (const entry of locations as unknown[]) {
    if (!entry || typeof entry !== 'object') {
      res.status(400).json({ error: 'Each seller location must include an id and location.' });
      return;
    }
    const item = entry as Record<string, unknown>;
    const location = item.location;
    if (typeof item.id !== 'string' || !item.id.trim() || item.id.length > 128
      || !location || typeof location !== 'object') {
      res.status(400).json({ error: 'Each seller location must include an id and location.' });
      return;
    }
    const value = location as Record<string, unknown>;
    const fields = ['country', 'countryCode', 'state', 'city'] as const;
    if (fields.some(field => value[field] !== undefined
      && (typeof value[field] !== 'string' || value[field].length > 120))
      || (value.lat !== undefined && typeof value.lat !== 'number')
      || (value.lng !== undefined && typeof value.lng !== 'number')) {
      res.status(400).json({ error: 'Seller location fields must be valid text or coordinates.' });
      return;
    }
    const stringField = (field: string) => typeof value[field] === 'string' ? (value[field] as string).trim().slice(0, 120) : '';
    candidates.push({
      id: item.id,
      location: {
        country: stringField('country'),
        countryCode: stringField('countryCode'),
        state: stringField('state'),
        city: stringField('city'),
        ...(typeof value.lat === 'number' ? { lat: value.lat } : {}),
        ...(typeof value.lng === 'number' ? { lng: value.lng } : {}),
      },
    });
  }
  const resolved = candidates.flatMap(({ id, location }) => {
    const mapLocation = resolveMapLocation(location);
    return mapLocation ? [{ id, location: mapLocation }] : [];
  });
  res.set('Cache-Control', 'private, no-store');
  res.json(resolved);
});

app.get('/api/location/countries/:countryCode/states', (req, res) => {
  const regions = listLocationRegions(req.params.countryCode);
  if (!regions) {
    res.status(404).json({ error: 'Choose a country from the suggestions.' });
    return;
  }
  res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.json(regions);
});

app.get('/api/location/countries/:countryCode/states/:regionCode/cities', (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (query.length > 80) {
    res.status(400).json({ error: 'Search for a shorter city name.' });
    return;
  }
  const cities = searchLocationCities(req.params.countryCode, req.params.regionCode, query);
  if (!cities) {
    res.status(404).json({ error: 'Choose a state from the suggestions.' });
    return;
  }
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.json(cities);
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

app.post('/api/upload', requireAuth, requireActiveAccount, requireAbuseLimit('image_upload'), upload.single('image'), async (req: AuthenticatedRequest, res) => {
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
        .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 78, progressive: true, mozjpeg: true })
        .toBuffer(),
      sharp(req.file.buffer, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 72, progressive: true, mozjpeg: true })
        .toBuffer(),
    ]);

    const fileName = `v1-${createHash('sha256').update(req.file.buffer).digest('hex')}`;
    const optimizedMetadata = await sharp(optimizedBuffer).metadata();
    const [original, thumbnail] = await Promise.all([
      uploadImage(req.authUser!.uid, safeFolder, `${fileName}.jpg`, optimizedBuffer, 'image/jpeg'),
      uploadImage(req.authUser!.uid, safeFolder, `${fileName}-thumb.jpg`, thumbnailBuffer, 'image/jpeg'),
    ]);
    res.status(201).json({
      url: original.url,
      thumbnailUrl: thumbnail.url,
      publicId: original.path,
      width: optimizedMetadata.width,
      height: optimizedMetadata.height,
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
    const metadata = req.authUser!.userMetadata || {};
    const metadataText = (key: string, maxLength: number) => typeof metadata[key] === 'string'
      ? (metadata[key] as string).trim().slice(0, maxLength)
      : '';
    const metadataLocation = metadata.location && typeof metadata.location === 'object' && !Array.isArray(metadata.location)
      ? metadata.location as Record<string, unknown>
      : {};
    const metadataLocationText = (key: string, maxLength: number) => typeof metadataLocation[key] === 'string'
      ? (metadataLocation[key] as string).trim().slice(0, maxLength)
      : '';
    const latitude = metadataLocation.lat;
    const longitude = metadataLocation.lng;
    const location = {
      country: metadataLocationText('country', 100),
      countryCode: metadataLocationText('countryCode', 8),
      currency: metadataLocationText('currency', 8),
      state: metadataLocationText('state', 100),
      city: metadataLocationText('city', 100),
      ...(typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 ? { lat: latitude } : {}),
      ...(typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 ? { lng: longitude } : {}),
    };
    const role = metadata.role === 'tailor' || metadata.role === 'fabric_seller'
      ? metadata.role
      : 'buyer';
    profile = await upsertProfile(req.authUser!.uid, {
      id: req.authUser!.uid,
      email,
      name: metadataText('name', 120) || req.authUser!.name || email.split('@')[0] || 'Atelier Member',
      role: req.authUser!.admin ? 'admin' : role,
      phone: metadataText('phone', 40),
      countryCode: metadataText('countryCode', 8),
      location,
      whatsappNumber: metadataText('whatsappNumber', 40),
      shopName: metadataText('shopName', 120),
      bio: metadataText('bio', 1000),
      handle: metadataText('handle', 60) || `@${(email.split('@')[0] || 'atelier_member').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
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
  if (!await enforceAbuseLimit(req, res, 'profile_write', uid)) return;
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

app.put('/api/profile', requireAuth, requireActiveAccount, async (req: AuthenticatedRequest, res) => {
  if (!await enforceAbuseLimit(req, res, 'profile_write', req.authUser!.uid)) return;
  const profile = buildProfileUpdate(req.body || {});
  const existingProfile = await readProfile(req.authUser!.uid);
  if (existingProfile) {
    delete profile.role;
    const requestedAddress = req.body?.location && typeof req.body.location.businessAddress === 'string'
      ? req.body.location.businessAddress.trim().slice(0, 300)
      : undefined;
    delete profile.location;
    if (requestedAddress !== undefined) {
      profile.location = {
        ...(existingProfile.location && typeof existingProfile.location === 'object' ? existingProfile.location : {}),
        businessAddress: requestedAddress || undefined,
      };
    }
  }
  delete profile.isPromoted;
  delete profile.isBlocked;
  delete profile.isWarned;
  delete profile.warningNote;
  delete profile.isSuperAdmin;
  delete profile.addedByEmail;
  delete profile.followers;
  const profileValues = { ...profile, id: req.authUser!.uid, email: req.authUser!.email || '' };
  if (supabaseDataEnabled) {
    const saved = existingProfile
      ? await updateProfile(req.authUser!.uid, profile)
      : await upsertProfile(req.authUser!.uid, profileValues);
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
      setMarketplaceResponseCacheHeaders(req, res);
      res.json(postsCache.value);
      return;
    }

    let posts: Array<Record<string, unknown> & { id: string; isBlocked?: boolean }>;
    if (supabaseDataEnabled) {
      const rows = await getPosts(16, search || undefined);
      posts = rows.map(row => {
        const author = row.author as Record<string, unknown> || {};
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
          likes: [],
          saves: [],
          likeCount: Number(normalized.likeCount) || 0,
          saveCount: Number(normalized.saveCount) || 0,
          rating: Number(normalized.ratingAverage) || 0,
          ratingCount: Number(normalized.ratingCount) || 0,
          imageAlt: typeof normalized.imageAlt === 'string' ? normalized.imageAlt.trim() : undefined,
        };
      }).filter(post => post.isBlocked !== true && post.authorIsBlocked !== true);
    } else {
      const snapshot = await firestore.collection('posts').orderBy('createdAt', 'desc').limit(16).get();
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
          ratingCount: validRatings.length,
          imageAlt: typeof data.imageAlt === 'string' ? data.imageAlt.trim() : undefined,
        };
      }))).filter(post => post.isBlocked !== true && post.authorIsBlocked !== true);
    }
    if (!search) {
      const expiresAt = Date.now() + PUBLIC_CACHE_TTL_MS;
      postsCache = { expiresAt, staleUntil: expiresAt + PUBLIC_CACHE_STALE_MS, value: posts };
    }
    if (!search) setMarketplaceResponseCacheHeaders(req, res);
    res.json(posts);
  } catch (error) {
    console.error('Unable to load marketplace posts', error);
    if (!search && !req.headers.authorization && postsCache && postsCache.staleUntil > Date.now()) {
      console.warn('Marketplace posts are temporarily unavailable; returning the last successful listings.');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Warning', '110 - "Response is stale"');
      res.json(postsCache.value);
      return;
    }
    res.status(503).json({ error: 'Marketplace data is temporarily unavailable. Please try again shortly.' });
  }
});

const MARKETPLACE_VIEWS = new Set(['all', 'clothing', 'fabrics', 'tailors', 'for-you']);
const MARKETPLACE_SORTS = new Set(['relevance', 'newest', 'price_asc', 'price_desc', 'rating', 'popularity']);
const MARKETPLACE_CURSOR_FIELDS: Record<string, string[]> = {
  relevance: ['is_promoted', 'popularity_score', 'published_at', 'id'],
  newest: ['published_at', 'id'],
  price_asc: ['price_min', 'published_at', 'id'],
  price_desc: ['price_min', 'published_at', 'id'],
  rating: ['rating_average', 'published_at', 'id'],
  popularity: ['popularity_score', 'published_at', 'id'],
};

function decodeMarketplaceCursor(encoded: unknown, sort: string, rankedSearch = false): MarketplaceCursor | undefined {
  if (encoded === undefined) return undefined;
  if (typeof encoded !== 'string' || encoded.length > 2048) throw new Error('Invalid marketplace pagination cursor.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid marketplace pagination cursor.');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid marketplace pagination cursor.');
  const cursor = parsed as Partial<MarketplaceCursor>;
  const fields = rankedSearch && sort === 'relevance' ? ['search_score', 'id'] : MARKETPLACE_CURSOR_FIELDS[sort];
  if (cursor.sort !== sort || !Array.isArray(cursor.values) || cursor.values.length !== fields.length) {
    throw new Error('Invalid marketplace pagination cursor.');
  }

  const values = cursor.values;
  const valid = values.every((value, index) => {
    const field = fields[index];
    if (field === 'id') return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    if (field === 'published_at') return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
    if (field === 'is_promoted') return typeof value === 'boolean';
    if (field === 'search_score') return typeof value === 'number' && Number.isFinite(value);
    if (field === 'price_min') return value === null || (typeof value === 'number' && Number.isFinite(value));
    return typeof value === 'number' && Number.isFinite(value);
  });
  if (!valid) throw new Error('Invalid marketplace pagination cursor.');
  return cursor as MarketplaceCursor;
}

app.get('/api/marketplace/feed', optionalAuth, async (req: AuthenticatedRequest, res) => {
  const view = typeof req.query.view === 'string' ? req.query.view : 'for-you';
  const sort = typeof req.query.sort === 'string' ? req.query.sort : (view === 'for-you' ? 'relevance' : 'newest');
  if (!MARKETPLACE_VIEWS.has(view) || !MARKETPLACE_SORTS.has(sort)) {
    res.status(400).json({ error: 'Choose a valid marketplace view and sort order.' });
    return;
  }

  const limitValue = typeof req.query.limit === 'string' ? Number(req.query.limit) : 24;
  if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 48) {
    res.status(400).json({ error: 'Marketplace page size must be between 1 and 48.' });
    return;
  }

  const search = typeof req.query.search === 'string' ? listingText(req.query.search, 80) : '';
  if (parseMarketplaceSearch(search).termGroups.length > 20) {
    res.status(400).json({ error: 'Shorten the search query to 20 searchable terms or fewer.' });
    return;
  }
  const rankedSearch = Boolean(search && sort === 'relevance');
  let cursor: MarketplaceCursor | undefined;
  try {
    cursor = decodeMarketplaceCursor(req.query.cursor, sort, rankedSearch);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid marketplace pagination cursor.' });
    return;
  }

  const categoryId = typeof req.query.categoryId === 'string' ? listingText(req.query.categoryId, 80) : '';
  const tag = typeof req.query.tag === 'string' ? listingText(req.query.tag, 48) : '';
  const country = typeof req.query.country === 'string' ? listingText(req.query.country, 80) : '';
  const state = typeof req.query.state === 'string' ? listingText(req.query.state, 80) : '';
  const city = typeof req.query.city === 'string' ? listingText(req.query.city, 80) : '';
  const minimumPrice = req.query.minimumPrice === undefined ? undefined : Number(req.query.minimumPrice);
  const maximumPrice = req.query.maximumPrice === undefined ? undefined : Number(req.query.maximumPrice);
  if ((minimumPrice !== undefined && (!Number.isFinite(minimumPrice) || minimumPrice < 0))
    || (maximumPrice !== undefined && (!Number.isFinite(maximumPrice) || maximumPrice < 0))
    || (minimumPrice !== undefined && maximumPrice !== undefined && minimumPrice > maximumPrice)) {
    res.status(400).json({ error: 'Enter a valid marketplace price range.' });
    return;
  }
  const currency = listingText(req.query.currency, 8).toUpperCase();
  if ((minimumPrice !== undefined || maximumPrice !== undefined) && !/^[A-Z]{3,8}$/.test(currency)) {
    res.status(400).json({ error: 'Choose a currency when filtering by price.' });
    return;
  }
  const material = listingText(req.query.material, 80);
  const colour = listingText(req.query.colour, 80);
  const size = listingText(req.query.size, 24);
  const fulfilment = typeof req.query.fulfilment === 'string' && ['ready_made', 'made_to_order'].includes(req.query.fulfilment) ? req.query.fulfilment : '';
  const availability = typeof req.query.availability === 'string' && ['available', 'made_to_order', 'limited'].includes(req.query.availability) ? req.query.availability : '';
  if ((req.query.fulfilment !== undefined && !fulfilment) || (req.query.availability !== undefined && !availability)) {
    res.status(400).json({ error: 'Choose a valid availability or fulfilment filter.' });
    return;
  }
  const locationHint = parseMarketplaceSearch(search).locationHint;
  const cacheKey = JSON.stringify({ view, sort, search, categoryId, tag, country, state, city, minimumPrice, maximumPrice, currency, material, colour, size, fulfilment, availability, cursor, limitValue });
  const cached = req.authUser || req.headers.authorization ? undefined : marketplaceFeedCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    setMarketplaceResponseCacheHeaders(req, res);
    res.json(cached.value);
    return;
  }

  try {
    const { rows, hasMore, nextSearchCursor } = await getMarketplacePostsPage({
      view,
      sort,
      search: search || undefined,
      locationHint: locationHint || undefined,
      categoryId: categoryId || undefined,
      tag: tag || undefined,
      country: country || undefined,
      state: state || undefined,
      city: city || undefined,
      minimumPrice,
      maximumPrice,
      currency: currency || undefined,
      material: material || undefined,
      colour: colour || undefined,
      size: size || undefined,
      fulfilment: fulfilment || undefined,
      availability: availability || undefined,
      viewerId: req.authUser?.uid,
      cursor,
      limit: limitValue,
    });
    const postIds = rows.map(row => String(row.id));
    const sellerIds = rows.map(row => String(row.author_id || '')).filter(Boolean);
    const [interactionResult, listingReviewResult, sellerReviewResult] = await Promise.allSettled([
      getMarketplaceViewerInteractions(postIds, req.authUser?.uid),
      getMarketplaceReviewSummaries('listing', postIds),
      getMarketplaceReviewSummaries('seller', sellerIds),
    ]);
    const interactions = interactionResult.status === 'fulfilled'
      ? interactionResult.value
      : { likes: new Set<string>(), saves: new Set<string>() };
    const listingReviews = listingReviewResult.status === 'fulfilled' ? listingReviewResult.value : new Map<string, ProfileRecord>();
    const sellerReviews = sellerReviewResult.status === 'fulfilled' ? sellerReviewResult.value : new Map<string, ProfileRecord>();
    if (interactionResult.status === 'rejected'
      || listingReviewResult.status === 'rejected'
      || sellerReviewResult.status === 'rejected') {
      console.warn('Marketplace feed enrichment is temporarily unavailable; returning listings without some account or review details.', {
        interactions: interactionResult.status === 'rejected' ? interactionResult.reason : undefined,
        listingReviews: listingReviewResult.status === 'rejected' ? listingReviewResult.reason : undefined,
        sellerReviews: sellerReviewResult.status === 'rejected' ? sellerReviewResult.reason : undefined,
      });
    }
    const items = rows.map(row => {
      const author = row.author as Record<string, unknown> || {};
      const post = snakeToCamel(row) as Record<string, unknown>;
      const id = String(post.id);
      const listingReview = listingReviews.get(id);
      const sellerReview = sellerReviews.get(String(post.authorId || ''));
      return {
        ...post,
        id,
        title: String(post.title || 'Untitled atelier listing'),
        authorId: String(post.authorId || ''),
        authorName: String(author.shop_name || author.name || 'Atelier Member'),
        authorRole: author.role === 'fabric_seller' ? 'fabric_seller' : 'tailor',
        authorHandle: String(author.handle || '@atelier_member'),
        authorAvatar: String(author.avatar_url || ''),
        authorLocation: author.location || {},
        authorWhatsapp: String(author.whatsapp_number || ''),
        isPromoted: post.isPromoted === true || author.is_promoted === true,
        likes: interactions.likes.has(id) && req.authUser ? [req.authUser.uid] : [],
        saves: interactions.saves.has(id) && req.authUser ? [req.authUser.uid] : [],
        likeCount: Number(post.likeCount) || 0,
        saveCount: Number(post.saveCount) || 0,
        rating: Number(listingReview?.average) || 0,
        ratingCount: Number(listingReview?.count) || 0,
        confidenceAdjustedRating: listingReview?.confidenceAdjustedRating ?? null,
        sellerRating: Number(sellerReview?.average) || 0,
        sellerReviewCount: Number(sellerReview?.count) || 0,
        sellerConfidenceAdjustedRating: sellerReview?.confidenceAdjustedRating ?? null,
        trendScore: Number(post.trendScore) || 0,
        trendConfidence: Number(post.trendConfidence) || 0,
        searchLocationMatch: post.searchLocationMatch === true,
        searchLocationHint: rankedSearch ? locationHint || undefined : undefined,
        imageAlt: typeof post.imageAlt === 'string' ? post.imageAlt.trim() : '',
      };
    });
    const lastRow = rows[rows.length - 1];
    const nextCursor = rankedSearch && nextSearchCursor
      ? Buffer.from(JSON.stringify(nextSearchCursor)).toString('base64url')
      : hasMore && lastRow
      ? Buffer.from(JSON.stringify({
          sort,
          values: MARKETPLACE_CURSOR_FIELDS[sort].map(field => {
            const value = lastRow[field];
            return value === undefined ? null : value;
          }),
        })).toString('base64url')
      : null;
    const result = { items, nextCursor, hasMore };
    if (!req.authUser) {
      if (marketplaceFeedCache.size >= 100) {
        const oldestKey = marketplaceFeedCache.keys().next().value;
        if (oldestKey) marketplaceFeedCache.delete(oldestKey);
      }
      const expiresAt = Date.now() + 30_000;
      marketplaceFeedCache.set(cacheKey, { expiresAt, staleUntil: expiresAt + PUBLIC_CACHE_STALE_MS, value: result });
    }
    setMarketplaceResponseCacheHeaders(req, res);
    res.json(result);
  } catch (error) {
    console.error('Unable to load paginated marketplace feed.', error);
    if (cached && cached.staleUntil > Date.now()) {
      console.warn('Marketplace feed is temporarily unavailable; returning the last successful page.');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Warning', '110 - "Response is stale"');
      res.json(cached.value);
      return;
    }
    if (!req.headers.authorization
      && ['all', 'for-you'].includes(view)
      && ['newest', 'relevance'].includes(sort)
      && !search && !categoryId && !tag && !country && !state && !city
      && minimumPrice === undefined && maximumPrice === undefined
      && !material && !colour && !size && !fulfilment && !availability
      && postsCache && postsCache.staleUntil > Date.now()
      && Array.isArray(postsCache.value)) {
      console.warn('Marketplace feed query failed; using the last successful public listings.');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Warning', '110 - "Response is stale"');
      res.json({ items: postsCache.value.slice(0, limitValue), nextCursor: null, hasMore: false });
      return;
    }
    res.status(503).json({ error: 'Marketplace listings could not be loaded right now. Please retry.' });
  }
});

const MARKETPLACE_TREND_CATEGORIES = new Set<MarketplaceTrendCategory>([
  'TRENDING_NOW', 'RISING', 'POPULAR', 'NEW_NOTICED', 'HIGHLY_RATED', 'MOST_VIEWED',
]);
const MARKETPLACE_TREND_SCOPES = new Set(['global', 'region', 'category', 'style']);
const SERVER_RECORDED_ENGAGEMENT_TYPES = new Set<MarketplaceEngagementEventType>([
  'IMPRESSION', 'VIEW', 'SHARE', 'ENQUIRY', 'HIDE',
]);

app.get('/api/marketplace/listings/:listingId/image-download', optionalAuth, async (req: AuthenticatedRequest, res) => {
  if (!isUuid(req.params.listingId)) {
    res.status(400).json({ error: 'Choose a valid listing.', code: 'INVALID_LISTING' });
    return;
  }

  try {
    const listing = await getPost(req.params.listingId);
    const author = listing?.author as Record<string, unknown> | undefined;
    if (!listing || !['CLOTHING', 'FABRIC'].includes(String(listing.listing_type))
      || listing.status !== 'published'
      || listing.moderation_status !== 'approved'
      || listing.deleted_at
      || listing.is_blocked
      || listing.availability === 'unavailable'
      || listing.availability === 'sold_out'
      || author?.is_blocked) {
      res.status(404).json({ error: 'This listing is no longer available.', code: 'LISTING_NOT_FOUND' });
      return;
    }

    const imageUrl = typeof listing.image_url === 'string' ? listing.image_url : '';
    let source: URL;
    try {
      source = new URL(imageUrl);
    } catch {
      res.status(404).json({ error: 'This image is no longer available.', code: 'IMAGE_NOT_FOUND' });
      return;
    }
    const supabaseHost = new URL(process.env.SUPABASE_URL!).hostname;
    const trustedStorageUrl = source.protocol === 'https:'
      && source.hostname === supabaseHost
      && source.pathname.startsWith('/storage/v1/object/public/uploads/');
    const trustedCloudinaryUrl = source.protocol === 'https:'
      && source.hostname === 'res.cloudinary.com'
      && /^\/[a-z0-9_-]+\/image\/upload\//i.test(source.pathname);
    if ((!trustedStorageUrl && !trustedCloudinaryUrl) || source.username || source.password || source.port) {
      res.status(404).json({ error: 'This image is no longer available.', code: 'IMAGE_NOT_FOUND' });
      return;
    }

    const upstream = await fetch(source, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
    if (!upstream.ok) {
      res.status(upstream.status === 404 ? 404 : 503).json({
        error: upstream.status === 404 ? 'This image is no longer available.' : "We couldn't download this image. Please try again.",
        code: upstream.status === 404 ? 'IMAGE_NOT_FOUND' : 'IMAGE_DOWNLOAD_UNAVAILABLE',
      });
      return;
    }
    const contentType = upstream.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() || '';
    const contentLength = Number(upstream.headers.get('content-length') || 0);
    if (!/^image\/(?:jpeg|png|webp|avif|gif)$/.test(contentType)
      || (contentLength > 20 * 1024 * 1024)) {
      res.status(415).json({ error: 'This image cannot be downloaded. Please try another listing.', code: 'IMAGE_FORMAT_UNAVAILABLE' });
      return;
    }
    const reader = upstream.body?.getReader();
    if (!reader) {
      res.status(503).json({ error: "We couldn't download this image. Please try again.", code: 'IMAGE_DOWNLOAD_UNAVAILABLE' });
      return;
    }
    const imageChunks: Buffer[] = [];
    let imageLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      imageLength += value.byteLength;
      if (imageLength > 20 * 1024 * 1024) {
        await reader.cancel();
        res.status(413).json({ error: 'This image is too large to download.', code: 'IMAGE_TOO_LARGE' });
        return;
      }
      imageChunks.push(Buffer.from(value));
    }
    const image = Buffer.concat(imageChunks, imageLength);
    if (!image.length) {
      res.status(413).json({ error: 'This image is too large to download.', code: 'IMAGE_TOO_LARGE' });
      return;
    }

    const title = String(listing.title || 'atelier_piece')
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'atelier_piece';
    const extension = contentType === 'image/png' ? 'png'
      : contentType === 'image/webp' ? 'webp'
        : contentType === 'image/avif' ? 'avif'
          : contentType === 'image/gif' ? 'gif' : 'jpg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', image.length);
    res.setHeader('Content-Disposition', `attachment; filename="${title}.${extension}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(image);
  } catch (error) {
    console.error('Marketplace image download failed.', error);
    res.status(503).json({ error: "We couldn't download this image. Please try again.", code: 'IMAGE_DOWNLOAD_UNAVAILABLE' });
  }
});

app.get('/api/marketplace/trending', optionalAuth, async (req: AuthenticatedRequest, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : 'TRENDING_NOW';
  const scopeType = typeof req.query.scopeType === 'string' ? req.query.scopeType : 'global';
  const rawScopeValue = typeof req.query.scopeValue === 'string' ? req.query.scopeValue : '';
  const scopeValue = scopeType === 'global' ? 'global' : listingText(rawScopeValue, 80).toLowerCase();
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 12;

  if (!MARKETPLACE_TREND_CATEGORIES.has(category as MarketplaceTrendCategory)
    || !MARKETPLACE_TREND_SCOPES.has(scopeType)
    || (scopeType !== 'global' && !scopeValue)
    || (scopeType === 'global' && rawScopeValue && rawScopeValue !== 'global')
    || !Number.isInteger(limit) || limit < 1 || limit > 48) {
    res.status(400).json({ error: 'Choose a valid trend category, scope, and page size.' });
    return;
  }

  try {
    const result = await getMarketplaceTrendingPage({
      category: category as MarketplaceTrendCategory,
      scopeType: scopeType as 'global' | 'region' | 'category' | 'style',
      scopeValue,
      limit,
      viewerId: req.authUser?.uid,
    });
    const postIds = result.rows.map(row => String(row.id));
    const sellerIds = result.rows.map(row => String(row.author_id || '')).filter(Boolean);
    const [interactionResult, listingReviewResult, sellerReviewResult] = await Promise.allSettled([
      getMarketplaceViewerInteractions(postIds, req.authUser?.uid),
      getMarketplaceReviewSummaries('listing', postIds),
      getMarketplaceReviewSummaries('seller', sellerIds),
    ]);
    const interactions = interactionResult.status === 'fulfilled'
      ? interactionResult.value
      : { likes: new Set<string>(), saves: new Set<string>() };
    const listingReviews = listingReviewResult.status === 'fulfilled' ? listingReviewResult.value : new Map<string, ProfileRecord>();
    const sellerReviews = sellerReviewResult.status === 'fulfilled' ? sellerReviewResult.value : new Map<string, ProfileRecord>();
    if (interactionResult.status === 'rejected'
      || listingReviewResult.status === 'rejected'
      || sellerReviewResult.status === 'rejected') {
      console.warn('Marketplace trend enrichment is temporarily unavailable; returning listings without some account or review details.', {
        interactions: interactionResult.status === 'rejected' ? interactionResult.reason : undefined,
        listingReviews: listingReviewResult.status === 'rejected' ? listingReviewResult.reason : undefined,
        sellerReviews: sellerReviewResult.status === 'rejected' ? sellerReviewResult.reason : undefined,
      });
    }
    const items = result.rows.map(row => {
      const author = row.author as Record<string, unknown> || {};
      const post = snakeToCamel(row) as Record<string, unknown>;
      const id = String(post.id);
      const listingReview = listingReviews.get(id);
      const sellerReview = sellerReviews.get(String(post.authorId || ''));
      return {
        ...post,
        id,
        title: String(post.title || 'Untitled atelier listing'),
        authorId: String(post.authorId || ''),
        authorName: String(author.shop_name || author.name || 'Atelier Member'),
        authorRole: author.role === 'fabric_seller' ? 'fabric_seller' : 'tailor',
        authorHandle: String(author.handle || '@atelier_member'),
        authorAvatar: String(author.avatar_url || ''),
        authorLocation: author.location || {},
        authorWhatsapp: String(author.whatsapp_number || ''),
        isPromoted: post.isPromoted === true || author.is_promoted === true,
        likes: interactions.likes.has(id) && req.authUser ? [req.authUser.uid] : [],
        saves: interactions.saves.has(id) && req.authUser ? [req.authUser.uid] : [],
        likeCount: Number(post.likeCount) || 0,
        saveCount: Number(post.saveCount) || 0,
        rating: Number(listingReview?.average) || 0,
        ratingCount: Number(listingReview?.count) || 0,
        confidenceAdjustedRating: listingReview?.confidenceAdjustedRating ?? null,
        sellerRating: Number(sellerReview?.average) || 0,
        sellerReviewCount: Number(sellerReview?.count) || 0,
        sellerConfidenceAdjustedRating: sellerReview?.confidenceAdjustedRating ?? null,
        trendScore: Number(post.trendScore) || 0,
        trendConfidence: Number(post.trendConfidence) || 0,
      };
    });
    setMarketplaceResponseCacheHeaders(req, res);
    res.json({
      items,
      category,
      scopeType,
      scopeValue,
      fallback: result.fallback,
      fallbackMessage: result.fallback
        ? 'Not enough qualified recent activity yet. Showing the newest eligible listings without labeling them as trending.'
        : null,
      computedAt: result.computedAt,
    });
  } catch (error) {
    console.error('Unable to load marketplace trends.', error);
    if (!req.headers.authorization
      && postsCache && postsCache.staleUntil > Date.now()
      && Array.isArray(postsCache.value)) {
      console.warn('Marketplace trends are temporarily unavailable; returning the last successful public listings.');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Warning', '110 - "Response is stale"');
      res.json({
        items: postsCache.value.slice(0, limit),
        category,
        scopeType,
        scopeValue,
        fallback: true,
        fallbackMessage: 'Trend data is temporarily unavailable. Showing the last successfully loaded listings instead.',
        computedAt: null,
      });
      return;
    }
    res.status(503).json({ error: 'Marketplace trends could not be loaded right now. Please retry.' });
  }
});

app.post('/api/marketplace/events', optionalAuth, async (req: AuthenticatedRequest, res) => {
  const listingId = typeof req.body?.listingId === 'string' ? req.body.listingId.trim() : '';
  const eventType = typeof req.body?.eventType === 'string' ? req.body.eventType : '';
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
  const recommendation = req.body?.recommendation;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(listingId)
    || !SERVER_RECORDED_ENGAGEMENT_TYPES.has(eventType as MarketplaceEngagementEventType)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
    res.status(400).json({ error: 'A valid listing, supported event, and session are required.' });
    return;
  }
  if (eventType === 'IMPRESSION'
    && (!recommendation || typeof recommendation !== 'object'
      || !['for_you', 'trending', 'category', 'search'].includes(recommendation.feedName)
      || !Number.isInteger(recommendation.rankedPosition)
      || recommendation.rankedPosition < 1 || recommendation.rankedPosition > 10000
      || (recommendation.reasonCode !== undefined
        && (typeof recommendation.reasonCode !== 'string' || recommendation.reasonCode.length > 80)))) {
    res.status(400).json({ error: 'A recommendation impression requires valid feed, position and reason metadata.' });
    return;
  }
  if (eventType !== 'IMPRESSION' && recommendation !== undefined) {
    res.status(400).json({ error: 'Recommendation metadata is only valid for impression events.' });
    return;
  }
  if (/\b(bot|crawler|spider|headlesschrome|scrapy|curl|wget)\b/i.test(req.get('user-agent') || '')) {
    res.status(204).send();
    return;
  }
  if (eventType === 'HIDE' && !req.authUser) {
    res.status(401).json({ error: 'Sign in to hide a listing.' });
    return;
  }
  if (req.authUser) {
    const profile = await getProfile(req.authUser.uid);
    if (!profile || profile.is_blocked === true) {
      res.status(403).json({ error: 'This account cannot record marketplace activity.' });
      return;
    }
  }

  const sessionHash = createHash('sha256').update(`marketplace-session:${sessionId}`).digest('hex');
  try {
    let outcome: Awaited<ReturnType<typeof recordMarketplaceEngagementEvent>>;
    if (eventType === 'IMPRESSION') {
      try {
        outcome = await recordMarketplaceRecommendationImpression({
          listingId,
          userId: req.authUser?.uid || null,
          sessionHash,
          feedName: recommendation.feedName,
          rankedPosition: recommendation.rankedPosition,
          reasonCode: recommendation.reasonCode,
        });
      } catch (error) {
        if (!isMissingRpcFunction(error, 'record_marketplace_recommendation_impression')) throw error;
        console.warn('Recommendation impression tracking is not migrated; recording the base marketplace impression instead.');
        outcome = await recordMarketplaceEngagementEvent({
          listingId,
          eventType: 'IMPRESSION',
          actorId: req.authUser?.uid || null,
          sessionHash,
        });
      }
    } else {
      outcome = await recordMarketplaceEngagementEvent({
        listingId,
        eventType: eventType as MarketplaceEngagementEventType,
        actorId: req.authUser?.uid || null,
        sessionHash,
      });
    }
    if (outcome === 'rate_limited') {
      res.status(429).json({ error: 'Too many marketplace events. Please try again shortly.' });
      return;
    }
    if (outcome === 'ineligible') {
      res.status(404).json({ error: 'That listing is not currently eligible for marketplace activity.' });
      return;
    }
    res.status(outcome === 'recorded' ? 201 : 200).json({ recorded: outcome === 'recorded' });
  } catch (error) {
    console.error('Unable to record marketplace activity.', error);
    res.status(503).json({
      error: 'Marketplace activity is temporarily unavailable.',
      code: 'MARKETPLACE_ACTIVITY_UNAVAILABLE',
    });
  }
});

app.post('/api/marketplace/search-events', optionalAuth, async (req: AuthenticatedRequest, res) => {
  const searchText = listingText(req.body?.searchText, 80);
  const eventType = typeof req.body?.eventType === 'string' ? req.body.eventType : '';
  const listingId = typeof req.body?.listingId === 'string' ? req.body.listingId.trim() : '';
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
  const resultCount = req.body?.resultCount;
  const validListingId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(listingId);
  const validSessionId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId);
  const validEvent = ['impression', 'click', 'save', 'enquiry'].includes(eventType);
  const validResultCount = Number.isInteger(resultCount) && resultCount >= 0 && resultCount <= 10000;
  if (searchText.length < 2 || !validEvent || !validSessionId
    || (eventType === 'impression' && (!validResultCount || listingId))
    || (eventType !== 'impression' && (!validListingId || resultCount !== undefined))) {
    res.status(400).json({ error: 'A valid search term, event, session, and event details are required.' });
    return;
  }
  if (/\b(bot|crawler|spider|headlesschrome|scrapy|curl|wget)\b/i.test(req.get('user-agent') || '')) {
    res.status(204).send();
    return;
  }
  if (req.authUser) {
    const profile = await getProfile(req.authUser.uid);
    if (!profile || profile.is_blocked === true) {
      res.status(403).json({ error: 'This account cannot record marketplace activity.' });
      return;
    }
  }

  const sessionHash = createHash('sha256').update(`marketplace-search-session:${sessionId}`).digest('hex');
  try {
    await recordMarketplaceSearchAuditEvent({
      searchText,
      eventType: eventType as 'impression' | 'click' | 'save' | 'enquiry',
      sessionHash,
      ...(validListingId ? { listingId } : {}),
      ...(eventType === 'impression' ? { resultCount: resultCount as number } : {}),
    });
    res.status(201).json({ recorded: true });
  } catch (error) {
    console.error('Unable to record marketplace search analytics.', error);
    res.status(503).json({ error: 'Search activity could not be recorded.' });
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
        const role = ['tailor', 'fabric_seller', 'buyer'].includes(String(profile.role)) ? String(profile.role) : 'buyer';
        const name = String(profile.name || 'Atelier Member');
        return {
          id: String(profile.id), email: '', name, role: role as UserRole,
          phone: '', countryCode: '',
          location: getPublicSellerLocation(profile),
          whatsappNumber: String(profile.whatsapp_number || ''), shopName: String(profile.shop_name || ''), bio: String(profile.bio || ''),
          handle: String(profile.handle || `@${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'atelier_member'}`),
          avatarUrl: String(profile.avatar_url || ''), isPromoted: profile.is_promoted === true, isBlocked: profile.is_blocked === true,
          followers: Array.isArray(profile.followers) ? profile.followers.filter((value): value is string => typeof value === 'string') : [],
          createdAt: String(profile.created_at || new Date().toISOString()),
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
      const role = ['tailor', 'fabric_seller', 'buyer'].includes(String(profile.role)) ? profile.role : 'buyer';
      const name = String(profile.name || authUser.displayName || authUser.email?.split('@')[0] || 'Atelier Member');
      return {
        id: authUser.uid,
        email: '',
        name,
        role,
        phone: '',
        countryCode: String(profile.countryCode || ''),
        location: {
          country: typeof (profile.location as Record<string, unknown> | undefined)?.country === 'string' ? String((profile.location as Record<string, unknown>).country) : '',
          countryCode: typeof (profile.location as Record<string, unknown> | undefined)?.countryCode === 'string' ? String((profile.location as Record<string, unknown>).countryCode) : '',
          state: typeof (profile.location as Record<string, unknown> | undefined)?.state === 'string' ? String((profile.location as Record<string, unknown>).state) : '',
          city: typeof (profile.location as Record<string, unknown> | undefined)?.city === 'string' ? String((profile.location as Record<string, unknown>).city) : '',
          verificationStatus: 'needs_confirmation',
        },
        whatsappNumber: String(profile.whatsappNumber || ''),
        shopName: String(profile.shopName || ''),
        bio: String(profile.bio || ''),
        handle: String(profile.handle || `@${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'atelier_member'}`),
        avatarUrl: String(profile.avatarUrl || authUser.photoURL || ''),
        isPromoted: profile.isPromoted === true,
        isBlocked: profile.isBlocked === true || authUser.disabled === true,
        followers: Array.isArray(profile.followers) ? profile.followers.filter((value): value is string => typeof value === 'string') : [],
        createdAt: String(profile.createdAt || authUser.metadata.creationTime || new Date().toISOString()),
      };
    });

    usersCache = { expiresAt: Date.now() + PUBLIC_CACHE_TTL_MS, value: users };
    res.json(users);
  } catch (error) {
    console.error('Unable to load registered users', error);
    res.status(503).json({ error: 'Registered-user data is temporarily unavailable. Please try again shortly.' });
  }
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (_req: AuthenticatedRequest, res) => {
  try {
    if (!supabaseDataEnabled) {
      const [profileSnapshot, authUsers] = await Promise.all([
        firestore.collection('profiles').get(),
        listAllAuthUsers(),
      ]);
      const profiles = new Map(profileSnapshot.docs.map(doc => [doc.id, doc.data() as Record<string, unknown>]));
      res.json(authUsers.map(authUser => {
        const profile = profiles.get(authUser.uid) || {};
        const claims = (authUser.customClaims || {}) as Record<string, unknown>;
        const isSuperAdmin = authUser.email?.trim().toLowerCase() === 'fountainsdata234@gmail.com';
        const name = String(profile.name || authUser.displayName || authUser.email?.split('@')[0] || 'Atelier Member');
        return {
          id: authUser.uid,
          email: authUser.email || '',
          name,
          role: profile.role === 'admin' || isSuperAdmin || claims.admin === true || claims.role === 'admin'
            ? 'admin'
            : ['tailor', 'fabric_seller', 'buyer'].includes(String(profile.role)) ? profile.role : 'buyer',
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
          isSuperAdmin,
          addedByEmail: String(profile.addedByEmail || ''),
        };
      }));
      return;
    }
    const profiles = await getUsers(true);
    const users = profiles.map(profile => {
      const email = String(profile.email || '');
      const name = String(profile.name || email.split('@')[0] || 'Atelier Member');
      const role = profile.role === 'admin' ? 'admin' : ['tailor', 'fabric_seller', 'buyer'].includes(String(profile.role)) ? String(profile.role) : 'buyer';
      return {
        id: String(profile.id), email, name, role: role as UserRole,
        phone: String(profile.phone || ''), countryCode: String(profile.country_code || ''),
        location: profile.location && typeof profile.location === 'object' ? profile.location : { country: '', state: '', city: '' },
        whatsappNumber: String(profile.whatsapp_number || ''), shopName: String(profile.shop_name || ''), bio: String(profile.bio || ''),
        handle: String(profile.handle || `@${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'atelier_member'}`),
        avatarUrl: String(profile.avatar_url || ''), isPromoted: profile.is_promoted === true, isBlocked: profile.is_blocked === true,
        isWarned: profile.is_warned === true, warningNote: String(profile.warning_note || ''),
        followers: Array.isArray(profile.followers) ? profile.followers.filter((value): value is string => typeof value === 'string') : [],
        createdAt: String(profile.created_at || new Date().toISOString()), isSuperAdmin: profile.is_super_admin === true,
        addedByEmail: String(profile.added_by_email || ''),
      };
    });

    app.post('/api/admin/ai/command', requireAuth, requireAdmin, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
      const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim().slice(0, 500) : '';
      if (!prompt) {
        res.status(400).json({ error: 'Enter an instruction for the admin operator.' });
        return;
      }
      const normalized = normalizeAdminAiPrompt(prompt);
      const profiles = await getUsers(true);
      const sellers = profiles.filter(profile => profile.role === 'tailor' || profile.role === 'fabric_seller');
      const contextTargetId = typeof req.body?.context?.targetId === 'string' ? req.body.context.targetId : '';
      const conversation = Array.isArray(req.body?.conversation)
        ? req.body.conversation
          .filter((message: unknown): message is { role: string; text: string } => (
            Boolean(message)
            && typeof message === 'object'
            && typeof (message as { role?: unknown }).role === 'string'
            && typeof (message as { text?: unknown }).text === 'string'
          ))
          .slice(-20)
          .map((message: { role: string; text: string }) => ({ role: message.role === 'admin' ? 'user' : 'model', text: message.text.slice(0, 2_000) }))
        : [];
      const posts = await getPosts(1000);
      const getValue = (record: Record<string, unknown>, ...keys: string[]) => keys.map(key => record[key]).find(value => value !== undefined && value !== null);
      const requestedCount = Number(normalized.match(/\b(\d+)\b/)?.[1] || 0);
      const isSellerQuery = normalized.includes('seller')
        || normalized.includes('tailor')
        || normalized.includes('merchant');
      const isListingQuery = normalized.includes('listing') || normalized.includes('post');
      const isAnalyticsQuery = normalized.includes('analytics')
        || normalized.includes('overview')
        || normalized.includes('stats')
        || normalized.includes('statistics')
        || normalized.includes('how many')
        || normalized.includes('top');
      const isSiteQuestion = /\b(what|which|who|how|where|when|why|can|is|are|tell)\b/.test(normalized);
      const isMutationCommand = normalized.includes('block')
        || normalized.includes('warn')
        || normalized.includes('promote')
        || normalized.includes('broadcast')
        || normalized.includes('announce')
        || normalized.includes('announcement')
        || (isListingQuery && (
          normalized.includes('pause')
          || normalized.includes('archive')
          || normalized.includes('approve')
          || normalized.includes('reject')
        ));
      const isExplicitLookupCommand = normalized.includes('search')
        || normalized.includes('find')
        || normalized.includes('show')
        || normalized.includes('open')
        || normalized.includes('profile')
        || normalized.includes('whatsapp')
        || (normalized.includes('top') && isSellerQuery)
        || (normalized.includes('new') && isSellerQuery)
        || (isListingQuery && (normalized.includes('search') || normalized.includes('find') || normalized.includes('show')));
      // Natural questions, including questions about live marketplace data, must
      // reach the model. Only explicit lookups and mutations use deterministic
      // routes because those routes render actionable UI and confirmations.
      const shouldUseGemini = !isMutationCommand && !isExplicitLookupCommand;
      if (shouldUseGemini && !gemini) {
        console.error('Lumina conversation requested but GEMINI_API_KEY is not configured.');
        res.status(503).json({ error: 'Lumina is not connected to Gemini on the server yet. Add GEMINI_API_KEY to the Render API service and redeploy.' });
        return;
      }
      if (shouldUseGemini && gemini) {
        const sellerSummary = sellers.slice(0, 60).map(profile => ({
          id: profile.id,
          name: profile.name,
          handle: profile.handle,
          role: profile.role,
          shopName: profile.shopName,
          city: profile.location && typeof profile.location === 'object'
            ? String((profile.location as Record<string, unknown>).city || '')
            : '',
          isBlocked: profile.isBlocked,
          isPromoted: profile.isPromoted,
        }));
        const listingSummary = posts.slice(0, 80).map(post => ({
          id: post.id,
          title: post.title,
          authorName: post.authorName,
          authorHandle: post.authorHandle,
          status: post.status,
          listingType: post.listingType,
        }));
        const systemInstruction = [
          'You are Lumina, the private Super Admin assistant for the Atelier fashion marketplace.',
          'Speak naturally and professionally with warmth. You may be playful when the admin is playful, but do not overuse emojis.',
          'Answer the admin conversationally and answer site questions only from the supplied live context.',
          'Never invent users, listings, metrics, actions, permissions, or completed work.',
          'If the question requires an action, explain that the admin must issue the action and confirm it; do not claim to have executed anything.',
          'Keep answers concise unless the admin asks for detail.',
          `Live context: ${JSON.stringify({
            totals: {
              users: profiles.length,
              sellers: sellers.length,
              buyers: profiles.filter(profile => profile.role === 'buyer').length,
              listings: posts.length,
            },
            sellers: sellerSummary,
            listings: listingSummary,
          })}`,
        ].join('\n');
        const contents = [
          ...conversation.map((message: { role: string; text: string }) => `${message.role === 'user' ? 'Admin' : 'Lumina'}: ${message.text}`),
          `Admin: ${prompt}`,
        ].join('\n');
        try {
          const response = await gemini.models.generateContent({
            model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
            contents,
            config: { systemInstruction, temperature: 0.5, maxOutputTokens: 500 },
          });
          const message = response.text?.trim();
          if (message) {
            res.json({ kind: 'chat', message });
            return;
          }
        } catch (error) {
          console.error('Lumina model response failed.', error);
          res.status(502).json({ error: 'Lumina could not reach Gemini right now. Check the Render service logs and Gemini configuration, then try again.' });
          return;
        }
      }
      if (isAnalyticsQuery && !normalized.includes('top') || (normalized.includes('overview') && !isSellerQuery)) {
        const publishedPosts = posts.filter(post => post.status === 'published' && post.moderation_status === 'approved');
        const metrics = {
          totalUsers: profiles.length,
          sellers: sellers.length,
          tailors: sellers.filter(profile => profile.role === 'tailor').length,
          fabricSellers: sellers.filter(profile => profile.role === 'fabric_seller').length,
          buyers: profiles.filter(profile => profile.role === 'buyer').length,
          blockedUsers: profiles.filter(profile => getValue(profile, 'is_blocked', 'isBlocked') === true).length,
          promotedSellers: sellers.filter(profile => getValue(profile, 'is_promoted', 'isPromoted') === true).length,
          publishedListings: publishedPosts.length,
          pendingListings: posts.filter(post => post.status === 'pending_review' || post.moderation_status === 'pending').length,
        };
        res.json({ kind: 'analytics', message: `Here is the current marketplace overview: ${metrics.sellers} sellers, ${metrics.buyers} buyers, ${metrics.publishedListings} published listings, and ${metrics.pendingListings} awaiting review.`, metrics });
        return;
      }
      if (isSiteQuestion && !isSellerQuery && !isListingQuery && !normalized.includes('warn') && !normalized.includes('block') && !normalized.includes('promote')) {
        const publishedPosts = posts.filter(post => post.status === 'published' && post.moderation_status === 'approved');
        const pendingListings = posts.filter(post => post.status === 'pending_review' || post.moderation_status === 'pending');
        const answer = normalized.includes('blocked')
          ? `There are ${profiles.filter(profile => getValue(profile, 'is_blocked', 'isBlocked') === true).length} blocked accounts.`
          : normalized.includes('promoted')
            ? `There are ${sellers.filter(profile => getValue(profile, 'is_promoted', 'isPromoted') === true).length} promoted seller accounts.`
            : normalized.includes('pending') || normalized.includes('review')
              ? `There are ${pendingListings.length} listings awaiting moderation.`
              : normalized.includes('listing') || normalized.includes('post')
                ? `The marketplace currently has ${publishedPosts.length} published listings.`
                : `The site currently has ${profiles.length} users, ${sellers.length} sellers, ${profiles.filter(profile => profile.role === 'buyer').length} buyers, and ${publishedPosts.length} published listings.`;
        res.json({ kind: 'analytics', message: answer, metrics: {
          totalUsers: profiles.length,
          sellers: sellers.length,
          buyers: profiles.filter(profile => profile.role === 'buyer').length,
          publishedListings: publishedPosts.length,
          pendingListings: pendingListings.length,
        } });
        return;
      }
      if (isListingQuery && (normalized.includes('find') || normalized.includes('search') || normalized.includes('show'))) {
        const queryWords = normalized.split(/\s+/)
          .filter(word => word.length > 1 && !adminAiIntentWords.has(word) && !/^\d+$/.test(word));
        const listingResults = posts.filter(post => {
          const values = [post.id, post.title, post.description, post.authorName, post.authorHandle]
            .map(value => normalizeAdminAiPrompt(String(value || '')));
          return queryWords.length === 0 || queryWords.every(word => values.some(value => value.includes(word)));
        }).slice(0, 10);
        res.json({ kind: 'listing_results', message: listingResults.length ? `Found ${listingResults.length} matching listing${listingResults.length === 1 ? '' : 's'}.` : 'No matching listings found.', listingResults });
        return;
      }
      if (normalized.includes('top') && isSellerQuery) {
        const limit = Math.min(20, Math.max(1, requestedCount || 5));
        const results = [...sellers]
          .sort((left, right) => (Array.isArray(right.followers) ? right.followers.length : 0) - (Array.isArray(left.followers) ? left.followers.length : 0))
          .slice(0, limit);
        res.json({ kind: 'results', message: `Here are the top ${results.length} seller accounts by follower count.`, results });
        return;
      }
      if (normalized.includes('new') && isSellerQuery) {
        const limit = Math.min(20, Math.max(1, requestedCount || 10));
        const results = [...sellers]
          .sort((left, right) => new Date(String(right.createdAt || 0)).getTime() - new Date(String(left.createdAt || 0)).getTime())
          .slice(0, limit);
        res.json({ kind: 'results', message: `Here are the ${results.length} newest seller accounts.`, results });
        return;
      }
      const queryWords = normalized.split(/\s+/)
        .map(word => word.replace(/^@/, '').replace(/['’]s$/, ''))
        .filter(word => word.length > 1 && !adminAiIntentWords.has(word));
      const matches = profiles.filter(profile => {
        const location = profile.location && typeof profile.location === 'object'
          ? profile.location as Record<string, unknown>
          : {};
        const values = [
          profile.name,
          profile.handle,
          profile.email,
          profile.shopName,
          profile.id,
          location.city,
          location.state,
          location.country,
        ]
          .map(value => normalizeAdminAiPrompt(String(value || '')));
        return queryWords.length > 0 && queryWords.every(word => values.some(value => value.includes(word)));
      }).slice(0, 10);
      const opensProfile = normalized.includes('open') || normalized.includes('profile');
      const startsWhatsApp = normalized.includes('whatsapp');
      if (normalized.includes('search') || normalized.includes('find') || normalized.includes('show') || opensProfile || startsWhatsApp) {
        res.json({ kind: 'results', message: matches.length ? `Found ${matches.length} matching account${matches.length === 1 ? '' : 's'}.` : 'No matching accounts found.', results: matches });
        return;
      }
      const target = matches[0] || profiles.find(profile => String(profile.id) === contextTargetId);
      const action = normalized.includes('block')
        ? 'block'
        : normalized.includes('warn')
          ? 'warn'
          : normalized.includes('promote')
            ? 'promote'
            : null;
      if (normalized.includes('broadcast') || normalized.includes('announce') || normalized.includes('announcement')) {
        const title = prompt.replace(/.*(?:broadcast|announce|announcement)\s*/i, '').trim().slice(0, 120) || 'Atelier announcement';
        const body = title === 'Atelier announcement' ? 'Please review the latest updates from Atelier Administration.' : title;
        const id = randomUUID();
        adminAiPendingActions.set(id, {
          id,
          actorId: req.authUser!.uid,
          targetId: '',
          action: 'broadcast',
          reason: `Admin AI broadcast instruction: ${prompt}`.slice(0, 500),
          broadcast: { target: normalized.includes('seller') || normalized.includes('tailor') || normalized.includes('merchant') ? 'sellers' : normalized.includes('buyer') ? 'buyers' : 'all', title, body },
          expiresAt: Date.now() + 10 * 60_000,
        });
        res.json({ kind: 'confirmation_required', actionId: id, message: `I drafted a ${normalized.includes('seller') ? 'seller' : normalized.includes('buyer') ? 'buyer' : 'platform-wide'} broadcast titled "${title}". Confirm to send it.` });
        return;
      }
      if (isListingQuery && (normalized.includes('pause') || normalized.includes('archive') || normalized.includes('approve') || normalized.includes('reject'))) {
        const listingQuery = normalized.split(/\s+/).filter(word => word.length > 1 && !adminAiIntentWords.has(word)).join(' ');
        const listing = posts.find(post => [post.id, post.title, post.authorName, post.authorHandle].some(value => normalizeAdminAiPrompt(String(value || '')).includes(listingQuery)));
        if (!listing) {
          res.json({ kind: 'message', message: 'I could not identify that listing. Include its title, ID, or seller handle.' });
          return;
        }
        if (!target) {
          res.json({ kind: 'message', message: 'I could not identify a target account. Try: “Find tailor @handle” or include the seller name or email.' });
          return;
        }
        if (matches.length > 1 && (normalized.includes('warn') || normalized.includes('block'))) {
          res.json({ kind: 'message', message: `I found ${matches.length} possible accounts. Please include the exact handle, email, or shop name so I do not act on the wrong account.`, results: matches });
          return;
        }
        const action = normalized.includes('block')
          ? 'block'
          : normalized.includes('warn')
            ? 'warn'
            : normalized.includes('promote')
              ? 'promote'
              : null;
        const listingAction = normalized.includes('pause') ? 'pause_listing' : normalized.includes('archive') ? 'archive_listing' : normalized.includes('approve') ? 'approve_listing' : 'reject_listing';
        const id = randomUUID();
        adminAiPendingActions.set(id, { id, actorId: req.authUser!.uid, targetId: '', listingId: String(listing.id), action: listingAction, reason: `Admin AI listing instruction: ${prompt}`.slice(0, 500), expiresAt: Date.now() + 10 * 60_000 });
        res.json({ kind: 'confirmation_required', actionId: id, message: `I am ready to ${listingAction.replace('_listing', ' ')} “${listing.title}” by ${listing.authorName || listing.authorHandle}. Confirm to execute this listing action.` });
        return;
      }
      if (!action) {
        res.json({ kind: 'results', message: `I found ${target.name || target.handle || target.email}. Ask me to search, warn, or block this account.`, results: [target] });
        return;
      }
      if (target.role !== 'tailor' && target.role !== 'fabric_seller') {
        res.status(400).json({ error: 'The AI operator can only warn or block seller accounts.' });
        return;
      }
      const id = randomUUID();
      adminAiPendingActions.set(id, { id, actorId: req.authUser!.uid, targetId: String(target.id), action, reason: `Admin AI instruction: ${prompt}`.slice(0, 500), expiresAt: Date.now() + 10 * 60_000 });
      res.json({ kind: 'confirmation_required', actionId: id, message: `I am ready to ${action} ${target.name || target.handle || target.email}. Confirm to execute this action.`, target });
    });

    app.post('/api/admin/ai/confirm', requireAuth, requireAdmin, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
      const actionId = typeof req.body?.actionId === 'string' ? req.body.actionId : '';
      const pending = adminAiPendingActions.get(actionId);
      if (!pending || pending.expiresAt < Date.now() || pending.actorId !== req.authUser!.uid) {
        res.status(400).json({ error: 'This AI action preview expired. Run the instruction again.' });
        return;
      }
      adminAiPendingActions.delete(actionId);
      if (pending.action === 'broadcast') {
        const broadcast = pending.broadcast;
        if (!broadcast) {
          res.status(400).json({ error: 'This broadcast preview is incomplete. Run the instruction again.' });
          return;
        }
        const recipients = supabaseDataEnabled
          ? (await getUsers()).filter(profile => {
              const role = String(profile.role || '');
              return broadcast.target === 'all'
                || (broadcast.target === 'sellers' && (role === 'tailor' || role === 'fabric_seller'))
                || (broadcast.target === 'buyers' && role === 'buyer');
            })
          : (await firestore.collection('profiles').limit(500).get()).docs.filter(doc => {
              const role = doc.data().role;
              return broadcast.target === 'all'
                || (broadcast.target === 'sellers' && (role === 'tailor' || role === 'fabric_seller'))
                || (broadcast.target === 'buyers' && role === 'buyer');
            });
        const createdAt = new Date().toISOString();
        if (supabaseDataEnabled) {
          await createBroadcast(recipients.map(profile => ({
            user_id: String(profile.id),
            title: broadcast.title,
            body: broadcast.body,
            type: 'system',
            created_at: createdAt,
            is_read: false,
            action_url: '/',
          })));
          await Promise.all(recipients.map(profile => sendTopicPush(`user_${String(profile.id)}`, broadcast.title, broadcast.body.slice(0, 180), '/', 'broadcast')));
        } else {
          const batch = firestore.batch();
          recipients.forEach(doc => {
            const recipientId = String(doc.id);
            batch.set(firestore.collection('profiles').doc(recipientId).collection('notifications').doc(), {
              userId: recipientId,
              title: broadcast.title,
              body: broadcast.body,
              type: 'system',
              createdAt,
              isRead: false,
              actionUrl: '/',
            });
          });
          await batch.commit();
          await Promise.all(recipients.map(doc => sendTopicPush(`user_${String(doc.id)}`, broadcast.title, broadcast.body.slice(0, 180), '/', 'broadcast')));
        }
        res.json({ ok: true, message: `Broadcast sent to ${recipients.length} ${broadcast.target === 'all' ? 'users' : broadcast.target}.` });
        return;
      }
      if (pending.listingId) {
        const listing = await getPost(pending.listingId);
        if (!listing) {
          res.status(404).json({ error: 'The listing no longer exists.' });
          return;
        }
        const timestamp = new Date().toISOString();
        const values = pending.action === 'pause_listing'
          ? { status: 'paused', updated_at: timestamp }
          : pending.action === 'archive_listing'
            ? { status: 'archived', updated_at: timestamp }
            : pending.action === 'approve_listing'
              ? { status: 'published', moderation_status: 'approved', moderation_note: '', published_at: timestamp, updated_at: timestamp }
              : { status: 'rejected', moderation_status: 'rejected', moderation_note: pending.reason, published_at: null, updated_at: timestamp };
        const updated = await updateListing(pending.listingId, values);
        await recordListingChange(pending.listingId, pending.actorId, pending.action, { reason: pending.reason });
        invalidatePublicCaches();
        const verb = pending.action.replace('_listing', '');
        res.json({ ok: true, message: `${verb.charAt(0).toUpperCase() + verb.slice(1)} "${String(updated.title || 'listing')}" successfully.` });
        return;
      }
      const profile = await readProfile(pending.targetId);
      if (!profile || (profile.role !== 'tailor' && profile.role !== 'fabric_seller')) {
        res.status(404).json({ error: 'The seller account no longer exists or is no longer eligible.' });
        return;
      }
      const updates = pending.action === 'block'
        ? { isBlocked: true, warningNote: pending.reason }
        : pending.action === 'warn'
          ? { isWarned: true, warningNote: pending.reason }
          : { isPromoted: true };
      await writeProfile(pending.targetId, updates);
      if (pending.action === 'block') await adminAuth.updateUser(pending.targetId, { disabled: true });
      res.json({ ok: true, message: `${pending.action === 'block' ? 'Blocked' : pending.action === 'warn' ? 'Warned' : 'Promoted'} ${profile.name || profile.handle || 'seller'} successfully.` });
    });
    res.json(users);
  } catch (error) {
    console.error('Unable to load administrator user data', error);
    res.status(503).json({ error: 'Administrator user data is temporarily unavailable. Please try again shortly.' });
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

app.get('/api/me/blocked-sellers', requireAuth, async (req: AuthenticatedRequest, res) => {
  res.json(await getMarketplaceBlockedSellerIds(req.authUser!.uid));
});

app.get('/api/me/recommendation-preferences', requireAuth, requireActiveAccount, async (req: AuthenticatedRequest, res) => {
  if (!supabaseDataEnabled) {
    res.status(503).json({ error: 'Account-level recommendation preferences require the Supabase data service.' });
    return;
  }
  try {
    const preferences = await getMarketplaceUserPreferences(req.authUser!.uid);
    res.json({ preferences: serializeRecommendationPreferences(preferences) });
  } catch (error) {
    console.error('Unable to load recommendation preferences.', error);
    res.status(503).json({ error: 'Recommendation preferences could not be loaded.' });
  }
});

app.put('/api/me/recommendation-preferences', requireAuth, requireActiveAccount, async (req: AuthenticatedRequest, res) => {
  if (!supabaseDataEnabled) {
    res.status(503).json({ error: 'Account-level recommendation preferences require the Supabase data service.' });
    return;
  }
  const input = req.body?.preferences;
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || typeof input.enabled !== 'boolean'
    || !Array.isArray(input.categories) || !Array.isArray(input.styles)
    || input.categories.length > 20 || input.styles.length > 20
    || [...input.categories, ...input.styles].some(value => typeof value !== 'string' || !value.trim() || value.trim().length > 80)
    || (input.minimumPrice !== null && (!Number.isFinite(input.minimumPrice) || input.minimumPrice < 0))
    || (input.maximumPrice !== null && (!Number.isFinite(input.maximumPrice) || input.maximumPrice < 0))) {
    res.status(400).json({ error: 'Choose valid recommendation preferences and price bounds.' });
    return;
  }
  const currency = typeof input.currency === 'string' ? input.currency.trim().toUpperCase() : '';
  const multiplier = currencyMinorUnitMultiplier(currency);
  if (((input.minimumPrice !== null || input.maximumPrice !== null) && multiplier === null)
    || (input.minimumPrice !== null && input.maximumPrice !== null && input.minimumPrice > input.maximumPrice)) {
    res.status(400).json({ error: 'Choose a valid currency and a price range where the minimum does not exceed the maximum.' });
    return;
  }
  const toMinor = (value: unknown) => typeof value === 'number' && multiplier !== null
    ? Math.round(value * multiplier)
    : null;
  const minimumPriceMinor = toMinor(input.minimumPrice);
  const maximumPriceMinor = toMinor(input.maximumPrice);
  if ((input.minimumPrice !== null && !Number.isSafeInteger(minimumPriceMinor))
    || (input.maximumPrice !== null && !Number.isSafeInteger(maximumPriceMinor))) {
    res.status(400).json({ error: 'Enter prices within the supported currency range.' });
    return;
  }
  try {
    await saveMarketplaceUserPreferences(req.authUser!.uid, {
      enabled: input.enabled,
      categories: input.categories,
      styles: input.styles,
      minimumPriceMinor,
      maximumPriceMinor,
      currency: currency || null,
      country: typeof input.country === 'string' ? input.country.trim().slice(0, 80) : '',
      state: typeof input.state === 'string' ? input.state.trim().slice(0, 80) : '',
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Unable to save recommendation preferences.', error);
    res.status(503).json({ error: 'Recommendation preferences could not be saved.' });
  }
});

app.delete('/api/me/recommendation-preferences', requireAuth, requireActiveAccount, async (req: AuthenticatedRequest, res) => {
  if (!supabaseDataEnabled) {
    res.status(503).json({ error: 'Account-level recommendation preferences require the Supabase data service.' });
    return;
  }
  try {
    await resetMarketplacePersonalization(req.authUser!.uid);
    res.status(204).send();
  } catch (error) {
    console.error('Unable to reset recommendation preferences.', error);
    res.status(503).json({ error: 'Recommendation preferences could not be reset.' });
  }
});

app.put('/api/me/recommendation-feedback/:listingId', requireAuth, requireActiveAccount, async (req: AuthenticatedRequest, res) => {
  const listingId = req.params.listingId;
  const interactionType = req.body?.interactionType;
  const active = req.body?.active;
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
  if (!isUuid(listingId) || !['hide', 'dismiss', 'not_interested'].includes(interactionType)
    || typeof active !== 'boolean' || !isUuid(sessionId)) {
    res.status(400).json({ error: 'Choose a valid listing and recommendation feedback action.' });
    return;
  }
  if (!supabaseDataEnabled) {
    res.status(503).json({ error: 'Account-level recommendation feedback requires the Supabase data service.' });
    return;
  }
  if (!await enforceAbuseLimit(req, res, 'recommendation_feedback', listingId)) return;
  try {
    const result = await setMarketplaceRecommendationFeedback({
      userId: req.authUser!.uid,
      listingId,
      interactionType,
      active,
      sessionHash: createHash('sha256').update(`marketplace-session:${sessionId}`).digest('hex'),
      reason,
    });
    if (result === 'rate_limited') {
      res.status(429).json({ error: 'Recommendation feedback is temporarily limited. Please try again later.' });
      return;
    }
    if (result === 'ineligible') {
      res.status(404).json({ error: 'That listing is no longer available for recommendation feedback.' });
      return;
    }
    invalidatePublicCaches();
    res.json({ ok: true, active: result === 'hidden' });
  } catch (error) {
    console.error('Unable to update recommendation feedback.', error);
    res.status(503).json({ error: 'Recommendation feedback could not be saved.' });
  }
});

app.put('/api/me/blocked-sellers/:sellerId', requireAuth, requireActiveAccount, async (req: AuthenticatedRequest, res) => {
  const sellerId = req.params.sellerId;
  if (!isUuid(sellerId) || sellerId === req.authUser!.uid || typeof req.body?.blocked !== 'boolean') {
    res.status(400).json({ error: 'Choose a valid seller and block action.' });
    return;
  }
  const outcome = await setMarketplaceUserBlock({
    actorId: req.authUser!.uid,
    blockedUserId: sellerId,
    blocked: req.body.blocked,
  });
  if (outcome === 'rate_limited') {
    res.status(429).json({ error: 'Too many block-list changes. Please try again later.' });
    return;
  }
  marketplaceFeedCache.clear();
  res.json({ blocked: outcome === 'blocked' });
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
        rating: Number(listing.rating_average) || 0,
        ratingCount: Number(listing.rating_count) || 0,
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
  const reason = listingText(req.body?.reason, 1000);
  if (!isUuid(req.params.reportId) || (status !== 'reviewed' && status !== 'dismissed') || reason.length < 5) {
    res.status(400).json({ error: 'Choose a valid report decision and provide a reason of at least 5 characters.' });
    return;
  }
  await updateListingReport({
    reportId: req.params.reportId,
    status,
    actorId: req.authUser!.uid,
    reason,
  });
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
  if (!await enforceAbuseLimit(req, res, 'listing_write')) return;
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
  if (!await enforceAbuseLimit(req, res, 'listing_write', req.params.postId)) return;
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
  if (!await enforceAbuseLimit(req, res, 'listing_write', req.params.postId)) return;
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

app.post('/api/posts/:postId/report', requireAuth, requireActiveAccount, async (req: AuthenticatedRequest, res) => {
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
  if (!await enforceAbuseLimit(req, res, 'listing_report', req.params.postId)) return;
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

const REVIEW_SUBMISSIONS_ENABLED = false;
const REVIEW_TYPES = new Set(['listing', 'seller']);
const REVIEW_CATEGORY_KEYS = new Set(['quality', 'communication', 'accuracy', 'timeliness', 'value']);
const REVIEW_REPORT_REASONS = new Set(['harassment', 'personal_information', 'spam', 'conflict_of_interest', 'policy_violation', 'other']);
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

app.post('/api/sellers/review-summaries', optionalAuth, async (req: AuthenticatedRequest, res) => {
  const sellerIds: string[] = Array.isArray(req.body?.sellerIds)
    ? req.body.sellerIds.filter((id: unknown): id is string => typeof id === 'string').slice(0, 50)
    : [];
  if (sellerIds.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
    res.status(400).json({ error: 'Seller identifiers are invalid.' });
    return;
  }
  try {
    res.json(await getSellerReviewSummaries(sellerIds));
  } catch (error) {
    console.error('Unable to load seller review summaries.', error);
    res.status(503).json({ error: 'Seller review summaries could not be loaded.' });
  }
});

app.get('/api/reviews/:type/:targetId', optionalAuth, reviewRoute(async (req, res) => {
  const type = req.params.type;
  if (!REVIEW_TYPES.has(type) || !isUuid(req.params.targetId)) {
    res.status(400).json({ error: 'Choose a valid review type and target.' });
    return;
  }
  let cursor: { createdAt: string; id: string } | undefined;
  if (req.query.cursor !== undefined) {
    const encodedCursor = typeof req.query.cursor === 'string' ? req.query.cursor : '';
    if (!/^[A-Za-z0-9_-]{1,512}$/.test(encodedCursor)) {
      res.status(400).json({ error: 'Review page cursor is invalid.' });
      return;
    }
    try {
      const decoded = JSON.parse(Buffer.from(encodedCursor, 'base64url').toString('utf8')) as Record<string, unknown>;
      const createdAt = typeof decoded.createdAt === 'string' ? Date.parse(decoded.createdAt) : Number.NaN;
      if (!isUuid(String(decoded.id)) || !Number.isFinite(createdAt)) throw new Error('Invalid cursor values.');
      cursor = { createdAt: new Date(createdAt).toISOString(), id: String(decoded.id) };
    } catch {
      res.status(400).json({ error: 'Review page cursor is invalid.' });
      return;
    }
  }
  if (type === 'listing') {
    const listing = await getPost(req.params.targetId);
    const author = listing?.author as Record<string, unknown> | undefined;
    if (!listing || !['CLOTHING', 'FABRIC'].includes(String(listing.listing_type))
      || listing.status !== 'published'
      || listing.moderation_status !== 'approved'
      || listing.deleted_at
      || listing.is_blocked
      || listing.availability === 'unavailable'
      || listing.availability === 'sold_out'
      || author?.is_blocked) {
      res.status(404).json({ error: 'That public listing could not be found.' });
      return;
    }
  } else {
    const seller = await getProfile(req.params.targetId);
    if (!seller || !['tailor', 'fabric_seller'].includes(String(seller.role))
      || seller.is_blocked === true || seller.isBlocked === true) {
      res.status(404).json({ error: 'That public seller profile could not be found.' });
      return;
    }
  }
  const result = await getMarketplaceReviews({
    type: type as 'listing' | 'seller',
    targetId: req.params.targetId,
    viewerId: req.authUser?.uid,
    cursor,
  });
  res.json({ ...snakeToCamel(result), reviewSubmissionsEnabled: REVIEW_SUBMISSIONS_ENABLED });
}));

app.post('/api/reviews/:type/:targetId', requireAuth, requireActiveAccount, reviewRoute(async (req, res) => {
  if (!REVIEW_SUBMISSIONS_ENABLED) {
    res.status(503).json({
      error: 'Review submissions are temporarily unavailable. Please check back later.',
      code: 'REVIEW_SUBMISSIONS_UNAVAILABLE',
    });
    return;
  }
  const type = req.params.type;
  const rating = Number(req.body?.rating);
  if (!REVIEW_TYPES.has(type) || !isUuid(req.params.targetId) || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: 'Choose a valid review type and a whole-star rating from 1 to 5.' });
    return;
  }
  if (req.body?.firsthandAttested !== true) {
    res.status(400).json({ error: 'Confirm that this feedback is based on your firsthand experience.' });
    return;
  }
  const reviewText = listingText(req.body?.reviewText, 4000);
  const inputCategories = req.body?.categoryBreakdown;
  if (inputCategories !== undefined && (!inputCategories || typeof inputCategories !== 'object' || Array.isArray(inputCategories)
    || Object.keys(inputCategories).length > REVIEW_CATEGORY_KEYS.size
    || Object.entries(inputCategories).some(([key, value]) => !REVIEW_CATEGORY_KEYS.has(key) || !Number.isInteger(value) || Number(value) < 1 || Number(value) > 5))) {
    res.status(400).json({ error: 'Review category ratings must be whole stars from 1 to 5.' });
    return;
  }
  const contextListingId = typeof req.body?.contextListingId === 'string' ? req.body.contextListingId : undefined;
  if (contextListingId && !isUuid(contextListingId)) {
    res.status(400).json({ error: 'Choose a valid context listing.' });
    return;
  }
  if (!await enforceAbuseLimit(req, res, 'review_write', req.params.targetId)) return;
  const review = await submitMarketplaceReview({
    type: type as 'listing' | 'seller',
    targetId: req.params.targetId,
    reviewerId: req.authUser!.uid,
    rating,
    reviewText,
    categoryBreakdown: (inputCategories || {}) as Record<string, number>,
    contextListingId,
  });
  invalidatePublicCaches();
  res.status(201).json(snakeToCamel(review));
}));

app.post('/api/reviews/:type/:reviewId/response', requireAuth, requireActiveAccount, reviewRoute(async (req, res) => {
  if (!REVIEW_TYPES.has(req.params.type) || !isUuid(req.params.reviewId)) {
    res.status(400).json({ error: 'Choose a valid review type and review.' });
    return;
  }
  const response = listingText(req.body?.response, 2000);
  if (response.length < 2) {
    res.status(400).json({ error: 'Enter a response of at least 2 characters.' });
    return;
  }
  await respondToMarketplaceReview({
    type: req.params.type as 'listing' | 'seller',
    reviewId: req.params.reviewId,
    sellerId: req.authUser!.uid,
    response,
  });
  res.json({ ok: true });
}));

app.post('/api/reviews/:type/:reviewId/helpful', requireAuth, requireActiveAccount, reviewRoute(async (req, res) => {
  if (!REVIEW_TYPES.has(req.params.type) || !isUuid(req.params.reviewId)) {
    res.status(400).json({ error: 'Choose a valid review type and review.' });
    return;
  }
  if (!await enforceAbuseLimit(req, res, 'review_helpful', req.params.reviewId)) return;
  const result = await toggleReviewHelpful({
    type: req.params.type as 'listing' | 'seller',
    reviewId: req.params.reviewId,
    voterId: req.authUser!.uid,
  });
  res.json(result);
}));

app.post('/api/reviews/:type/:reviewId/reports', requireAuth, requireActiveAccount, reviewRoute(async (req, res) => {
  if (!REVIEW_TYPES.has(req.params.type) || !isUuid(req.params.reviewId) || !REVIEW_REPORT_REASONS.has(req.body?.reason)) {
    res.status(400).json({ error: 'Choose a valid review type and report reason.' });
    return;
  }
  if (!await enforceAbuseLimit(req, res, 'review_report', req.params.reviewId)) return;
  await reportMarketplaceReview({
    type: req.params.type as 'listing' | 'seller',
    reviewId: req.params.reviewId,
    reporterId: req.authUser!.uid,
    reason: req.body.reason,
    details: listingText(req.body?.details, 1000),
  });
  res.status(201).json({ ok: true });
}));

app.post('/api/reviews/:type/:reviewId/appeals', requireAuth, requireActiveAccount, reviewRoute(async (req, res) => {
  if (!REVIEW_TYPES.has(req.params.type) || !isUuid(req.params.reviewId)) {
    res.status(400).json({ error: 'Choose a valid review type and review.' });
    return;
  }
  const reason = listingText(req.body?.reason, 1000);
  if (reason.length < 10) {
    res.status(400).json({ error: 'Please provide at least 10 characters explaining your appeal.' });
    return;
  }
  if (!await enforceAbuseLimit(req, res, 'review_appeal', req.params.reviewId)) return;
  await createMarketplaceReviewAppeal({
    type: req.params.type as 'listing' | 'seller',
    reviewId: req.params.reviewId,
    reviewerId: req.authUser!.uid,
    reason,
  });
  res.status(201).json({ ok: true });
}));

app.get('/api/admin/reviews', requireAuth, requireAdmin, reviewRoute(async (_req, res) => {
  res.json(snakeToCamel(await getReviewModerationQueue()));
}));

app.patch('/api/admin/reviews/:type/:reviewId', requireAuth, requireAdmin, reviewRoute(async (req, res) => {
  if (!REVIEW_TYPES.has(req.params.type) || !isUuid(req.params.reviewId) || !['published', 'rejected', 'removed'].includes(req.body?.decision)) {
    res.status(400).json({ error: 'Choose a valid review type and moderation decision.' });
    return;
  }
  const reason = listingText(req.body?.reason, 1000);
  if (reason.length < 5) {
    res.status(400).json({ error: 'A moderation reason of at least 5 characters is required.' });
    return;
  }
  await moderateMarketplaceReview({
    type: req.params.type as 'listing' | 'seller',
    reviewId: req.params.reviewId,
    actorId: req.authUser!.uid,
    decision: req.body.decision,
    reason,
  });
  invalidatePublicCaches();
  res.json({ ok: true });
}));

app.patch('/api/admin/review-appeals/:appealId', requireAuth, requireAdmin, reviewRoute(async (req, res) => {
  if (!isUuid(req.params.appealId) || !['upheld', 'overturned'].includes(req.body?.decision)) {
    res.status(400).json({ error: 'Choose upheld or overturned for the appeal decision.' });
    return;
  }
  const reason = listingText(req.body?.reason, 1000);
  if (reason.length < 5) {
    res.status(400).json({ error: 'An appeal decision reason of at least 5 characters is required.' });
    return;
  }
  await resolveMarketplaceReviewAppeal({
    appealId: req.params.appealId,
    actorId: req.authUser!.uid,
    decision: req.body.decision,
    reason,
  });
  invalidatePublicCaches();
  res.json({ ok: true });
}));

app.patch('/api/admin/review-reports/:reportId', requireAuth, requireAdmin, reviewRoute(async (req, res) => {
  if (!isUuid(req.params.reportId) || !['reviewed', 'dismissed'].includes(req.body?.decision)) {
    res.status(400).json({ error: 'Choose reviewed or dismissed for the report decision.' });
    return;
  }
  const reason = listingText(req.body?.reason, 1000);
  if (reason.length < 5) {
    res.status(400).json({ error: 'A report resolution reason of at least 5 characters is required.' });
    return;
  }
  await updateReviewReport({
    reportId: req.params.reportId,
    actorId: req.authUser!.uid,
    status: req.body.decision,
    resolutionNote: reason,
  });
  res.json({ ok: true });
}));

app.get('/api/admin/abuse-flags', requireAuth, requireAdmin, async (_req, res) => {
  try {
    res.json(snakeToCamel(await getMarketplaceAbuseFlags()));
  } catch (error) {
    console.error('Unable to load marketplace abuse flags.', error);
    res.status(503).json({ error: 'Marketplace abuse flags could not be loaded.' });
  }
});

app.patch('/api/admin/abuse-flags/:flagId', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
  const flagId = Number(req.params.flagId);
  const status = req.body?.status;
  const reason = listingText(req.body?.reason, 1000);
  if (!Number.isSafeInteger(flagId) || flagId < 1
    || !['investigating', 'resolved', 'dismissed'].includes(status)
    || reason.length < 5) {
    res.status(400).json({ error: 'Choose a valid abuse flag, status, and resolution reason.' });
    return;
  }
  try {
    await resolveMarketplaceAbuseFlag({
      flagId,
      actorId: req.authUser!.uid,
      status: status as 'investigating' | 'resolved' | 'dismissed',
      reason,
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Unable to resolve marketplace abuse flag.', error);
    res.status(503).json({ error: 'Marketplace abuse flag could not be updated.' });
  }
});

app.post('/api/posts/:postId/rating', requireAuth, async (req: AuthenticatedRequest, res) => {
  res.status(410).json({ error: 'Star-only ratings are retired. Please submit a firsthand review instead.' });
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
  let enquiryListingId = '';
  if (supabaseDataEnabled && typeof input.postId === 'string' && input.postId.trim()) {
    enquiryListingId = input.postId.trim();
    const listing = await getPost(enquiryListingId);
    if (!listing
      || listing.author_id !== input.recipientId
      || listing.status !== 'published'
      || listing.moderation_status !== 'approved'
      || listing.deleted_at
      || listing.is_blocked
      || !['CLOTHING', 'FABRIC'].includes(String(listing.listing_type))) {
      res.status(400).json({ error: 'The selected listing is not available for this enquiry.' });
      return;
    }
  }
  const message = {
    sender_id: req.authUser!.uid, sender_name: String(input.senderName || '').slice(0, 120), sender_role: String(input.senderRole || 'buyer'),
    recipient_id: input.recipientId, recipient_name: String(input.recipientName || '').slice(0, 120),
    post_id: typeof input.postId === 'string' ? input.postId : '', post_title: typeof input.postTitle === 'string' ? input.postTitle.slice(0, 160) : '',
    content: input.content.trim().slice(0, 3000), timestamp: new Date().toISOString(), is_read: false,
  };
  if (supabaseDataEnabled) {
    const created = await createMessage(message);
    if (enquiryListingId) {
      const sessionHash = createHash('sha256')
        .update(`marketplace-message:${req.authUser!.uid}:${enquiryListingId}`)
        .digest('hex');
      try {
        await recordMarketplaceEngagementEvent({
          listingId: enquiryListingId,
          eventType: 'ENQUIRY',
          actorId: req.authUser!.uid,
          sessionHash,
        });
      } catch (error) {
        console.error('Unable to record listing enquiry after a message was sent.', error);
      }
    }
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

app.post('/api/posts/:postId/like', requireAuth, requireActiveAccount, async (req: AuthenticatedRequest, res) => {
  if (supabaseDataEnabled) {
    const listing = await getPost(req.params.postId);
    if (!listing || listing.status !== 'published' || listing.moderation_status !== 'approved' || listing.deleted_at) {
      res.status(404).json({ error: 'That published listing no longer exists.' });
      return;
    }
    if (!await enforceAbuseLimit(req, res, 'like', req.params.postId)) return;
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

app.post('/api/posts/:postId/save', requireAuth, requireActiveAccount, async (req: AuthenticatedRequest, res: Response) => {
  if (supabaseDataEnabled) {
    const listing = await getPost(req.params.postId);
    if (!listing || listing.status !== 'published' || listing.moderation_status !== 'approved' || listing.deleted_at) {
      res.status(404).json({ error: 'That published listing no longer exists.' });
      return;
    }
    if (!await enforceAbuseLimit(req, res, 'save', req.params.postId)) return;
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
  if (typeof req.body?.blocked !== 'boolean') {
    res.status(400).json({ error: 'Choose whether the account should be blocked.' });
    return;
  }
  const blocked = req.body.blocked;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 5 || reason.length > 1000) {
    res.status(400).json({ error: 'Provide an enforcement reason between 5 and 1000 characters.' });
    return;
  }
  if (supabaseDataEnabled) {
    if (req.params.uid === req.authUser!.uid) {
      res.status(400).json({ error: 'You cannot block your own account.' });
      return;
    }
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
    if (!await enforceAbuseLimit(req, res, 'admin_account_enforcement', req.params.uid)) return;
    await setMarketplaceAccountBlock({
      actorId: req.authUser!.uid,
      targetId: req.params.uid,
      blocked,
      reason,
    });
    invalidatePublicCaches();
    res.json({ ok: true, blocked });
    return;
  }
  if (req.params.uid === req.authUser!.uid) {
    res.status(400).json({ error: 'You cannot block your own account.' });
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
  await profileRef.set({
    isBlocked: blocked,
    updatedAt: FieldValue.serverTimestamp(),
    enforcementReason: reason,
    enforcementActorId: req.authUser!.uid,
  }, { merge: true });
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
    res.status(413).json({ error: 'Images must be 8 MB or smaller.', code: 'IMAGE_TOO_LARGE' });
    return;
  }
  console.error('API error', error);
  res.status(500).json({ error: 'Something went wrong. Please try again shortly.', code: 'INTERNAL_ERROR' });
});

app.listen(port, () => {
  console.log(`Atelier API listening on http://localhost:${port}`);
  const refreshTrends = async () => {
    try {
      await refreshMarketplaceTrends();
    } catch (error) {
      console.error('Unable to refresh marketplace trend snapshots.', error);
    }
  };
  void refreshTrends();
  const trendRefreshTimer = setInterval(() => { void refreshTrends(); }, 10 * 60 * 1000);
  trendRefreshTimer.unref();
});
