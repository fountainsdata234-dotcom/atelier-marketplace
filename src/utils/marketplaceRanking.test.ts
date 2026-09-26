import { describe, expect, it } from 'vitest';
import { ClothPost, DiscoveryEvent, User } from '../types';
import { getRatingQuality, rankTrendingPosts } from './marketplaceRanking';

const makePost = (id: string, overrides: Partial<ClothPost> = {}): ClothPost => ({
  id,
  authorId: `seller-${id}`,
  authorName: 'Atelier',
  authorRole: 'tailor',
  authorHandle: '@atelier',
  authorLocation: { country: 'Ghana', state: 'Greater Accra', city: 'Accra' },
  isPromoted: false,
  title: `Garment ${id}`,
  description: '',
  tags: ['linen'],
  pricing: { basic: 0, premiumMaterial: 0, bespokeComplexity: 0 },
  imageUrl: '',
  likes: [],
  saves: [],
  rating: 0,
  ratingCount: 0,
  createdAt: '2026-09-20T00:00:00.000Z',
  ...overrides,
});

describe('marketplace ranking', () => {
  it('tempers a perfect rating with very few reviews', () => {
    expect(getRatingQuality(5, 1)).toBeLessThan(getRatingQuality(4.8, 100));
    expect(getRatingQuality(5, 0)).toBeCloseTo(0.7);
    expect(getRatingQuality(Number.NaN, Number.NaN)).toBeCloseTo(0.7);
  });

  it('ranks recent strong engagement ahead of unrelated items', () => {
    const posts = [makePost('quiet'), makePost('popular')];
    const events: DiscoveryEvent[] = [{
      itemId: 'popular',
      eventType: 'PURCHASE',
      timestamp: '2026-09-26T11:59:00.000Z',
      sessionId: 'session-1',
    }];

    expect(rankTrendingPosts(posts, [] as User[], events, undefined, [], Date.parse('2026-09-26T12:00:00.000Z'))[0].id).toBe('popular');
  });

  it('uses interacted tags and saved searches to personalize results', () => {
    const posts = [
      makePost('linen-match', { authorId: 'seller-1', tags: ['linen'] }),
      makePost('silk-match', { authorId: 'seller-2', tags: ['silk'] }),
    ];
    const events: DiscoveryEvent[] = [{
      userId: 'buyer-1',
      itemId: 'linen-match',
      eventType: 'SAVE',
      timestamp: '2026-09-26T11:00:00.000Z',
      sessionId: 'session-1',
    }];

    const interactedRanked = rankTrendingPosts(posts, [] as User[], events, 'buyer-1', [], Date.parse('2026-09-26T12:00:00.000Z'));
    const searchedRanked = rankTrendingPosts(posts, [] as User[], [], 'buyer-1', ['silk'], Date.parse('2026-09-26T12:00:00.000Z'));
    expect(interactedRanked[0].id).toBe('linen-match');
    expect(searchedRanked[0].id).toBe('silk-match');
  });

  it('ignores malformed event dates and keeps invalid post dates rankable', () => {
    const posts = [
      makePost('invalid-date', { createdAt: 'not-a-date', rating: Number.NaN, ratingCount: Number.NaN }),
      makePost('valid-date', { createdAt: '2026-09-26T11:00:00.000Z' }),
    ];
    const events: DiscoveryEvent[] = [{
      itemId: 'invalid-date',
      eventType: 'PURCHASE',
      timestamp: 'not-a-date',
      sessionId: 'session-1',
    }];

    const ranked = rankTrendingPosts(posts, [] as User[], events, undefined, [], Date.parse('2026-09-26T12:00:00.000Z'));
    expect(ranked.map(post => post.id)).toEqual(['valid-date', 'invalid-date']);
  });
});