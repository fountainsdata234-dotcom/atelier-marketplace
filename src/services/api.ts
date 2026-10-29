import { AdminPromoPlan, AppNotification, BroadcastMessage, ClothPost, DirectMessage, FabricRequest, SellerCollection, User, UserLocation, DiscoveryEvent, DiscoveryEventType, ListingImageAsset, ListingReport, LocationCity, LocationCountry, LocationCurrency, LocationRegion, MarketplaceAbuseFlag, MarketplaceFeedPage, MarketplaceFeedQuery, MarketplaceTrendingPage, MarketplaceTrendingQuery, MarketplaceTrendEventType, MarketplaceReviewType, MarketplaceReviewModerationStatus, MarketplaceReviewsPage, MarketplaceReview, MarketplaceReviewQueueItem, RecommendationPreferences, NearbySellerMatch, ReverseGeocodedBusinessLocation, BusinessLocationSearchResult } from '../types';

import { getAuthToken, isSupabaseAuthReady } from './auth';
import { customerMessageForHttpError, customerMessageForNetworkError, safeCustomerErrorMessage } from '../utils/customerMessages';

const API_URL = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:8787' : window.location.origin);
const PUBLIC_READ_CACHE_TTL_MS = 60_000;
const API_REQUEST_TIMEOUT_MS = 20_000;
const GET_RETRY_DELAYS_MS = [750, 1_500];
const publicReadCache = new Map<string, { expiresAt: number; value: unknown }>();
const inFlightPublicReads = new Map<string, Promise<unknown>>();

function getMarketplaceSessionId() {
  const key = 'atelier_marketplace_session_v1';
  const existing = sessionStorage.getItem(key);
  if (existing && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) {
    return existing;
  }
  const sessionId = crypto.randomUUID();
  sessionStorage.setItem(key, sessionId);
  return sessionId;
}

async function getAuthTokenForRequest() {
  if (!navigator.onLine || !isSupabaseAuthReady) return null;
  return getAuthToken();
}

function isCacheablePublicRead(path: string, method: string, token: string | null) {
  if (method !== 'GET' || token) return false;
  return path === '/api/posts'
    || path === '/api/users'
    || path === '/api/promo-plans'
    || path.startsWith('/api/location/')
    || path.startsWith('/api/marketplace/feed?')
    || path.startsWith('/api/marketplace/trending?')
    || /^\/api\/reviews\/(?:listing|seller)\/[0-9a-f-]+(?:\?.*)?$/i.test(path);
}

function isPublicMarketplaceRead(path: string, method: string) {
  return method === 'GET'
    && (path.startsWith('/api/marketplace/feed?') || path.startsWith('/api/marketplace/trending?'));
}

function publicReadCacheTtl(path: string) {
  if (path.startsWith('/api/marketplace/trending?')) return 120_000;
  if (path.startsWith('/api/marketplace/feed?') || path === '/api/posts') return 30_000;
  if (path.startsWith('/api/reviews/')) return 60_000;
  if (path.startsWith('/api/location/countries/') && path.includes('/cities?')) return 3_600_000;
  if (path.startsWith('/api/location/')) return 86_400_000;
  return PUBLIC_READ_CACHE_TTL_MS;
}

function invalidatePublicReadCache(path: string) {
  if (/^\/api\/(?:posts|promo-plans|admin\/listings|admin\/listings\/moderation|admin\/users|users\/[^/]+\/(?:profile|follow)|reviews|sellers\/review-summaries|me\/recommendation-feedback)/.test(path)) {
    publicReadCache.clear();
  }
}

