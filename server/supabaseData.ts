import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseMarketplaceSearch } from '../src/utils/marketplaceSearch.js';

export type ProfileRecord = Record<string, unknown>;
export type PostRecord = Record<string, unknown>;
export type MessageRecord = Record<string, unknown>;
export type FabricRequestRecord = Record<string, unknown>;
export type NotificationRecord = Record<string, unknown>;
export type MarketplaceCursorValue = string | number | boolean | null;
export type MarketplaceCursor = { sort: string; values: MarketplaceCursorValue[] };
export type MarketplaceEngagementEventType = 'IMPRESSION' | 'VIEW' | 'SHARE' | 'ENQUIRY' | 'HIDE';
export type MarketplaceTrendCategory = 'TRENDING_NOW' | 'RISING' | 'POPULAR' | 'NEW_NOTICED' | 'HIGHLY_RATED' | 'MOST_VIEWED';
export type MarketplaceReviewType = 'listing' | 'seller';
export type ReviewModerationStatus = 'pending' | 'published' | 'rejected' | 'removed';
export type MarketplaceReviewCursor = { createdAt: string; id: string };

const supabaseUrl = process.env.SUPABASE_URL?.trim() || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

export const supabaseDataEnabled = Boolean(supabaseUrl && supabaseServiceRoleKey);

const client = supabaseDataEnabled
  ? createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } })
  : null;

function requireClient(): SupabaseClient {
  if (!client) throw new Error('Supabase database is not configured.');
  return client;
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function isMissingRpcFunction(error: unknown, functionName: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const details = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const code = typeof details.code === 'string' ? details.code : '';
  const message = [details.message, details.details, details.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  return (code === 'PGRST202' || code === '42883') && message.includes(functionName.toLowerCase());
}

function toDatabaseRecord(values: ProfileRecord): ProfileRecord {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), value]));
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export async function getProfile(uid: string): Promise<ProfileRecord | null> {
  const { data, error } = await requireClient().from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) throw normalizeError(error);
  return data;
}

export async function getProfileByEmail(email: string): Promise<ProfileRecord | null> {
  const { data, error } = await requireClient().from('profiles').select('*').eq('email', email.toLowerCase()).maybeSingle();
  if (error) throw normalizeError(error);
  return data;
}

export async function upsertProfile(uid: string, values: ProfileRecord): Promise<ProfileRecord> {
  const { data, error } = await requireClient().from('profiles').upsert({ id: uid, ...toDatabaseRecord(values) }, { onConflict: 'id' }).select('*').single();
  if (error) throw normalizeError(error);
  return data;
}

export async function listProfiles(): Promise<ProfileRecord[]> {
  const { data, error } = await requireClient().from('profiles').select('*').order('created_at', { ascending: false });
  if (error) throw normalizeError(error);
  return data || [];
}

export async function getUsers(includePrivate = false): Promise<ProfileRecord[]> {
  const query = includePrivate
    ? requireClient().from('profiles').select('*')
    : requireClient().from('profiles').select('id,name,role,shop_name,bio,handle,avatar_url,location,whatsapp_number,is_promoted,is_blocked,followers,created_at');
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw normalizeError(error);
  return data || [];
}

export async function toggleFollow(targetId: string, userId: string): Promise<{ followers: string[]; isFollowing: boolean }> {
  const { data, error } = await requireClient().from('profiles').select('followers').eq('id', targetId).single();
  if (error) throw normalizeError(error);
  const followers = Array.isArray(data.followers) ? data.followers.filter((id: unknown) => typeof id === 'string') : [];
  const isFollowing = !followers.includes(userId);
  const nextFollowers = isFollowing ? [...followers, userId] : followers.filter(id => id !== userId);
  const { data: updated, error: updateError } = await requireClient().from('profiles').update({ followers: nextFollowers, updated_at: new Date().toISOString() }).eq('id', targetId).select('followers').single();
  if (updateError) throw normalizeError(updateError);
  return { followers: updated.followers, isFollowing };
}

export async function updateProfile(uid: string, values: ProfileRecord): Promise<ProfileRecord> {
  const { data, error } = await requireClient().from('profiles').update(toDatabaseRecord(values)).eq('id', uid).select('*').single();
  if (error) throw normalizeError(error);
  return data;
}

