import type { ClothPost } from '../types';

export const isAvailableMarketplaceListing = (post: ClothPost) => (
  !post.deletedAt
  && !post.isBlocked
  && post.status === 'published'
  && post.moderationStatus === 'approved'
  && post.availability !== 'unavailable'
);

export const getAvailableMarketplaceSellerIds = (posts: ClothPost[]) => new Set(
  posts.filter(isAvailableMarketplaceListing).map(post => post.authorId),
);
