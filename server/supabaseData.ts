import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type ProfileRecord = Record<string, unknown>;
export type PostRecord = Record<string, unknown>;
export type MessageRecord = Record<string, unknown>;
export type FabricRequestRecord = Record<string, unknown>;
export type NotificationRecord = Record<string, unknown>;

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

function toDatabaseRecord(values: ProfileRecord): ProfileRecord {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), value]));
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

export async function getUsers(): Promise<ProfileRecord[]> {
  const { data, error } = await requireClient().from('profiles').select('*').order('created_at', { ascending: false });
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

export async function getPosts(limit = 24): Promise<PostRecord[]> {
  const { data, error } = await requireClient().from('posts').select('*, author:profiles!posts_author_id_fkey(*)').order('created_at', { ascending: false }).limit(limit);
  if (error) throw normalizeError(error);
  return (data || []).map(post => ({ ...post, author: post.author || {} }));
}

export async function getPost(postId: string): Promise<PostRecord | null> {
  const { data, error } = await requireClient().from('posts').select('*, author:profiles!posts_author_id_fkey(*)').eq('id', postId).maybeSingle();
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

export async function deletePost(postId: string): Promise<void> {
  const { error } = await requireClient().from('posts').delete().eq('id', postId);
  if (error) throw normalizeError(error);
}

export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await requireClient().from('messages').delete().eq('id', messageId);
  if (error) throw normalizeError(error);
}

export async function getPostInteractions(postId: string): Promise<{ likes: string[]; saves: string[]; ratings: Record<string, number> }> {
  const [likes, saves, ratings] = await Promise.all([
    requireClient().from('post_likes').select('user_id').eq('post_id', postId),
    requireClient().from('post_saves').select('user_id').eq('post_id', postId),
    requireClient().from('ratings').select('user_id, rating').eq('post_id', postId),
  ]);
  if (likes.error) throw normalizeError(likes.error);
  if (saves.error) throw normalizeError(saves.error);
  if (ratings.error) throw normalizeError(ratings.error);
  return {
    likes: (likes.data || []).map(item => String(item.user_id)),
    saves: (saves.data || []).map(item => String(item.user_id)),
    ratings: Object.fromEntries((ratings.data || []).map(item => [String(item.user_id), Number(item.rating)])),
  };
}

export async function toggleLike(postId: string, userId: string): Promise<{ isLiked: boolean; likesCount: number }> {
  const existing = await requireClient().from('post_likes').select('*').eq('post_id', postId).eq('user_id', userId).maybeSingle();
  if (existing.error) throw normalizeError(existing.error);
  if (existing.data) {
    const { error } = await requireClient().from('post_likes').delete().eq('post_id', postId).eq('user_id', userId);
    if (error) throw normalizeError(error);
  } else {
    const { error } = await requireClient().from('post_likes').insert({ post_id: postId, user_id: userId });
    if (error) throw normalizeError(error);
  }
  const count = await requireClient().from('post_likes').select('*', { count: 'exact', head: true }).eq('post_id', postId);
  if (count.error) throw normalizeError(count.error);
  return { isLiked: !existing.data, likesCount: count.count || 0 };
}

export async function toggleSave(postId: string, userId: string): Promise<{ isSaved: boolean; savesCount: number }> {
  const existing = await requireClient().from('post_saves').select('*').eq('post_id', postId).eq('user_id', userId).maybeSingle();
  if (existing.error) throw normalizeError(existing.error);
  if (existing.data) {
    const { error } = await requireClient().from('post_saves').delete().eq('post_id', postId).eq('user_id', userId);
    if (error) throw normalizeError(error);
  } else {
    const { error } = await requireClient().from('post_saves').insert({ post_id: postId, user_id: userId });
    if (error) throw normalizeError(error);
  }
  const count = await requireClient().from('post_saves').select('*', { count: 'exact', head: true }).eq('post_id', postId);
  if (count.error) throw normalizeError(count.error);
  return { isSaved: !existing.data, savesCount: count.count || 0 };
}

export async function setRating(postId: string, userId: string, rating: number): Promise<{ rating: number; ratingCount: number; ratingsByUser: Record<string, number> }> {
  const { error } = await requireClient().from('ratings').upsert({ post_id: postId, user_id: userId, rating, updated_at: new Date().toISOString() }, { onConflict: 'post_id,user_id' });
  if (error) throw normalizeError(error);
  const { data, error: listError } = await requireClient().from('ratings').select('user_id, rating').eq('post_id', postId);
  if (listError) throw normalizeError(listError);
  const ratings = (data || []).map(item => [String(item.user_id), Number(item.rating)] as const);
  const values: number[] = ratings.map(([, value]) => value);
  return { rating: values.reduce((sum, value) => sum + value, 0) / values.length, ratingCount: values.length, ratingsByUser: Object.fromEntries(ratings) };
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
  const { error } = await storage.from('uploads').upload(path, buffer, { cacheControl: '3600', contentType, upsert: true });
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
