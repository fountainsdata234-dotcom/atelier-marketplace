import { describe, expect, it } from 'vitest';
import type { ClothPost } from '../types';
import { getAvailableMarketplaceSellerIds, isAvailableMarketplaceListing } from './marketplaceAvailability';

const makeListing = (overrides: Partial<ClothPost> = {}): ClothPost => ({
  id: '00000000-0000-4000-8000-000000000001',
  authorId: 'seller-1',
  authorName: 'Seller',
  authorRole: 'tailor',
  authorHandle: '@seller',
  authorAvatar: '',
  isPromoted: false,
  pricing: { basic: 100, premiumMaterial: 0, bespokeComplexity: 0 },
  authorWhatsapp: '',
  authorLocation: { country: 'Nigeria', state: 'Lagos', city: 'Lagos' },
  title: 'Custom garment',
  description: 'A made-to-order garment',
  categoryId: 'tailoring',
  tags: [],
  priceMin: 100,
  priceMax: 100,
  currency: 'NGN',
  imageUrl: '',
  likes: [],
  saves: [],
  createdAt: '2026-10-22T00:00:00.000Z',
  status: 'published',
  moderationStatus: 'approved',
  availability: 'available',
  ...overrides,
});

describe('marketplace seller availability', () => {
  it('counts only published, approved, unblocked, undeleted available listings', () => {
    expect(isAvailableMarketplaceListing(makeListing())).toBe(true);
    expect(isAvailableMarketplaceListing(makeListing({ status: 'draft' }))).toBe(false);
    expect(isAvailableMarketplaceListing(makeListing({ moderationStatus: 'pending' }))).toBe(false);
    expect(isAvailableMarketplaceListing(makeListing({ availability: 'unavailable' }))).toBe(false);
    expect(isAvailableMarketplaceListing(makeListing({ isBlocked: true }))).toBe(false);
    expect(isAvailableMarketplaceListing(makeListing({ deletedAt: '2026-10-22T00:00:00.000Z' }))).toBe(false);
  });

  it('returns unique sellers with available listings', () => {
    expect(getAvailableMarketplaceSellerIds([
      makeListing(),
      makeListing({ id: '00000000-0000-4000-8000-000000000002' }),
      makeListing({ authorId: 'seller-2', status: 'paused' }),
      makeListing({ authorId: 'seller-3' }),
    ])).toEqual(new Set(['seller-1', 'seller-3']));
  });
});
