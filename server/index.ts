import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { FieldValue } from 'firebase-admin/firestore';
import type { Transaction } from 'firebase-admin/firestore';
import multer from 'multer';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import { adminAuth, firestore } from './firebaseAdmin.js';

const app = express();
const port = Number(process.env.PORT || 8787);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001,http://192.168.186.15:3001').split(',').map((origin) => origin.trim()).filter(Boolean);

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

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
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
  authUser?: { uid: string; email?: string; admin?: boolean };
}

interface StoredMessage {
  id: string;
  timestamp?: string;
  [key: string]: unknown;
}

const DISCOVERY_EVENT_TYPES = new Set(['VIEW', 'LIKE', 'SAVE', 'SHARE', 'ENQUIRY', 'ADD_TO_CART', 'PURCHASE', 'RATING']);

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  try {
    const token = await adminAuth.verifyIdToken(header.slice(7));
    const profile = await firestore.collection('profiles').doc(token.uid).get();
    const profileData = profile.exists ? profile.data() as Record<string, unknown> : {};
    const isAdminFromProfile = profileData.role === 'admin' || token.email?.trim().toLowerCase() === 'fountainsdata234@gmail.com' || token.admin === true || token.role === 'admin';
    req.authUser = { uid: token.uid, email: token.email, admin: Boolean(isAdminFromProfile) };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
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
    updatedAt: FieldValue.serverTimestamp(),
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
  updates.updatedAt = FieldValue.serverTimestamp();

  return updates;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'atelier-api' });
});

app.post('/api/upload', requireAuth, upload.single('image'), async (req: AuthenticatedRequest, res) => {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    res.status(500).json({ error: 'Cloudinary credentials are not configured on the server.' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'No image file was provided.' });
    return;
  }

  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];
  if (!allowedMimeTypes.includes(req.file.mimetype)) {
    res.status(400).json({ error: 'Only common image types are allowed.' });
    return;
  }

  const requestedFolder = String(req.body?.folder || 'atelier');
  const safeFolder = ['profiles', 'posts', 'atelier'].includes(requestedFolder) ? requestedFolder : 'atelier';

  try {
    const optimizedBuffer = await sharp(req.file.buffer)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 78, progressive: true, mozjpeg: true })
      .toBuffer();

    const result = await new Promise<{ secure_url: string; public_id: string; width?: number; height?: number }>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: safeFolder,
          resource_type: 'image',
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        },
        (error, uploadResult) => {
          if (error) {
            reject(error);
            return;
          }

          if (!uploadResult) {
            reject(new Error('Cloudinary upload failed.'));
            return;
          }

          resolve(uploadResult as { secure_url: string; public_id: string; width?: number; height?: number });
        }
      );

      uploadStream.end(optimizedBuffer);
    });

    res.status(201).json({
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
    });
  } catch (error) {
    console.error('Cloudinary upload failed', error);
    res.status(500).json({ error: 'Image upload failed on the server.' });
  }
});

app.get('/api/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  const snapshot = await firestore.collection('profiles').doc(req.authUser!.uid).get();
  res.json({ id: req.authUser!.uid, ...(snapshot.exists ? snapshot.data() : {}) });
});

app.get('/api/promo-plans', async (_req, res) => {
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
  await firestore.collection('settings').doc('promoPlans').set({ plans, updatedAt: FieldValue.serverTimestamp(), updatedBy: req.authUser!.uid });
  res.json(plans);
});

app.put('/api/users/:uid/profile', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
  const updates = buildProfileUpdate(req.body || {});
  const uid = req.params.uid;
  const profileRef = firestore.collection('profiles').doc(uid);

  if (typeof req.body?.isBlocked === 'boolean' || typeof req.body?.isWarned === 'boolean' || typeof req.body?.warningNote === 'string') {
    const targetSnapshot = await profileRef.get();
    const targetRole = targetSnapshot.data()?.role;
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
  await firestore.collection('profiles').doc(req.authUser!.uid).set({
    ...profile,
    id: req.authUser!.uid,
    email: req.authUser!.email || '',
  }, { merge: true });
  const welcomeSnapshot = await firestore.collection('messages')
    .where('recipientId', '==', req.authUser!.uid)
    .limit(200)
    .get();
  const hasWelcomeMessage = welcomeSnapshot.docs.some(doc => doc.data().senderId === 'atelier-system');
  if (!hasWelcomeMessage) {
    const profileName = String(profile.name || req.authUser!.email?.split('@')[0] || 'Atelier Member');
    await firestore.collection('messages').add({
      senderId: 'atelier-system',
      senderName: 'Atelier Team',
      senderRole: 'admin',
      recipientId: req.authUser!.uid,
      recipientName: profileName,
      postId: '',
      postTitle: 'Welcome to Atelier',
      content: `Welcome, ${profileName}. Welcome to Atelier Marketplace. Explore the marketplace, follow trusted studios, and message sellers directly whenever you are ready.`,
      timestamp: new Date().toISOString(),
      isRead: false,
      type: 'general',
    });
  }
  const saved = await firestore.collection('profiles').doc(req.authUser!.uid).get();
  res.json(saved.data());
});

