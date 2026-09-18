import { firebaseAuth } from './firebase';
import { AdminPromoPlan, ClothPost, DirectMessage, FabricRequest, User, DiscoveryEvent, DiscoveryEventType } from '../types';

const API_URL = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:8787' : window.location.origin);

async function request<T>(path: string, options: RequestInit = {}) {
  const token = firebaseAuth.currentUser ? await firebaseAuth.currentUser.getIdToken() : null;
  if (path === '/api/profile' && !token) {
    throw new Error('Authentication is not ready.');
  }
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'The server request failed.');
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export const api = {
  getUsers: () => request<User[]>('/api/users'),
  getProfile: () => request<Partial<User>>('/api/profile'),
  getPromoPlans: () => request<AdminPromoPlan[]>('/api/promo-plans'),
  savePromoPlans: (plans: AdminPromoPlan[]) => request<AdminPromoPlan[]>('/api/promo-plans', { method: 'PUT', body: JSON.stringify({ plans }) }),
  toggleFollow: (userId: string) => request<{ followers: string[]; isFollowing: boolean }>(`/api/users/${userId}/follow`, { method: 'POST' }),
  updateUserProfile: (userId: string, updates: Partial<User>) => request<User>(`/api/users/${userId}/profile`, { method: 'PUT', body: JSON.stringify(updates) }),
  addAdmin: (email: string) => request<User>('/api/admin/admins', { method: 'POST', body: JSON.stringify({ email }) }),
  removeAdmin: (userId: string) => request<void>(`/api/admin/admins/${userId}`, { method: 'DELETE' }),
  setUserBlocked: (userId: string, blocked: boolean) => request<{ ok: boolean; blocked: boolean }>(`/api/admin/users/${userId}/block`, { method: 'POST', body: JSON.stringify({ blocked }) }),
  getPosts: () => request<ClothPost[]>('/api/posts'),
  saveProfile: (profile: Partial<User>) => request<User>('/api/profile', { method: 'PUT', body: JSON.stringify(profile) }),
  createPost: (post: Omit<ClothPost, 'id' | 'likes' | 'saves' | 'createdAt'>) => request<ClothPost>('/api/posts', { method: 'POST', body: JSON.stringify(post) }),
  deletePost: (postId: string) => request<void>(`/api/posts/${postId}`, { method: 'DELETE' }),
  toggleLike: (postId: string) => request<{ isLiked: boolean }>(`/api/posts/${postId}/like`, { method: 'POST' }),
  toggleSave: (postId: string) => request<{ isSaved: boolean }>(`/api/posts/${postId}/save`, { method: 'POST' }),
  ratePost: (postId: string, rating: number) => request<void>(`/api/posts/${postId}/rating`, { method: 'POST', body: JSON.stringify({ rating }) }),
  recordDiscoveryEvent: (itemId: string, eventType: DiscoveryEventType, sessionId: string) => request<DiscoveryEvent>('/api/discovery-events', { method: 'POST', body: JSON.stringify({ itemId, eventType, sessionId }) }),
  getDiscoveryEvents: () => request<DiscoveryEvent[]>('/api/discovery-events'),
  getMessages: () => request<DirectMessage[]>('/api/messages'),
  markMessagesRead: () => request<void>('/api/messages/read', { method: 'POST' }),
  sendMessage: (message: Omit<DirectMessage, 'id' | 'timestamp' | 'isRead'>) => request<DirectMessage>('/api/messages', { method: 'POST', body: JSON.stringify(message) }),
  createFabricRequest: (requestData: Omit<FabricRequest, 'id' | 'status' | 'createdAt' | 'updatedAt'>) => request<FabricRequest>('/api/fabric-requests', { method: 'POST', body: JSON.stringify(requestData) }),
  getFabricRequests: () => request<FabricRequest[]>('/api/fabric-requests'),
  updateFabricRequestStatus: (requestId: string, status: FabricRequest['status']) => request<FabricRequest>(`/api/fabric-requests/${requestId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};