export async function getSellerCollections(userId: string): Promise<ProfileRecord[]> {
  const { data, error } = await requireClient()
    .from('seller_collections')
    .select('*')
    .eq('seller_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw normalizeError(error);
  return data || [];
}

export async function removeUserFromFollowers(userId: string): Promise<void> {
  const supabase = requireClient();
  const affectedProfiles: Array<{ id: string; followers: string[] }> = [];
  const pageSize = 500;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, followers')
      .contains('followers', [userId])
      .range(offset, offset + pageSize - 1);
    if (error) throw normalizeError(error);
    if (!data?.length) break;

    affectedProfiles.push(...data.map(profile => ({
      id: String(profile.id),
      followers: Array.isArray(profile.followers)
        ? profile.followers.filter((followerId: unknown): followerId is string => typeof followerId === 'string')
        : [],
    })));
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  for (let index = 0; index < affectedProfiles.length; index += 50) {
    const { error } = await Promise.all(affectedProfiles.slice(index, index + 50).map(profile =>
      supabase.from('profiles')
        .update({ followers: profile.followers.filter(followerId => followerId !== userId) })
        .eq('id', profile.id)
    )).then(results => ({ error: results.find(result => result.error)?.error }));
    if (error) throw normalizeError(error);
  }
}

export async function createSellerCollection(userId: string, values: ProfileRecord): Promise<ProfileRecord> {
  const { data, error } = await requireClient()
    .from('seller_collections')
    .insert({ ...toDatabaseRecord(values), seller_id: userId })
    .select('*')
    .single();
  if (error) throw normalizeError(error);
  return data;
}

export async function updateAuthorPromotion(uid: string, isPromoted: boolean): Promise<void> {
  const { error } = await requireClient().from('posts').update({ is_promoted: isPromoted, updated_at: new Date().toISOString() }).eq('author_id', uid);
  if (error) throw normalizeError(error);
}

export async function getPosts(limit = 16, search?: string): Promise<PostRecord[]> {
  let query = requireClient().from('posts').select('*, author:profiles!posts_author_id_fkey(id,name,shop_name,role,handle,avatar_url,location,whatsapp_number,is_promoted,is_blocked)')
    .eq('status', 'published')
    .eq('moderation_status', 'approved')
    .is('deleted_at', null)
    .eq('is_blocked', false)
    .neq('availability', 'unavailable')
    .neq('status', 'sold_out')
    .eq('author.is_blocked', false)
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (search) query = query.textSearch('search_document', search, { type: 'websearch', config: 'simple' });
  const { data, error } = await query;
  if (error) throw normalizeError(error);
  return (data || []).map(post => ({ ...post, author: post.author || {} }));
}

const MARKETPLACE_SORT_FIELDS: Record<string, Array<{ field: string; direction: 'asc' | 'desc'; nullsLast?: boolean }>> = {
  relevance: [
    { field: 'is_promoted', direction: 'desc' },
    { field: 'popularity_score', direction: 'desc' },
    { field: 'published_at', direction: 'desc' },
    { field: 'id', direction: 'desc' },
  ],
  newest: [
    { field: 'published_at', direction: 'desc' },
    { field: 'id', direction: 'desc' },
  ],
  price_asc: [
    { field: 'price_min', direction: 'asc', nullsLast: true },
    { field: 'published_at', direction: 'desc' },
    { field: 'id', direction: 'desc' },
  ],
  price_desc: [
    { field: 'price_min', direction: 'desc', nullsLast: true },
    { field: 'published_at', direction: 'desc' },
    { field: 'id', direction: 'desc' },
  ],
  rating: [
    { field: 'rating_average', direction: 'desc' },
    { field: 'published_at', direction: 'desc' },
    { field: 'id', direction: 'desc' },
  ],
  popularity: [
    { field: 'popularity_score', direction: 'desc' },
    { field: 'published_at', direction: 'desc' },
    { field: 'id', direction: 'desc' },
  ],
};

export function buildMarketplaceCursorFilter(sort: string, cursor: MarketplaceCursor): string {
  const fields = MARKETPLACE_SORT_FIELDS[sort];
  if (!fields || cursor.sort !== sort || cursor.values.length !== fields.length) {
    throw new Error('Invalid marketplace pagination cursor.');
  }

  const alternatives: string[] = [];
  for (let index = 0; index < fields.length; index += 1) {
    const terms: string[] = [];
    for (let previous = 0; previous < index; previous += 1) {
      const field = fields[previous];
      const value = cursor.values[previous];
      terms.push(value === null ? `${field.field}.is.null` : `${field.field}.eq.${String(value)}`);
    }

    const field = fields[index];
    const value = cursor.values[index];
    if (value === null) continue;
    const comparator = field.direction === 'asc' ? 'gt' : 'lt';
    const after = `${field.field}.${comparator}.${String(value)}`;
    terms.push(field.nullsLast ? `or(${after},${field.field}.is.null)` : after);
    alternatives.push(terms.length === 1 ? terms[0] : `and(${terms.join(',')})`);
  }

  if (!alternatives.length) throw new Error('Invalid marketplace pagination cursor.');
  return alternatives.join(',');
}

export async function getMarketplacePostsPage(options: {
  view: string;
  sort: string;
  search?: string;
  locationHint?: string;
  categoryId?: string;
  tag?: string;
  country?: string;
  state?: string;
  city?: string;
  minimumPrice?: number;
  maximumPrice?: number;
  currency?: string;
  material?: string;
  colour?: string;
  size?: string;
  fulfilment?: string;
  availability?: string;
  viewerId?: string;
  cursor?: MarketplaceCursor;
  limit: number;
}): Promise<{ rows: PostRecord[]; hasMore: boolean; nextSearchCursor?: MarketplaceCursor }> {
  const sortFields = MARKETPLACE_SORT_FIELDS[options.sort];
  if (!sortFields) throw new Error('Unsupported marketplace sort order.');
  const blockedSellerIds = options.viewerId
    ? await getMarketplaceBlockedSellerIds(options.viewerId)
    : [];
  const hiddenListingIds = options.viewerId
    ? await getMarketplaceHiddenListingIds(options.viewerId)
    : [];
  const blockedSellerFilter = blockedSellerIds.length
    ? `(${blockedSellerIds.join(',')})`
    : null;
  const hiddenListingFilter = hiddenListingIds.length
    ? `(${hiddenListingIds.join(',')})`
    : null;

  if (options.search && options.sort === 'relevance') {
    const parsedSearch = parseMarketplaceSearch(options.search);
    if (!parsedSearch.termGroups.length) return { rows: [], hasMore: false };
    const cursorScore = options.cursor?.values[0];
    const cursorId = options.cursor?.values[1];
    const { data: rankedIds, error: rankError } = await requireClient().rpc('search_marketplace_listing_ids', {
      p_term_groups: parsedSearch.termGroups,
      p_search_text: parsedSearch.text,
      p_location_hint: options.locationHint || parsedSearch.locationHint,
      p_view: options.view,
      p_category_id: options.categoryId || null,
      p_tag: options.tag || null,
      p_country: options.country || null,
      p_state: options.state || null,
      p_city: options.city || null,
      p_min_price: options.minimumPrice ?? null,
      p_max_price: options.maximumPrice ?? null,
      p_currency: options.currency || null,
      p_material: options.material || null,
      p_colour: options.colour || null,
      p_size: options.size || null,
      p_fulfilment: options.fulfilment || null,
      p_availability: options.availability || null,
      p_cursor_score: typeof cursorScore === 'number' ? cursorScore : null,
      p_cursor_id: typeof cursorId === 'string' ? cursorId : null,
      p_limit: options.limit + 1,
    });
    if (rankError) throw normalizeError(rankError);
    const ranked = (rankedIds || []) as Array<{ listing_id: string; search_score: number; location_match: boolean }>;
    const pageRanked = ranked.slice(0, options.limit);
    if (!pageRanked.length) return { rows: [], hasMore: false };
    let postsQuery = requireClient().from('posts')
      .select('*, author:profiles!posts_author_id_fkey!inner(id,name,shop_name,role,handle,avatar_url,location,whatsapp_number,is_promoted,is_blocked)')
      .in('id', pageRanked.map(item => item.listing_id))
      .eq('status', 'published')
      .eq('moderation_status', 'approved')
      .is('deleted_at', null)
      .eq('is_blocked', false)
      .neq('availability', 'unavailable')
      .neq('status', 'sold_out')
      .eq('author.is_blocked', false)
      .not('published_at', 'is', null);
    if (blockedSellerFilter) postsQuery = postsQuery.not('author_id', 'in', blockedSellerFilter);
    if (hiddenListingFilter) postsQuery = postsQuery.not('id', 'in', hiddenListingFilter);
    const { data, error } = await postsQuery;
    if (error) throw normalizeError(error);
    const byId = new Map((data || []).map(post => [String(post.id), post]));
    const rows = pageRanked.flatMap(item => {
      const post = byId.get(item.listing_id);
      return post ? [{ ...post, author: post.author || {}, search_score: item.search_score, search_location_match: item.location_match }] : [];
    });
    const last = pageRanked[pageRanked.length - 1];
    return {
      rows,
      hasMore: ranked.length > options.limit,
      nextSearchCursor: ranked.length > options.limit
        ? { sort: 'relevance', values: [last.search_score, last.listing_id] }
        : undefined,
    };
  }

  let query = requireClient().from('posts')
    .select('*, author:profiles!posts_author_id_fkey!inner(id,name,shop_name,role,handle,avatar_url,location,whatsapp_number,is_promoted,is_blocked)')
    .eq('status', 'published')
    .eq('moderation_status', 'approved')
    .is('deleted_at', null)
    .eq('is_blocked', false)
    .neq('availability', 'unavailable')
    .neq('status', 'sold_out')
    .eq('author.is_blocked', false)
    .not('published_at', 'is', null);
  if (blockedSellerFilter) query = query.not('author_id', 'in', blockedSellerFilter);
  if (hiddenListingFilter) query = query.not('id', 'in', hiddenListingFilter);

  if (options.view === 'clothing') query = query.eq('listing_type', 'CLOTHING');
  if (options.view === 'fabrics') query = query.eq('listing_type', 'FABRIC');
  if (options.view === 'tailors') query = query.eq('author.role', 'tailor').in('listing_type', ['CLOTHING', 'TAILOR_PORTFOLIO']);
  if (options.categoryId) query = query.ilike('category_id', escapeLikePattern(options.categoryId));
  if (options.tag) query = query.contains('tags', [options.tag]);
  if (options.search) {
    const parsedSearch = parseMarketplaceSearch(options.search);
    if (!parsedSearch.termGroups.length) return { rows: [], hasMore: false };
    query = query.textSearch('search_document', parsedSearch.text, { type: 'websearch', config: 'simple' });
  }
  if (options.country) query = query.ilike('author.location->>country', escapeLikePattern(options.country));
  if (options.state) query = query.eq('author.location->>state', options.state);
  if (options.city) query = query.eq('author.location->>city', options.city);
  if (options.minimumPrice !== undefined) {
    query = query.or(`price_max.gte.${options.minimumPrice},and(price_max.is.null,price_min.gte.${options.minimumPrice})`);
  }
  if (options.maximumPrice !== undefined) query = query.lte('price_min', options.maximumPrice);
  if (options.currency) query = query.eq('currency', options.currency);
  if (options.material) query = query.ilike('listing_details->>material', `%${escapeLikePattern(options.material)}%`);
  if (options.colour) query = query.ilike('listing_details->>colour', `%${escapeLikePattern(options.colour)}%`);
  if (options.size) query = query.contains('listing_details->sizes', [options.size]);
  if (options.fulfilment) query = query.eq('listing_details->>fulfilment', options.fulfilment);
  if (options.availability) query = query.eq('availability', options.availability);

  for (const field of sortFields) {
    query = query.order(field.field, {
      ascending: field.direction === 'asc',
      nullsFirst: field.nullsLast ? false : undefined,
    });
  }
  if (options.cursor) query = query.or(buildMarketplaceCursorFilter(options.sort, options.cursor));

  const { data, error } = await query.limit(options.limit + 1);
  if (error) throw normalizeError(error);
  const rows = data || [];
  return {
    rows: rows.slice(0, options.limit).map(post => ({ ...post, author: post.author || {} })),
    hasMore: rows.length > options.limit,
  };
}

export async function recordMarketplaceEngagementEvent(options: {
  listingId: string;
  eventType: MarketplaceEngagementEventType;
  actorId: string | null;
  sessionHash: string;
}): Promise<'recorded' | 'duplicate' | 'rate_limited' | 'ineligible'> {
  const { data, error } = await requireClient().rpc('record_marketplace_engagement_event', {
    p_listing_id: options.listingId,
    p_event_type: options.eventType,
    p_actor_id: options.actorId,
    p_session_hash: options.sessionHash,
  });
  if (error) throw normalizeError(error);
  if (data === 'recorded' || data === 'duplicate' || data === 'rate_limited' || data === 'ineligible') return data;
  throw new Error('Supabase returned an invalid marketplace event result.');
}

export async function consumeMarketplaceAbuseLimit(options: {
  action: string;
  actorId: string;
  targetId?: string;
  sessionHash?: string;
}): Promise<boolean> {
  const { data, error } = await requireClient().rpc('consume_marketplace_abuse_limit', {
    p_action: options.action,
    p_actor_id: options.actorId,
    p_session_hash: options.sessionHash || null,
    p_target_id: options.targetId || null,
  });
  if (error) throw normalizeError(error);
  if (typeof data !== 'boolean') throw new Error('Supabase returned an invalid abuse-limit result.');
  return data;
}

export async function getMarketplaceBlockedSellerIds(blockerId: string): Promise<string[]> {
  const { data, error } = await requireClient().rpc('get_marketplace_blocked_seller_ids', {
    p_blocker_id: blockerId,
  });
  if (error) throw normalizeError(error);
  if (!Array.isArray(data) || data.some(id => typeof id !== 'string')) {
    throw new Error('Supabase returned invalid blocked-seller data.');
  }
  return data;
}

export async function getMarketplaceHiddenListingIds(userId: string): Promise<string[]> {
  const { data, error } = await requireClient().from('user_interactions')
    .select('listing_id')
    .eq('user_id', userId)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  if (error) throw normalizeError(error);
  return (data || []).map(row => String(row.listing_id));
}

export async function getMarketplaceUserPreferences(userId: string): Promise<ProfileRecord | null> {
  const { data, error } = await requireClient().from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw normalizeError(error);
  return data;
}

export async function saveMarketplaceUserPreferences(userId: string, preferences: ProfileRecord): Promise<void> {
  const { error } = await requireClient().rpc('save_marketplace_user_preferences', {
    p_user_id: userId,
    p_preferences: preferences,
  });
  if (error) throw normalizeError(error);
}

export async function resetMarketplacePersonalization(userId: string): Promise<void> {
  const { error } = await requireClient().rpc('reset_marketplace_personalization', {
    p_user_id: userId,
  });
  if (error) throw normalizeError(error);
}

export async function setMarketplaceRecommendationFeedback(options: {
  userId: string;
  listingId: string;
  interactionType: 'hide' | 'dismiss' | 'not_interested';
  active: boolean;
  sessionHash: string;
  reason?: string;
}): Promise<'hidden' | 'restored' | 'rate_limited' | 'ineligible'> {
  const { data, error } = await requireClient().rpc('set_marketplace_user_interaction', {
    p_user_id: options.userId,
    p_listing_id: options.listingId,
    p_interaction_type: options.interactionType,
    p_is_active: options.active,
    p_session_hash: options.sessionHash,
    p_reason: options.reason || '',
  });
  if (error) throw normalizeError(error);
  if (data === 'hidden' || data === 'restored' || data === 'rate_limited' || data === 'ineligible') return data;
  throw new Error('Supabase returned an invalid recommendation-feedback result.');
}

export async function recordMarketplaceRecommendationImpression(options: {
  listingId: string;
  userId: string | null;
  sessionHash: string;
  feedName: 'for_you' | 'trending' | 'category' | 'search';
  rankedPosition: number;
  reasonCode?: string;
}): Promise<'recorded' | 'duplicate' | 'rate_limited' | 'ineligible'> {
  const { data, error } = await requireClient().rpc('record_marketplace_recommendation_impression', {
    p_listing_id: options.listingId,
    p_user_id: options.userId,
    p_session_hash: options.sessionHash,
    p_feed_name: options.feedName,
    p_ranked_position: options.rankedPosition,
    p_reason_code: options.reasonCode || '',
    p_experiment_version: 'marketplace-v1',
  });
  if (error) throw normalizeError(error);
  if (data === 'recorded' || data === 'duplicate' || data === 'rate_limited' || data === 'ineligible') return data;
  throw new Error('Supabase returned an invalid recommendation-impression result.');
}

export async function setMarketplaceUserBlock(options: {
  actorId: string;
  blockedUserId: string;
  blocked: boolean;
}): Promise<'blocked' | 'unblocked' | 'rate_limited'> {
  const { data, error } = await requireClient().rpc('set_marketplace_user_block', {
    p_actor_id: options.actorId,
    p_blocked_user_id: options.blockedUserId,
    p_is_blocked: options.blocked,
  });
  if (error) throw normalizeError(error);
  if (data === 'blocked' || data === 'unblocked' || data === 'rate_limited') return data;
  throw new Error('Supabase returned an invalid block result.');
}

export async function setMarketplaceAccountBlock(options: {
  actorId: string;
  targetId: string;
  blocked: boolean;
  reason: string;
}): Promise<void> {
  const { error } = await requireClient().rpc('set_marketplace_account_block', {
    p_actor_id: options.actorId,
    p_target_id: options.targetId,
    p_is_blocked: options.blocked,
    p_reason: options.reason,
  });
  if (error) throw normalizeError(error);
}

export async function getMarketplaceAbuseFlags(): Promise<ProfileRecord[]> {
  const { data, error } = await requireClient().from('marketplace_abuse_flags')
    .select('*')
    .in('status', ['open', 'investigating'])
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw normalizeError(error);
  return data || [];
}

export async function resolveMarketplaceAbuseFlag(options: {
  flagId: number;
  actorId: string;
  status: 'investigating' | 'resolved' | 'dismissed';
  reason: string;
}): Promise<void> {
  const { error } = await requireClient().rpc('resolve_marketplace_abuse_flag', {
    p_flag_id: options.flagId,
    p_actor_id: options.actorId,
    p_status: options.status,
    p_reason: options.reason,
  });
  if (error) throw normalizeError(error);
}

export async function recordMarketplaceSearchAuditEvent(options: {
  searchText: string;
  eventType: 'impression' | 'click' | 'save' | 'enquiry';
  sessionHash: string;
  listingId?: string;
  resultCount?: number;
}): Promise<void> {
  const { error } = await requireClient().rpc('record_marketplace_search_audit_event', {
    p_search_text: options.searchText,
    p_event_type: options.eventType,
    p_session_hash: options.sessionHash,
    p_listing_id: options.listingId || null,
    p_result_count: options.resultCount ?? null,
  });
  if (error) throw normalizeError(error);
}

export async function refreshMarketplaceTrends(): Promise<void> {
  const { error } = await requireClient().rpc('refresh_marketplace_trends');
  if (error) throw normalizeError(error);
}

export async function getMarketplaceTrendingPage(options: {
  category: MarketplaceTrendCategory;
  scopeType: 'global' | 'region' | 'category' | 'style';
  scopeValue: string;
  limit: number;
  viewerId?: string;
}): Promise<{ rows: PostRecord[]; fallback: boolean; computedAt: string | null }> {
  const supabase = requireClient();
  const blockedSellerIds = options.viewerId
    ? await getMarketplaceBlockedSellerIds(options.viewerId)
    : [];
  const hiddenListingIds = options.viewerId
    ? await getMarketplaceHiddenListingIds(options.viewerId)
    : [];
  const blockedSellerFilter = blockedSellerIds.length
    ? `(${blockedSellerIds.join(',')})`
    : null;

  const scoreFields: Record<MarketplaceTrendCategory, string> = {
    TRENDING_NOW: 'fast_trend_score',
    RISING: 'momentum_ratio',
    POPULAR: 'sustained_popularity',
    NEW_NOTICED: 'weighted_engagement_72h',
    HIGHLY_RATED: 'rating_average',
    MOST_VIEWED: 'qualified_views_7d',
  };
  let trendQuery = supabase.from('marketplace_trend_scores')
    .select('*, listing:posts!inner(*, author:profiles!posts_author_id_fkey!inner(id,name,shop_name,role,handle,avatar_url,location,whatsapp_number,is_promoted,is_blocked))')
    .eq('scope_type', options.scopeType)
    .eq('scope_value', options.scopeValue)
    .contains('category_labels', [options.category])
    .eq('listing.status', 'published')
    .eq('listing.moderation_status', 'approved')
    .is('listing.deleted_at', null)
    .eq('listing.is_blocked', false)
    .neq('listing.availability', 'unavailable')
    .neq('listing.status', 'sold_out')
    .eq('listing.author.is_blocked', false)
    .order(scoreFields[options.category], { ascending: false })
    .order('listing_id', { ascending: true })
    .limit(options.limit);
  if (blockedSellerFilter) trendQuery = trendQuery.not('listing.author_id', 'in', blockedSellerFilter);
  if (hiddenListingIds.length) trendQuery = trendQuery.not('listing_id', 'in', `(${hiddenListingIds.join(',')})`);

  const fallbackToRecentListings = async () => {
    const { rows } = await getMarketplacePostsPage({
      view: 'all',
      sort: 'newest',
      limit: options.limit,
      ...(options.scopeType === 'category' ? { categoryId: options.scopeValue } : {}),
      ...(options.scopeType === 'region' ? { country: options.scopeValue } : {}),
      ...(options.scopeType === 'style' ? { tag: options.scopeValue } : {}),
      viewerId: options.viewerId,
    });
    return {
      rows,
      fallback: true,
      computedAt: null,
      ...(options.scopeType === 'global' && options.viewerId
        ? { likes: await getMarketplaceViewerInteractions(rows.map(row => String(row.id)), options.viewerId) }
        : {}),
    };
  };

  const { data, error } = await trendQuery;
  if (error) {
    console.warn('Marketplace trend scores are unavailable; using eligible recent listings.', normalizeError(error));
    return fallbackToRecentListings();
  }

  if (data?.length) {
    return {
      rows: data.map(row => {
        const listing = row.listing as Record<string, unknown>;
        return {
          ...listing,
          author: listing.author || {},
          trendCategory: options.category,
          trendScore: Number(row[scoreFields[options.category]]) || 0,
          trendMomentum: Number(row.momentum_ratio) || 0,
          trendEngagementRate: Number(row.engagement_rate) || 0,
          trendConfidence: Number(row.confidence) || 0,
          trendComputedAt: row.computed_at,
          trendComponents: row.components || {},
        };
      }),
      fallback: false,
      computedAt: String(data[0].computed_at || ''),
    };
  }

  return fallbackToRecentListings();
}

export async function getMarketplaceViewerInteractions(postIds: string[], userId?: string): Promise<{
  likes: Set<string>;
  saves: Set<string>;
}> {
  if (!userId || !postIds.length) return { likes: new Set(), saves: new Set() };
  const supabase = requireClient();
  const [likes, saves] = await Promise.all([
    supabase.from('post_likes').select('post_id').in('post_id', postIds).eq('user_id', userId),
    supabase.from('post_saves').select('post_id').in('post_id', postIds).eq('user_id', userId),
  ]);
  if (likes.error) throw normalizeError(likes.error);
  if (saves.error) throw normalizeError(saves.error);
  return {
    likes: new Set((likes.data || []).map(row => String(row.post_id))),
    saves: new Set((saves.data || []).map(row => String(row.post_id))),
  };
}

export async function getSellerListings(userId: string): Promise<PostRecord[]> {
  const { data, error } = await requireClient().from('posts').select('*, author:profiles!posts_author_id_fkey(*)')
    .eq('author_id', userId).is('deleted_at', null).order('updated_at', { ascending: false });
  if (error) throw normalizeError(error);
  return data || [];
}

export async function getListingsForModeration(): Promise<PostRecord[]> {
  const { data, error } = await requireClient().from('posts').select('*, author:profiles!posts_author_id_fkey(*)')
    .eq('status', 'pending_review').eq('moderation_status', 'pending').is('deleted_at', null)
    .order('created_at', { ascending: true }).limit(100);
  if (error) throw normalizeError(error);
  return data || [];
}

export async function getPost(postId: string): Promise<PostRecord | null> {
  const { data, error } = await requireClient().from('posts').select('*, author:profiles!posts_author_id_fkey(*)')
    .eq('id', postId).is('deleted_at', null).maybeSingle();
  if (error) throw normalizeError(error);
  return data ? { ...data, author: data.author || {} } : null;
}

export async function createPost(values: ProfileRecord): Promise<PostRecord> {
  const { data, error } = await requireClient().from('posts').insert(values).select('*').single();
  if (error) throw normalizeError(error);
  return data;
}

export async function createPostWithUser(values: ProfileRecord, userId: string): Promise<PostRecord> {
  const { data, error } = await requireClient().from('posts').insert({ ...values, author_id: userId }).select('*').single();
  if (error) throw normalizeError(error);
  return data;
}

export async function updateListing(listingId: string, values: ProfileRecord): Promise<PostRecord> {
  const { data, error } = await requireClient().from('posts').update(values).eq('id', listingId).is('deleted_at', null).select('*').single();
  if (error) throw normalizeError(error);
  return data;
}

export async function softDeleteListing(listingId: string, deletedAt: string): Promise<void> {
  const { error } = await requireClient().from('posts').update({
    deleted_at: deletedAt,
    status: 'archived',
    updated_at: deletedAt,
  }).eq('id', listingId).is('deleted_at', null);
  if (error) throw normalizeError(error);
}

export async function recordListingChange(listingId: string, actorId: string, action: string, changes: ProfileRecord = {}): Promise<void> {
  const { error } = await requireClient().from('listing_changes').insert({
    listing_id: listingId,
    actor_id: actorId,
    action,
    changes,
  });
  if (error) throw normalizeError(error);
}

export async function createListingReport(listingId: string, reporterId: string, reason: string, details: string): Promise<void> {
  const { error } = await requireClient().from('listing_reports').insert({
    listing_id: listingId,
    reporter_id: reporterId,
    reason,
    details,
  });
  if (error) throw normalizeError(error);
}

export async function getListingReports(): Promise<ProfileRecord[]> {
  const { data, error } = await requireClient().from('listing_reports')
    .select('*, listing:posts!listing_reports_listing_id_fkey(title), reporter:profiles!listing_reports_reporter_id_fkey(name, email)')
    .eq('status', 'open').order('created_at', { ascending: false }).limit(200);
  if (error) throw normalizeError(error);
  return data || [];
}

export async function updateListingReport(options: {
  reportId: string;
  status: 'reviewed' | 'dismissed';
  actorId: string;
  reason: string;
}): Promise<void> {
  const { error } = await requireClient().rpc('resolve_marketplace_listing_report', {
    p_report_id: options.reportId,
    p_actor_id: options.actorId,
    p_status: options.status,
    p_reason: options.reason,
  });
  if (error) throw normalizeError(error);
}

export async function deletePost(postId: string): Promise<void> {
  const { error } = await requireClient().from('posts').delete().eq('id', postId);
  if (error) throw normalizeError(error);
}

export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await requireClient().from('messages').delete().eq('id', messageId);
  if (error) throw normalizeError(error);
}