async function request<T>(path: string, options: RequestInit = {}, hasRetried = false) {
  const method = (options.method || 'GET').toUpperCase();
  const isPublicRead = method === 'GET'
    && (['/api/posts', '/api/users', '/api/promo-plans'].includes(path)
      || path.startsWith('/api/location/')
      || isPublicMarketplaceRead(path, method));
  let token: string | null;
  try {
    token = isPublicRead ? null : await getAuthTokenForRequest();
  } catch (error) {
    throw new Error(safeCustomerErrorMessage(error, 'Please sign in again to continue.'));
  }
  if (path.startsWith('/api/messages') && !token) {
    throw new Error('Please sign in to view your messages.');
  }
  if (path.startsWith('/api/notifications') && !token) {
    throw new Error('Please sign in to view your notifications.');
  }
  if (path === '/api/profile' && !token) {
    throw new Error('Please sign in again to continue.');
  }
  const cacheable = isCacheablePublicRead(path, method, token);
  if (cacheable) {
    const cached = publicReadCache.get(path);
    if (cached && cached.expiresAt > Date.now()) return cached.value as T;
    const inFlight = inFlightPublicReads.get(path);
    if (inFlight) return inFlight as Promise<T>;
    const pending = performRequest<T>(path, options, token, hasRetried)
      .then(value => {
        if (publicReadCache.size >= 100 && !publicReadCache.has(path)) {
          const oldestPath = publicReadCache.keys().next().value;
          if (oldestPath) publicReadCache.delete(oldestPath);
        }
        publicReadCache.set(path, {
          expiresAt: Date.now() + publicReadCacheTtl(path),
          value,
        });
        return value;
      })
      .catch(error => {
        if (!cached) throw error;
        if (import.meta.env.DEV) console.warn('Public marketplace data could not be refreshed.', error);
        return cached.value as T;
      })
      .finally(() => inFlightPublicReads.delete(path));
    inFlightPublicReads.set(path, pending);
    return pending;
  }
  return performRequest<T>(path, options, token, hasRetried);
}