app.get('/api/posts', async (_req, res) => {
  const snapshot = await firestore.collection('posts').limit(100).get();
  const profileSnapshot = await firestore.collection('profiles').get();
  const profiles = new Map(profileSnapshot.docs.map(doc => [doc.id, doc.data()]));
    const posts: Array<Record<string, unknown> & { id: string; isBlocked?: boolean }> = (await Promise.all(snapshot.docs.map(async doc => {
    const data = doc.data() as Record<string, unknown>;
    const author = profiles.get(String(data.authorId)) || {};
      const [likesSnapshot, savesSnapshot, ratingsSnapshot] = await Promise.all([
        doc.ref.collection('likes').get(),
        doc.ref.collection('saves').get(),
        doc.ref.collection('ratings').get(),
      ]);
      const ratings = ratingsSnapshot.docs.map(item => Number(item.data().rating)).filter(value => value >= 1 && value <= 5);
    return {
      id: doc.id,
      ...data,
      authorName: author.shopName || author.name || 'Atelier Member',
      authorRole: author.role || 'tailor',
      authorHandle: author.handle || '@atelier_member',
      authorAvatar: author.avatarUrl || '',
      authorLocation: author.location || { country: '', state: '', city: '' },
      authorWhatsapp: author.whatsappNumber || '',
      isBlocked: data.isBlocked === true,
      likes: likesSnapshot.docs.map(item => item.id),
      saves: savesSnapshot.docs.map(item => item.id),
      rating: ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0,
      ratingCount: ratings.length,
    };
    }))).filter(post => post.isBlocked !== true);
  posts.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  res.json(posts);
});

app.get('/api/users', async (_req, res) => {
  const snapshot = await firestore.collection('profiles').limit(500).get();
  res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
});

app.post('/api/users/:uid/follow', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.params.uid === req.authUser!.uid) {
    res.status(400).json({ error: 'You cannot follow your own account.' });
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
  res.json(updated);
});