export async function getPostInteractions(postId: string): Promise<{ likes: string[]; saves: string[] }> {
  const [likes, saves] = await Promise.all([
    requireClient().from('post_likes').select('user_id').eq('post_id', postId),
    requireClient().from('post_saves').select('user_id').eq('post_id', postId),
  ]);
  if (likes.error) throw normalizeError(likes.error);
  if (saves.error) throw normalizeError(saves.error);
  return {
    likes: (likes.data || []).map(item => String(item.user_id)),
    saves: (saves.data || []).map(item => String(item.user_id)),
  };
}

export async function toggleLike(postId: string, userId: string): Promise<{ isLiked: boolean; likesCount: number }> {
  const { data, error } = await requireClient().rpc('toggle_marketplace_reaction', {
    p_post_id: postId,
    p_user_id: userId,
    p_reaction_type: 'like',
  });
  if (error) throw normalizeError(error);
  if (!data || typeof data.isActive !== 'boolean' || typeof data.likesCount !== 'number') {
    throw new Error('Supabase returned an invalid marketplace like result.');
  }
  return { isLiked: data.isActive, likesCount: data.likesCount };
}

export async function toggleSave(postId: string, userId: string): Promise<{ isSaved: boolean; savesCount: number }> {
  const { data, error } = await requireClient().rpc('toggle_marketplace_reaction', {
    p_post_id: postId,
    p_user_id: userId,
    p_reaction_type: 'save',
  });
  if (error) throw normalizeError(error);
  if (!data || typeof data.isActive !== 'boolean' || typeof data.savesCount !== 'number') {
    throw new Error('Supabase returned an invalid marketplace save result.');
  }
  return { isSaved: data.isActive, savesCount: data.savesCount };
}