async function performRequest<T>(
  path: string,
  options: RequestInit,
  token: string | null,
  hasRetried: boolean,
  retryAttempt = 0,
) {
  const method = (options.method || 'GET').toUpperCase();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    if (method === 'GET' && retryAttempt < GET_RETRY_DELAYS_MS.length && navigator.onLine) {
      await new Promise<void>(resolve => window.setTimeout(resolve, GET_RETRY_DELAYS_MS[retryAttempt]));
      return performRequest<T>(path, options, token, hasRetried, retryAttempt + 1);
    }
    if (token && isPublicMarketplaceRead(path, method)) {
      if (import.meta.env.DEV) console.warn('Retrying public marketplace data without account-specific details.', error);
      return performRequest<T>(path, options, null, hasRetried);
    }
    throw new Error(customerMessageForNetworkError(error));
  } finally {
    window.clearTimeout(timeout);
  }
  if (response.status === 401 && token && !hasRetried) {
    return request<T>(path, options, true);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const requestError = new Error(customerMessageForHttpError(response.status, body.error, path, body.code));
    if ([502, 503, 504].includes(response.status)
      && method === 'GET'
      && retryAttempt < GET_RETRY_DELAYS_MS.length) {
      await new Promise<void>(resolve => window.setTimeout(resolve, GET_RETRY_DELAYS_MS[retryAttempt]));
      return performRequest<T>(path, options, token, hasRetried, retryAttempt + 1);
    }
    if ([502, 503, 504].includes(response.status)
      && token
      && isPublicMarketplaceRead(path, method)) {
      if (import.meta.env.DEV) console.warn('Retrying public marketplace data without account-specific details.', requestError);
      return performRequest<T>(path, options, null, hasRetried);
    }
    throw requestError;
  }
  if (method !== 'GET') invalidatePublicReadCache(path);
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export const api = {
  getLocationCountries: () => request<LocationCountry[]>('/api/location/countries'),
  getLocationCurrencies: () => request<LocationCurrency[]>('/api/location/currencies'),
  resolveMapLocations: (locations: Array<{ id: string; location: UserLocation }>) => request<Array<{ id: string; location: UserLocation }>>('/api/location/resolve', {
    method: 'POST',
    body: JSON.stringify({ locations }),
  }),
  reverseGeocodeBusinessLocation: (coordinates: { lat: number; lng: number; accuracyMeters: number }) => request<ReverseGeocodedBusinessLocation>('/api/location/reverse-business', {
    method: 'POST',
    body: JSON.stringify(coordinates),
  }),
  searchBusinessLocations: (query: string) => request<BusinessLocationSearchResult[]>(`/api/location/search-business?q=${encodeURIComponent(query)}`),
  saveBusinessLocation: (confirmationToken: string, businessAddress: string) => request<UserLocation>('/api/profile/business-location', {
    method: 'PUT',
    body: JSON.stringify({ confirmationToken, businessAddress, confirmBusinessLocation: true }),
  }),
  getNearbySellers: (coordinates: { lat: number; lng: number }, radiusKm: number) => {
    const query = new URLSearchParams({ lat: String(coordinates.lat), lng: String(coordinates.lng), radiusKm: String(radiusKm) });
    return request<NearbySellerMatch[]>(`/api/sellers/nearby?${query}`);
  },
  getLocationRegions: (countryCode: string) => request<LocationRegion[]>(`/api/location/countries/${encodeURIComponent(countryCode)}/states`),
  searchLocationCities: (countryCode: string, regionCode: string, query: string) => {
    const search = new URLSearchParams({ q: query });
    return request<LocationCity[]>(`/api/location/countries/${encodeURIComponent(countryCode)}/states/${encodeURIComponent(regionCode)}/cities?${search}`);
  },
  getUsers: () => request<User[]>('/api/users'),
  refreshUsers: () => {
    publicReadCache.delete('/api/users');
    inFlightPublicReads.delete('/api/users');
    return performRequest<User[]>('/api/users', { cache: 'no-store' }, null, false);
  },
  getAdminUsers: () => request<User[]>('/api/admin/users'),
  refreshAdminUsers: () => request<User[]>('/api/admin/users', { cache: 'no-store' }),
  getProfile: () => request<Partial<User>>('/api/profile'),
  getSellerCollections: () => request<SellerCollection[]>('/api/seller-collections'),
  saveSellerCollection: (collection: Pick<SellerCollection, 'title' | 'description' | 'imageUrls'>) => request<SellerCollection>('/api/seller-collections', { method: 'POST', body: JSON.stringify(collection) }),
  getPromoPlans: () => request<AdminPromoPlan[]>('/api/promo-plans'),
  refreshPromoPlans: () => {
    publicReadCache.delete('/api/promo-plans');
    inFlightPublicReads.delete('/api/promo-plans');
    return performRequest<AdminPromoPlan[]>('/api/promo-plans', { cache: 'no-store' }, null, false);
  },
  savePromoPlans: (plans: AdminPromoPlan[]) => request<AdminPromoPlan[]>('/api/promo-plans', { method: 'PUT', body: JSON.stringify({ plans }) }),
  toggleFollow: (userId: string) => request<{ followers: string[]; isFollowing: boolean }>(`/api/users/${userId}/follow`, { method: 'POST' }),
  updateUserProfile: (userId: string, updates: Partial<User>) => request<User>(`/api/users/${userId}/profile`, { method: 'PUT', body: JSON.stringify(updates) }),
  addAdmin: (email: string) => request<User>('/api/admin/admins', { method: 'POST', body: JSON.stringify({ email }) }),
  removeAdmin: (userId: string) => request<void>(`/api/admin/admins/${userId}`, { method: 'DELETE' }),
  deleteSeller: (userId: string) => request<void>(`/api/admin/sellers/${userId}`, { method: 'DELETE' }),
  deleteMyAccount: () => request<void>('/api/profile', { method: 'DELETE' }),
  setUserBlocked: (userId: string, blocked: boolean, reason: string) => request<{ ok: boolean; blocked: boolean }>(`/api/admin/users/${userId}/block`, { method: 'POST', body: JSON.stringify({ blocked, reason }) }),
  adminAiCommand: (prompt: string, contextTargetId?: string) => request<{
    kind: 'results' | 'message' | 'confirmation_required' | 'analytics' | 'listing_results';
    message: string;
    actionId?: string;
    target?: User;
    results?: User[];
    listingResults?: ClothPost[];
    metrics?: Record<string, number>;
  }>('/api/admin/ai/command', { method: 'POST', body: JSON.stringify({ prompt, context: contextTargetId ? { targetId: contextTargetId } : undefined }) }),
  adminAiConfirm: (actionId: string) => request<{ ok: boolean; message: string }>('/api/admin/ai/confirm', { method: 'POST', body: JSON.stringify({ actionId }) }),
  getPosts: (search?: string) => request<ClothPost[]>(search ? `/api/posts?q=${encodeURIComponent(search)}` : '/api/posts'),
  refreshPosts: () => {
    publicReadCache.delete('/api/posts');
    inFlightPublicReads.delete('/api/posts');
    return performRequest<ClothPost[]>('/api/posts', { cache: 'no-store' }, null, false);
  },
  getMarketplaceFeed: (query: MarketplaceFeedQuery) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params.set(key, String(value));
    });
    return request<MarketplaceFeedPage>(`/api/marketplace/feed?${params.toString()}`);
  },
  downloadMarketplaceImage: async (listingId: string): Promise<Blob> => {
    const path = `/api/marketplace/listings/${encodeURIComponent(listingId)}/image-download`;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${API_URL}${path}`, { credentials: 'omit', signal: controller.signal });
    } catch (error) {
      throw new Error(safeCustomerErrorMessage(error, "We couldn't download this image. Please try again."));
    } finally {
      window.clearTimeout(timeout);
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(customerMessageForHttpError(response.status, body.error, path, body.code));
    }
    return response.blob();
  },
  getMarketplaceTrending: (query: MarketplaceTrendingQuery) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params.set(key, String(value));
    });
    return request<MarketplaceTrendingPage>(`/api/marketplace/trending?${params.toString()}`);
  },
  getMarketplaceReviews: (type: MarketplaceReviewType, targetId: string, cursor?: string) =>
    request<MarketplaceReviewsPage>(`/api/reviews/${type}/${encodeURIComponent(targetId)}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  getSellerReviewSummaries: (sellerIds: string[]) => request<Array<{
    sellerId: string;
    average: number;
    count: number;
    confidenceAdjustedRating: number | null;
  }>>('/api/sellers/review-summaries', {
    method: 'POST',
    body: JSON.stringify({ sellerIds }),
  }),
  submitMarketplaceReview: (type: MarketplaceReviewType, targetId: string, input: {
    rating: number;
    reviewText: string;
    categoryBreakdown?: Record<string, number>;
    contextListingId?: string;
    firsthandAttested: boolean;
  }) => request<MarketplaceReview>(`/api/reviews/${type}/${encodeURIComponent(targetId)}`, {
    method: 'POST',
    body: JSON.stringify(input),
  }),
  respondToReview: (type: MarketplaceReviewType, reviewId: string, response: string) =>
    request<void>(`/api/reviews/${type}/${encodeURIComponent(reviewId)}/response`, {
      method: 'POST',
      body: JSON.stringify({ response }),
    }),
  toggleReviewHelpful: (type: MarketplaceReviewType, reviewId: string) =>
    request<{ helpfulCount: number; helpful: boolean }>(`/api/reviews/${type}/${encodeURIComponent(reviewId)}/helpful`, { method: 'POST' }),
  reportMarketplaceReview: (type: MarketplaceReviewType, reviewId: string, reason: string, details: string) =>
    request<void>(`/api/reviews/${type}/${encodeURIComponent(reviewId)}/reports`, {
      method: 'POST',
      body: JSON.stringify({ reason, details }),
    }),
  appealMarketplaceReview: (type: MarketplaceReviewType, reviewId: string, reason: string) =>
    request<void>(`/api/reviews/${type}/${encodeURIComponent(reviewId)}/appeals`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  getReviewModerationQueue: () => request<MarketplaceReviewQueueItem[]>('/api/admin/reviews'),
  moderateMarketplaceReview: (type: MarketplaceReviewType, reviewId: string, decision: MarketplaceReviewModerationStatus, reason: string) =>
    request<void>(`/api/admin/reviews/${type}/${encodeURIComponent(reviewId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ decision, reason }),
    }),
  resolveMarketplaceReviewAppeal: (appealId: string, decision: 'upheld' | 'overturned', reason: string) =>
    request<void>(`/api/admin/review-appeals/${encodeURIComponent(appealId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ decision, reason }),
    }),
  resolveMarketplaceReviewReport: (reportId: string, decision: 'reviewed' | 'dismissed', reason: string) =>
    request<void>(`/api/admin/review-reports/${encodeURIComponent(reportId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ decision, reason }),
    }),
  getBlockedSellers: () => request<string[]>('/api/me/blocked-sellers'),
  setSellerBlocked: (sellerId: string, blocked: boolean) =>
    request<{ blocked: boolean }>(`/api/me/blocked-sellers/${encodeURIComponent(sellerId)}`, {
      method: 'PUT',
      body: JSON.stringify({ blocked }),
    }),
  getRecommendationPreferences: () =>
    request<{ preferences: RecommendationPreferences | null }>('/api/me/recommendation-preferences'),
  saveRecommendationPreferences: (preferences: RecommendationPreferences) =>
    request<{ ok: boolean }>('/api/me/recommendation-preferences', {
      method: 'PUT',
      body: JSON.stringify({ preferences }),
    }),
  resetRecommendationPreferences: () =>
    request<void>('/api/me/recommendation-preferences', { method: 'DELETE' }),
  setRecommendationFeedback: (
    listingId: string,
    interactionType: 'hide' | 'dismiss' | 'not_interested',
    active: boolean,
    reason = '',
  ) => request<{ ok: boolean; active: boolean }>(`/api/me/recommendation-feedback/${encodeURIComponent(listingId)}`, {
    method: 'PUT',
    body: JSON.stringify({ interactionType, active, reason, sessionId: getMarketplaceSessionId() }),
  }),
  getMarketplaceAbuseFlags: () => request<MarketplaceAbuseFlag[]>('/api/admin/abuse-flags'),
  resolveMarketplaceAbuseFlag: (
    flagId: number,
    status: 'investigating' | 'resolved' | 'dismissed',
    reason: string,
  ) => request<void>(`/api/admin/abuse-flags/${flagId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reason }),
  }),
  recordMarketplaceEvent: (
    listingId: string,
    eventType: MarketplaceTrendEventType,
    recommendation?: {
      feedName: 'for_you' | 'trending' | 'category' | 'search';
      rankedPosition: number;
      reasonCode?: string;
    },
  ) => {
    const body = JSON.stringify({ listingId, eventType, recommendation, sessionId: getMarketplaceSessionId() });
    return request<{ recorded: boolean }>('/api/marketplace/events', {
      method: 'POST',
      body,
      keepalive: eventType === 'IMPRESSION',
    });
  },
  recordMarketplaceSearchEvent: (
    searchText: string,
    eventType: 'impression' | 'click' | 'save' | 'enquiry',
    listingId?: string,
    resultCount?: number,
  ) => request<void>('/api/marketplace/search-events', {
    method: 'POST',
    body: JSON.stringify({ searchText, eventType, listingId, resultCount, sessionId: getMarketplaceSessionId() }),
  }),
  getMyListings: () => request<ClothPost[]>('/api/listings/mine'),
  getListingsForModeration: () => request<ClothPost[]>('/api/admin/listings/moderation'),
  getListingReports: () => request<ListingReport[]>('/api/admin/listing-reports'),
  updateListingReport: (reportId: string, status: 'reviewed' | 'dismissed', reason: string) => request<void>(`/api/admin/listing-reports/${reportId}`, { method: 'PATCH', body: JSON.stringify({ status, reason }) }),
  saveProfile: (profile: Partial<User>) => request<User>('/api/profile', { method: 'PUT', body: JSON.stringify(profile) }),
  createPost: (post: Omit<ClothPost, 'id' | 'likes' | 'saves' | 'createdAt'> & { intent?: 'draft' | 'publish' }) => request<ClothPost>('/api/posts', { method: 'POST', body: JSON.stringify(post) }),
  updateListing: (listingId: string, post: Partial<ClothPost> & { intent?: 'draft' | 'publish' }) => request<ClothPost>(`/api/posts/${listingId}`, { method: 'PUT', body: JSON.stringify(post) }),
  setListingStatus: (listingId: string, action: 'publish' | 'pause' | 'archive' | 'sold_out') => request<ClothPost>(`/api/posts/${listingId}/status`, { method: 'PATCH', body: JSON.stringify({ action }) }),
  moderateListing: (listingId: string, decision: 'approve' | 'reject', reason?: string) => request<ClothPost>(`/api/admin/listings/${listingId}/moderation`, { method: 'PATCH', body: JSON.stringify({ decision, reason }) }),
  reportListing: (listingId: string, reason: string, details?: string) => request<{ ok: boolean }>(`/api/posts/${listingId}/report`, { method: 'POST', body: JSON.stringify({ reason, details }) }),
  uploadListingImage: async (file: Blob, fileName: string): Promise<ListingImageAsset> => {
    const token = await getAuthTokenForRequest();
    const formData = new FormData();
    formData.append('image', file, fileName.replace(/\.[^.]+$/, '') + '.jpg');
    formData.append('folder', 'posts');
    const response = await fetch(`${API_URL}/api/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(customerMessageForHttpError(response.status, body.error, '/api/upload', body.code));
    }
    const asset = await response.json() as ListingImageAsset;
    if (!asset.url || !asset.thumbnailUrl) throw new Error("We couldn't finish uploading your image. Please try again.");
    return asset;
  },
  deletePost: (postId: string) => request<void>(`/api/posts/${postId}`, { method: 'DELETE' }),
  toggleLike: (postId: string) => request<{ isLiked: boolean; likesCount: number }>(`/api/posts/${postId}/like`, { method: 'POST' }),
  toggleSave: (postId: string) => request<{ isSaved: boolean; savesCount: number }>(`/api/posts/${postId}/save`, { method: 'POST' }),
  recordDiscoveryEvent: (itemId: string, eventType: DiscoveryEventType, sessionId: string) => request<DiscoveryEvent>('/api/discovery-events', { method: 'POST', body: JSON.stringify({ itemId, eventType, sessionId }) }),
  getDiscoveryEvents: () => request<DiscoveryEvent[]>('/api/discovery-events'),
  getNotifications: () => request<AppNotification[]>('/api/notifications'),
  markNotificationsRead: () => request<void>('/api/notifications/read', { method: 'POST' }),
  getMessages: () => request<DirectMessage[]>('/api/messages'),
  registerPushToken: (token: string) => request<{ ok: boolean }>('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ token }) }),
  removePushToken: (token: string) => request<void>('/api/push/subscribe', { method: 'DELETE', body: JSON.stringify({ token }) }),
  deleteMessage: (messageId: string) => request<void>(`/api/admin/messages/${messageId}`, { method: 'DELETE' }),
  sendBroadcast: (broadcast: Pick<BroadcastMessage, 'sender' | 'target' | 'title' | 'body'>) => request<BroadcastMessage>('/api/admin/broadcast', { method: 'POST', body: JSON.stringify(broadcast) }),
  markMessagesRead: () => request<void>('/api/messages/read', { method: 'POST' }),
  sendMessage: (message: Omit<DirectMessage, 'id' | 'timestamp' | 'isRead'>) => request<DirectMessage>('/api/messages', { method: 'POST', body: JSON.stringify(message) }),
  createFabricRequest: (requestData: Omit<FabricRequest, 'id' | 'status' | 'createdAt' | 'updatedAt'>) => request<FabricRequest>('/api/fabric-requests', { method: 'POST', body: JSON.stringify(requestData) }),
  getFabricRequests: () => request<FabricRequest[]>('/api/fabric-requests'),
  updateFabricRequestStatus: (requestId: string, status: FabricRequest['status']) => request<FabricRequest>(`/api/fabric-requests/${requestId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};