app.get('/api/discovery-events', requireAuth, async (req: AuthenticatedRequest, res) => {
  const snapshot = await firestore.collection('discoveryEvents').limit(5000).get();
  const events = snapshot.docs.map(doc => {
    const event = doc.data();
    return {
      itemId: String(event.itemId || ''),
      eventType: String(event.eventType || 'VIEW'),
      timestamp: String(event.timestamp || ''),
      sessionId: String(event.sessionId || ''),
      ...(event.userId === req.authUser!.uid ? { userId: req.authUser!.uid } : {}),
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
    userId: req.authUser!.uid,
    itemId,
    eventType,
    sessionId,
    timestamp: new Date().toISOString(),
  };
  const created = await firestore.collection('discoveryEvents').add(event);
  res.status(201).json({ id: created.id, ...event });
});

app.post('/api/posts', requireAuth, async (req: AuthenticatedRequest, res) => {
  const input = req.body || {};
  if (typeof input.title !== 'string' || !input.title.trim() || typeof input.imageUrl !== 'string' || !input.imageUrl.trim()) {
    res.status(400).json({ error: 'A title and image are required.' });
    return;
  }
  const authorProfile = await firestore.collection('profiles').doc(req.authUser!.uid).get();
  const authorRole = authorProfile.data()?.role;
  if (authorRole !== 'tailor' && authorRole !== 'fabric_seller') {
    res.status(403).json({ error: 'Only approved tailors and fabric sellers can publish marketplace items.' });
    return;
  }
  const post = {
    authorId: req.authUser!.uid,
    authorRole,
    title: input.title.trim().slice(0, 160),
    description: typeof input.description === 'string' ? input.description.trim().slice(0, 3000) : '',
    imageUrl: input.imageUrl.slice(0, 2_000_000),
    tags: Array.isArray(input.tags) ? input.tags.filter((tag: unknown) => typeof tag === 'string').slice(0, 30) : [],
    pricing: input.pricing && typeof input.pricing === 'object' ? input.pricing : {},
    createdAt: new Date().toISOString(),
    isPromoted: authorProfile.data()?.isPromoted === true,
    isBlocked: false,
    likes: [],
    saves: [],
  };
  const created = await firestore.collection('posts').add(post);
  res.status(201).json({ id: created.id, ...post });
});

app.post('/api/posts/:postId/rating', requireAuth, async (req: AuthenticatedRequest, res) => {
  const rating = Number(req.body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: 'Rating must be an integer from 1 to 5.' });
    return;
  }
  const postRef = firestore.collection('posts').doc(req.params.postId);
  const ratingRef = postRef.collection('ratings').doc(req.authUser!.uid);
  await firestore.runTransaction(async (transaction: Transaction) => {
    transaction.set(ratingRef, { rating, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(postRef, { updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  res.status(204).send();
});

app.get('/api/messages', requireAuth, async (req: AuthenticatedRequest, res) => {
  const [sent, received] = await Promise.all([
    firestore.collection('messages').where('senderId', '==', req.authUser!.uid).limit(200).get(),
    firestore.collection('messages').where('recipientId', '==', req.authUser!.uid).limit(200).get(),
  ]);
  const messages = [...sent.docs, ...received.docs]
    .map<StoredMessage>(doc => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))
    .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
  res.json(messages);
});

app.post('/api/messages/read', requireAuth, async (req: AuthenticatedRequest, res) => {
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

app.post('/api/messages', requireAuth, async (req: AuthenticatedRequest, res) => {
  const input = req.body || {};
  if (input.senderId !== req.authUser!.uid || typeof input.recipientId !== 'string' || typeof input.content !== 'string' || !input.content.trim()) {
    res.status(400).json({ error: 'Invalid message.' });
    return;
  }
  if (req.authUser!.admin) {
    const recipientSnapshot = await firestore.collection('profiles').doc(input.recipientId).get();
    const recipientRole = recipientSnapshot.data()?.role;
    if (recipientRole !== 'tailor' && recipientRole !== 'fabric_seller') {
      res.status(403).json({ error: 'Administrators can only message tailors and fabric sellers.' });
      return;
    }
  }
  const message = {
    senderId: req.authUser!.uid,
    senderName: String(input.senderName || '').slice(0, 120),
    senderRole: String(input.senderRole || 'buyer'),
    recipientId: input.recipientId,
    recipientName: String(input.recipientName || '').slice(0, 120),
    postId: typeof input.postId === 'string' ? input.postId : '',
    postTitle: typeof input.postTitle === 'string' ? input.postTitle.slice(0, 160) : '',
    content: input.content.trim().slice(0, 3000),
    timestamp: new Date().toISOString(),
    isRead: false,
  };
  const created = await firestore.collection('messages').add(message);
  res.status(201).json({ id: created.id, ...message });
});

app.post('/api/posts/:postId/like', requireAuth, async (req: AuthenticatedRequest, res) => {
  const postRef = firestore.collection('posts').doc(req.params.postId);
  const likeRef = postRef.collection('likes').doc(req.authUser!.uid);
  const result = await firestore.runTransaction(async transaction => {
    const like = await transaction.get(likeRef);
    if (like.exists) transaction.delete(likeRef);
    else transaction.set(likeRef, { createdAt: FieldValue.serverTimestamp() });
    return !like.exists;
  });
  res.json({ isLiked: result });
});

app.post('/api/posts/:postId/save', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const saveRef = firestore.collection('posts').doc(req.params.postId).collection('saves').doc(req.authUser!.uid);
  const existing = await saveRef.get();
  if (existing.exists) await saveRef.delete();
  else await saveRef.set({ createdAt: FieldValue.serverTimestamp() });
  res.json({ isSaved: !existing.exists });
});

app.delete('/api/posts/:postId', requireAuth, async (req: AuthenticatedRequest, res) => {
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
  res.status(201).json({ id: created.id, ...request });
});

app.get('/api/fabric-requests', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
  const updatedAt = new Date().toISOString();
  await requestRef.set({ status, updatedAt }, { merge: true });
  res.json({ id: requestSnapshot.id, ...requestData, status, updatedAt });
});

app.post('/api/admin/users/:uid/block', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
  const blocked = Boolean(req.body?.blocked);
  const profileRef = firestore.collection('profiles').doc(req.params.uid);
  const profileSnapshot = await profileRef.get();
  const targetRole = profileSnapshot.data()?.role;
  if (targetRole !== 'tailor' && targetRole !== 'fabric_seller') {
    res.status(403).json({ error: 'Customer accounts cannot be blocked.' });
    return;
  }
  await profileRef.set({ isBlocked: blocked, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await adminAuth.updateUser(req.params.uid, { disabled: blocked });
  res.json({ ok: true, blocked });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('API error', error);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(port, () => {
  console.log(`Atelier API listening on http://localhost:${port}`);
});
