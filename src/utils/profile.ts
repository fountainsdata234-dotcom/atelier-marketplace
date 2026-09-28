import { UserRole } from '../types';

export function getProfileInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'AT';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

export function getRoleLabel(role: UserRole): string {
  if (role === 'fabric_seller') return 'Fabric Seller';
  if (role === 'tailor') return 'Tailor';
  if (role === 'admin') return 'Administrator';
  return 'Buyer';
}

export function getHandleSlug(handle: string): string {
  return handle.replace(/^@/, '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-');
}

export function getImageAltText(input?: string, fallback?: string): string {
  const value = input?.trim();
  if (value) return value;
  return fallback || 'Atelier marketplace product image';
}

export function buildSellerShareUrl(origin: string, handle: string): string {
  return `${origin}/@${getHandleSlug(handle)}`;
}

export function buildPostShareUrl(origin: string, handle: string, postId: string): string {
  return `${buildSellerShareUrl(origin, handle)}/post/${encodeURIComponent(postId)}`;
}

export function buildCollectionShareUrl(origin: string, handle: string, collectionId: string): string {
  return `${buildSellerShareUrl(origin, handle)}/collection/${encodeURIComponent(collectionId)}`;
}