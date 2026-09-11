import { firebaseAuth } from './firebase';
import { ClothPost, DirectMessage, User } from '../types';

const API_URL = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:8787' : window.location.origin);

async function request<T>(path: string, options: RequestInit = {}) {
  const token = firebaseAuth.currentUser ? await firebaseAuth.currentUser.getIdToken() : null;
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
  updateUserProfile: (userId: string, updates: Partial<User>) => request<User>(`/api/users/${userId}/profile`, { method: 'PUT', body: JSON.stringify(updates) }),
  getPosts: () => request<ClothPost[]>('/api/posts'),
  saveProfile: (profile: Partial<User>) => request<User>('/api/profile', { method: 'PUT', body: JSON.stringify(profile) }),
  createPost: (post: Omit<ClothPost, 'id' | 'likes' | 'saves' | 'createdAt'>) => request<ClothPost>('/api/posts', { method: 'POST', body: JSON.stringify(post) }),
  deletePost: (postId: string) => request<void>(`/api/posts/${postId}`, { method: 'DELETE' }),
  toggleLike: (postId: string) => request<{ isLiked: boolean }>(`/api/posts/${postId}/like`, { method: 'POST' }),
  toggleSave: (postId: string) => request<{ isSaved: boolean }>(`/api/posts/${postId}/save`, { method: 'POST' }),
  ratePost: (postId: string, rating: number) => request<void>(`/api/posts/${postId}/rating`, { method: 'POST', body: JSON.stringify({ rating }) }),
  getMessages: () => request<DirectMessage[]>('/api/messages'),
  sendMessage: (message: Omit<DirectMessage, 'id' | 'timestamp' | 'isRead'>) => request<DirectMessage>('/api/messages', { method: 'POST', body: JSON.stringify(message) }),
};