export async function getMarketplaceReviews(options: {
  type: MarketplaceReviewType;
  targetId: string;
  viewerId?: string;
  limit?: number;
  cursor?: MarketplaceReviewCursor;
}): Promise<ProfileRecord> {
  const supabase = requireClient();
  const table = options.type === 'listing' ? 'listing_reviews' : 'seller_reviews';
  const targetField = options.type === 'listing' ? 'listing_id' : 'seller_id';
  const relation = options.type === 'listing' ? 'listing_reviews_reviewer_id_fkey' : 'seller_reviews_reviewer_id_fkey';
  const limit = Math.min(50, Math.max(1, options.limit || 20));
  let reviewsQuery = supabase.from(table)
    .select(`*, reviewer:profiles!${relation}(id,name,avatar_url)`)
    .eq(targetField, options.targetId)
    .eq('moderation_status', 'published')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);
  if (options.cursor) {
    reviewsQuery = reviewsQuery.or(`created_at.lt.${options.cursor.createdAt},and(created_at.eq.${options.cursor.createdAt},id.lt.${options.cursor.id})`);
  }

  const [summaryResult, reviewsResult, ownReviewResult] = await Promise.all([
    supabase.from('review_rating_summaries').select('*')
      .eq('target_type', options.type).eq('target_id', options.targetId).maybeSingle(),
    reviewsQuery,
    options.viewerId
      ? supabase.from(table).select('*').eq(targetField, options.targetId)
          .eq('reviewer_id', options.viewerId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (summaryResult.error) throw normalizeError(summaryResult.error);
  if (reviewsResult.error) throw normalizeError(reviewsResult.error);
  if (ownReviewResult.error) throw normalizeError(ownReviewResult.error);

  const allReviews = reviewsResult.data || [];
  const reviews = allReviews.slice(0, limit);
  const reviewIds = reviews.map(review => String(review.id));
  const helpfulResult = await supabase.rpc('get_marketplace_review_helpful_counts', {
    p_review_type: options.type,
    p_review_ids: reviewIds,
    p_viewer_id: options.viewerId || null,
  });
  if (helpfulResult.error) throw normalizeError(helpfulResult.error);
  const helpfulCounts = helpfulResult.data && typeof helpfulResult.data === 'object'
    ? helpfulResult.data as Record<string, { helpfulCount?: number; viewerFoundHelpful?: boolean }>
    : {};

  return {
    summary: summaryResult.data || {
      raw_average: 0,
      eligible_review_count: 0,
      rating_distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
      confidence_adjusted_rating: null,
      prior_mean: 3.5,
      prior_strength: 20,
      baseline_scope: 'global_default',
      config_version: 'bayes-v1',
    },
    reviews: reviews.map(review => ({
      ...review,
      review_type: options.type,
      helpful_count: helpfulCounts[String(review.id)]?.helpfulCount || 0,
      viewer_found_helpful: helpfulCounts[String(review.id)]?.viewerFoundHelpful || false,
    })),
    hasMore: allReviews.length > limit,
    nextCursor: allReviews.length > limit && reviews.length
      ? Buffer.from(JSON.stringify({
          createdAt: String(reviews[reviews.length - 1].created_at),
          id: String(reviews[reviews.length - 1].id),
        })).toString('base64url')
      : null,
    ownReview: ownReviewResult.data ? { ...ownReviewResult.data, review_type: options.type } : null,
  };
}

export async function getMarketplaceReviewSummaries(
  targetType: 'listing' | 'seller',
  targetIds: string[],
): Promise<Map<string, ProfileRecord>> {
  const ids = Array.from(new Set(targetIds.filter(id =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
  ))).slice(0, 48);
  if (!ids.length) return new Map();
  const { data, error } = await requireClient().from('review_rating_summaries')
    .select('target_id,raw_average,eligible_review_count,confidence_adjusted_rating')
    .eq('target_type', targetType)
    .in('target_id', ids);
  if (error) throw normalizeError(error);
  return new Map((data || []).map(summary => [String(summary.target_id), {
    average: Number(summary.raw_average) || 0,
    count: Number(summary.eligible_review_count) || 0,
    confidenceAdjustedRating: summary.confidence_adjusted_rating === null
      ? null
      : Number(summary.confidence_adjusted_rating),
  }]));
}

export async function getSellerReviewSummaries(sellerIds: string[]): Promise<ProfileRecord[]> {
  const ids = Array.from(new Set(sellerIds.filter(id =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
  ))).slice(0, 50);
  if (!ids.length) return [];
  const { data, error } = await requireClient().from('review_rating_summaries')
    .select('target_id,raw_average,eligible_review_count,confidence_adjusted_rating')
    .eq('target_type', 'seller')
    .in('target_id', ids);
  if (error) throw normalizeError(error);
  return (data || []).map(summary => ({
    sellerId: String(summary.target_id),
    average: Number(summary.raw_average) || 0,
    count: Number(summary.eligible_review_count) || 0,
    confidenceAdjustedRating: summary.confidence_adjusted_rating === null
      ? null
      : Number(summary.confidence_adjusted_rating),
  }));
}

export async function submitMarketplaceReview(values: {
  type: MarketplaceReviewType;
  targetId: string;
  reviewerId: string;
  rating: number;
  reviewText: string;
  categoryBreakdown: Record<string, number>;
  contextListingId?: string;
}): Promise<ProfileRecord> {
  const { data, error } = await requireClient().rpc('submit_marketplace_review', {
    p_review_type: values.type,
    p_target_id: values.targetId,
    p_reviewer_id: values.reviewerId,
    p_rating: values.rating,
    p_review_text: values.reviewText,
    p_category_breakdown: values.categoryBreakdown,
    p_firsthand_attested: true,
    p_context_listing_id: values.contextListingId || null,
  });
  if (error) throw normalizeError(error);
  if (!data || typeof data !== 'object') throw new Error('Supabase returned an invalid review.');
  return data as ProfileRecord;
}

export async function getReviewModerationQueue(): Promise<ProfileRecord[]> {
  const supabase = requireClient();
  const [listingReviews, sellerReviews, appeals, reports] = await Promise.all([
    supabase.from('listing_reviews')
      .select('*, reviewer:profiles!listing_reviews_reviewer_id_fkey(id,name,email), seller:profiles!listing_reviews_seller_id_fkey(id,name,shop_name), listing:posts!listing_reviews_listing_id_fkey(id,title)')
      .eq('moderation_status', 'pending').order('created_at', { ascending: true }).limit(100),
    supabase.from('seller_reviews')
      .select('*, reviewer:profiles!seller_reviews_reviewer_id_fkey(id,name,email), seller:profiles!seller_reviews_seller_id_fkey(id,name,shop_name)')
      .eq('moderation_status', 'pending').order('created_at', { ascending: true }).limit(100),
    supabase.from('review_appeals').select('*').eq('status', 'open').order('created_at', { ascending: true }).limit(100),
    supabase.from('review_reports')
      .select('*, reporter:profiles!review_reports_reporter_id_fkey(id,name,email)')
      .eq('status', 'open').order('created_at', { ascending: true }).limit(100),
  ]);
  if (listingReviews.error) throw normalizeError(listingReviews.error);
  if (sellerReviews.error) throw normalizeError(sellerReviews.error);
  if (appeals.error) throw normalizeError(appeals.error);
  if (reports.error) throw normalizeError(reports.error);
  const listingReportIds = (reports.data || []).filter(report => report.review_type === 'listing').map(report => String(report.review_id));
  const sellerReportIds = (reports.data || []).filter(report => report.review_type === 'seller').map(report => String(report.review_id));
  const [reportedListings, reportedSellers] = await Promise.all([
    listingReportIds.length
      ? supabase.from('listing_reviews').select('id,rating,review_text,listing:posts!listing_reviews_listing_id_fkey(id,title)').in('id', listingReportIds)
      : Promise.resolve({ data: [], error: null }),
    sellerReportIds.length
      ? supabase.from('seller_reviews').select('id,rating,review_text').in('id', sellerReportIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (reportedListings.error) throw normalizeError(reportedListings.error);
  if (reportedSellers.error) throw normalizeError(reportedSellers.error);
  const reportReviewById = new Map<string, ProfileRecord>(
    [...(reportedListings.data || []), ...(reportedSellers.data || [])]
      .map(review => [String(review.id), review]),
  );
  return [
    ...(listingReviews.data || []).map(review => ({ ...review, review_type: 'listing' })),
    ...(sellerReviews.data || []).map(review => ({ ...review, review_type: 'seller' })),
    ...(appeals.data || []).map(appeal => ({ ...appeal, queue_type: 'appeal' })),
    ...(reports.data || []).map(report => ({
      ...report,
      queue_type: 'report',
      review: reportReviewById.get(String(report.review_id)) || null,
    })),
  ].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

export async function moderateMarketplaceReview(options: {
  type: MarketplaceReviewType;
  reviewId: string;
  actorId: string;
  decision: ReviewModerationStatus;
  reason: string;
}): Promise<void> {
  const { error } = await requireClient().rpc('moderate_marketplace_review', {
    p_review_type: options.type,
    p_review_id: options.reviewId,
    p_actor_id: options.actorId,
    p_decision: options.decision,
    p_reason: options.reason,
  });
  if (error) throw normalizeError(error);
}

export async function respondToMarketplaceReview(options: {
  type: MarketplaceReviewType;
  reviewId: string;
  sellerId: string;
  response: string;
}): Promise<void> {
  const { error } = await requireClient().rpc('respond_to_marketplace_review', {
    p_review_type: options.type,
    p_review_id: options.reviewId,
    p_seller_id: options.sellerId,
    p_response: options.response,
  });
  if (error) throw normalizeError(error);
}

export async function toggleReviewHelpful(options: {
  type: MarketplaceReviewType;
  reviewId: string;
  voterId: string;
}): Promise<{ helpfulCount: number; helpful: boolean }> {
  const { data, error } = await requireClient().rpc('toggle_marketplace_review_helpful', {
    p_review_type: options.type,
    p_review_id: options.reviewId,
    p_voter_id: options.voterId,
  });
  if (error) throw normalizeError(error);
  if (!data || typeof data !== 'object') throw new Error('Supabase returned an invalid helpful vote result.');
  return data as { helpfulCount: number; helpful: boolean };
}

export async function reportMarketplaceReview(values: {
  type: MarketplaceReviewType;
  reviewId: string;
  reporterId: string;
  reason: string;
  details: string;
}): Promise<void> {
  const { error } = await requireClient().rpc('create_marketplace_review_report', {
    p_review_type: values.type,
    p_review_id: values.reviewId,
    p_reporter_id: values.reporterId,
    p_reason: values.reason,
    p_details: values.details,
  });
  if (error) throw normalizeError(error);
}

export async function createMarketplaceReviewAppeal(values: {
  type: MarketplaceReviewType;
  reviewId: string;
  reviewerId: string;
  reason: string;
}): Promise<void> {
  const { error } = await requireClient().rpc('create_marketplace_review_appeal', {
    p_review_type: values.type,
    p_review_id: values.reviewId,
    p_reviewer_id: values.reviewerId,
    p_reason: values.reason,
  });
  if (error) throw normalizeError(error);
}

export async function resolveMarketplaceReviewAppeal(options: {
  appealId: string;
  actorId: string;
  decision: 'upheld' | 'overturned';
  reason: string;
}): Promise<void> {
  const { error } = await requireClient().rpc('resolve_marketplace_review_appeal', {
    p_appeal_id: options.appealId,
    p_actor_id: options.actorId,
    p_decision: options.decision,
    p_reason: options.reason,
  });
  if (error) throw normalizeError(error);
}

export async function updateReviewReport(options: {
  reportId: string;
  actorId: string;
  status: 'reviewed' | 'dismissed';
  resolutionNote: string;
}): Promise<void> {
  const { error } = await requireClient().rpc('resolve_marketplace_review_report', {
    p_report_id: options.reportId,
    p_actor_id: options.actorId,
    p_decision: options.status,
    p_reason: options.resolutionNote,
  });
  if (error) throw normalizeError(error);
}

export async function getMessages(userId: string): Promise<MessageRecord[]> {
  const { data, error } = await requireClient().from('messages').select('*').or(`sender_id.eq.${userId},recipient_id.eq.${userId}`).order('timestamp', { ascending: true }).limit(200);
  if (error) throw normalizeError(error);
  return data || [];
}

export async function createMessage(values: ProfileRecord): Promise<MessageRecord> {
  const { data, error } = await requireClient().from('messages').insert(values).select('*').single();
  if (error) throw normalizeError(error);
  return data;
}

export async function markMessagesRead(userId: string): Promise<void> {
  const { error } = await requireClient().from('messages').update({ is_read: true, read_at: new Date().toISOString() }).eq('recipient_id', userId).eq('is_read', false);
  if (error) throw normalizeError(error);
}

export async function getFabricRequests(userId: string): Promise<FabricRequestRecord[]> {
  const { data, error } = await requireClient().from('fabric_requests').select('*').or(`buyer_id.eq.${userId},seller_id.eq.${userId}`).order('created_at', { ascending: false }).limit(200);
  if (error) throw normalizeError(error);
  return data || [];
}

export async function createFabricRequest(values: ProfileRecord): Promise<FabricRequestRecord> {
  const { data, error } = await requireClient().from('fabric_requests').insert(values).select('*').single();
  if (error) throw normalizeError(error);
  return data;
}

export async function updateFabricRequest(requestId: string, values: ProfileRecord): Promise<FabricRequestRecord> {
  const { data, error } = await requireClient().from('fabric_requests').update(values).eq('id', requestId).select('*').single();
  if (error) throw normalizeError(error);
  return data;
}

export async function getNotifications(userId: string): Promise<NotificationRecord[]> {
  const { data, error } = await requireClient().from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100);
  if (error) throw normalizeError(error);
  return data || [];
}

export async function createNotifications(records: NotificationRecord[]): Promise<void> {
  const { error } = await requireClient().from('notifications').insert(records);
  if (error) throw normalizeError(error);
}

export async function createBroadcast(records: NotificationRecord[]): Promise<void> {
  const { error } = await requireClient().from('notifications').insert(records);
  if (error) throw normalizeError(error);
}

export async function markNotificationsRead(userId: string): Promise<void> {
  const { error } = await requireClient().from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
  if (error) throw normalizeError(error);
}

export async function createDiscoveryEvent(values: ProfileRecord): Promise<ProfileRecord> {
  const { data, error } = await requireClient().from('discovery_events').insert(values).select('*').single();
  if (error) throw normalizeError(error);
  return data;
}

export async function getDiscoveryEvents(userId: string): Promise<ProfileRecord[]> {
  const query = requireClient().from('discovery_events').select('*').order('timestamp', { ascending: false }).limit(5000);
  const { data, error } = userId ? await query.eq('user_id', userId) : await query;
  if (error) throw normalizeError(error);
  return data || [];
}

export async function savePushToken(userId: string, token: string): Promise<void> {
  const hash = await import('node:crypto').then(({ createHash }) => createHash('sha256').update(token).digest('hex'));
  const { error } = await requireClient().from('push_tokens').upsert({ token_hash: hash, user_id: userId, token }, { onConflict: 'token_hash' });
  if (error) throw normalizeError(error);
}

export async function removePushToken(userId: string, token: string): Promise<void> {
  const hash = await import('node:crypto').then(({ createHash }) => createHash('sha256').update(token).digest('hex'));
  const { error } = await requireClient().from('push_tokens').delete().eq('token_hash', hash).eq('user_id', userId);
  if (error) throw normalizeError(error);
}

export async function uploadImage(userId: string, folder: string, fileName: string, buffer: Buffer, contentType: string): Promise<{ url: string; path: string }> {
  const storage = requireClient().storage;
  const path = `${folder}/${userId}/${fileName}`;
  const { error } = await storage.from('uploads').upload(path, buffer, { cacheControl: '31536000, immutable', contentType, upsert: true });
  if (error) throw normalizeError(error);
  const { data } = storage.from('uploads').getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export async function deleteUserUploads(userId: string): Promise<void> {
  const storage = requireClient().storage.from('uploads');
  const pendingFolders = ['profiles', 'posts', 'atelier'].map(folder => `${folder}/${userId}`);

  while (pendingFolders.length > 0) {
    const folder = pendingFolders.pop()!;
    let offset = 0;
    const pageSize = 1000;
    const files: string[] = [];

    while (true) {
      const { data, error } = await storage.list(folder, { limit: pageSize, offset });
      if (error) throw normalizeError(error);
      if (!data?.length) break;

      files.push(...data.filter(item => item.id).map(item => `${folder}/${item.name}`));
      pendingFolders.push(...data.filter(item => !item.id).map(item => `${folder}/${item.name}`));
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    for (let index = 0; index < files.length; index += 100) {
      const { error } = await storage.remove(files.slice(index, index + 100));
      if (error) throw normalizeError(error);
    }
  }
}

export async function getPromoPlans(): Promise<ProfileRecord[]> {
  const { data, error } = await requireClient().from('settings').select('data').eq('id', 'promoPlans').maybeSingle();
  if (error) throw normalizeError(error);
  return data?.data?.plans || [];
}

export async function getPromoPlansData(): Promise<ProfileRecord[]> {
  return getPromoPlans();
}

export async function savePromoPlans(values: ProfileRecord[]): Promise<ProfileRecord[]> {
  const { data, error } = await requireClient().from('settings').upsert({ id: 'promoPlans', data: { plans: values } }, { onConflict: 'id' }).select('data').single();
  if (error) throw normalizeError(error);
  return data.data.plans || [];
}
