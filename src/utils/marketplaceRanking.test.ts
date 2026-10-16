import { describe, expect, it } from 'vitest';
import { ClothPost, DiscoveryEvent, RecommendationPreferences, User } from '../types';
import { calculateFeedScore, getRatingQuality, getTopTailors, isNewSeller, rankMarketplaceListings, rankTrendingPosts } from './marketplaceRanking';

const defaultRecommendationPreferences: RecommendationPreferences = {
  enabled: false,
  categories: [],
  styles: [],
  minimumPrice: null,
  maximumPrice: null,
  currency: '',
  country: '',
  state: '',
};

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
  it('uses the raw average without a fabricated prior in client-side ranking', () => {
    expect(getRatingQuality(5, 1)).toBe(1);
    expect(getRatingQuality(4.8, 100)).toBeCloseTo(0.96);
    expect(getRatingQuality(5, 0)).toBe(0);
    expect(getRatingQuality(Number.NaN, Number.NaN)).toBe(0);
  });

  it('does not let a star rating by itself increase marketplace feed rank', () => {
    const now = Date.parse('2026-09-26T12:00:00.000Z');
    const lowRating = makePost('same-work', { rating: 1, ratingCount: 100 });
    const highRating = makePost('same-work', { rating: 5, ratingCount: 100 });
    expect(calculateFeedScore(highRating, null, now)).toBe(calculateFeedScore(lowRating, null, now));
  });

  it('uses confidence-adjusted listing and seller feedback in personalized ranking', () => {
    const posts = [
      makePost('strong-feedback', {
        confidenceAdjustedRating: 4.8,
        ratingCount: 12,
        sellerConfidenceAdjustedRating: 4.7,
        sellerReviewCount: 16,
      }),
      makePost('limited-feedback', {
        confidenceAdjustedRating: 2.8,
        ratingCount: 12,
        sellerConfidenceAdjustedRating: 3,
        sellerReviewCount: 16,
      }),
    ];

    expect(rankMarketplaceListings(posts, [], [], defaultRecommendationPreferences)
      .map(post => post.id)).toEqual(['strong-feedback', 'limited-feedback']);
  });

  it('uses explicit preferences and soft-decayed activity only after opt-in', () => {
    const now = Date.parse('2026-09-26T12:00:00.000Z');
    const posts = [
      makePost('senator', { authorId: 'maker-a', categoryId: 'clothing', tags: ['senator'], priceMin: 80, currency: 'USD', createdAt: '2026-09-20T00:00:00.000Z' }),
      makePost('linen', { authorId: 'maker-b', categoryId: 'fabric', tags: ['linen'], priceMin: 15, currency: 'USD', createdAt: '2026-09-20T00:00:00.000Z' }),
    ];
    const activities: DiscoveryEvent[] = [{
      itemId: 'senator',
      eventType: 'SAVE',
      timestamp: '2026-09-26T11:00:00.000Z',
      sessionId: 'session-1',
      categoryId: 'clothing',
      tags: ['senator'],
    }];
    const preferences = {
      ...defaultRecommendationPreferences,
      enabled: true,
      categories: ['clothing'],
      styles: ['senator'],
      minimumPrice: 50,
      currency: 'USD',
    };
    const enabled = rankMarketplaceListings(posts, [], activities, preferences, { now });
    const disabled = rankMarketplaceListings(posts, [], activities, defaultRecommendationPreferences, { now });
    expect(enabled.map(post => post.id)).toEqual(['senator']);
    expect(disabled).toHaveLength(2);
  });

  it('removes explicit not-interested listings and explains recent qualified trends', () => {
    const now = Date.parse('2026-09-26T12:00:00.000Z');
    const posts = [
      makePost('hidden', { authorId: 'maker-a' }),
      makePost('trending', { authorId: 'maker-b', createdAt: '2026-09-20T00:00:00.000Z' }),
    ];
    const activities: DiscoveryEvent[] = [{
      itemId: 'hidden',
      eventType: 'NOT_INTERESTED',
      timestamp: '2026-09-26T11:00:00.000Z',
      sessionId: 'session-1',
      tags: ['linen'],
    }];
    const ranked = rankMarketplaceListings(posts, [], activities, {
      ...defaultRecommendationPreferences,
      enabled: true,
    }, {
      now,
      trendScores: new Map([['trending', { score: 12, confidence: 0.9 }]]),
    });
    expect(ranked.map(post => post.id)).toEqual(['trending']);
    expect(ranked[0].recommendationReason).toBe('Recent marketplace interest');
  });

  it('ranks recent strong engagement ahead of unrelated items', () => {
    const posts = [makePost('quiet'), makePost('popular')];
    const events: DiscoveryEvent[] = [{
      itemId: 'popular',
      eventType: 'ENQUIRY',
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
      eventType: 'ENQUIRY',
      timestamp: 'not-a-date',
      sessionId: 'session-1',
    }];

    const ranked = rankTrendingPosts(posts, [] as User[], events, undefined, [], Date.parse('2026-09-26T12:00:00.000Z'));
    expect(ranked.map(post => post.id)).toEqual(['valid-date', 'invalid-date']);
  });

  it('prefers recent engagement and complete listings over raw likes alone', () => {
    const now = Date.parse('2026-09-26T12:00:00.000Z');
    const sellerA = {
      id: 'seller-a',
      email: 'a@example.com',
      name: 'Seller A',
      role: 'tailor' as const,
      phone: '1',
      countryCode: 'GH',
      location: { country: 'Ghana', state: 'Greater Accra', city: 'Accra' },
      handle: '@seller-a',
      isPromoted: false,
      isBlocked: false,
      followers: [],
      createdAt: '2026-09-01T00:00:00.000Z',
    };
    const sellerB = {
      id: 'seller-b',
      email: 'b@example.com',
      name: 'Seller B',
      role: 'fabric_seller' as const,
      phone: '2',
      countryCode: 'GH',
      location: { country: 'Ghana', state: 'Greater Accra', city: 'Accra' },
      handle: '@seller-b',
      isPromoted: false,
      isBlocked: false,
      followers: [],
      createdAt: '2026-09-01T00:00:00.000Z',
    };

    const oldPost = makePost('older', {
      authorId: 'seller-a',
      likes: Array.from({ length: 1200 }, (_, index) => `user-${index}`),
      saves: Array.from({ length: 220 }, (_, index) => `save-${index}`),
      rating: 4.9,
      ratingCount: 180,
      createdAt: '2026-09-20T00:00:00.000Z',
    });
    const trendingPost = makePost('hotter', {
      authorId: 'seller-b',
      likes: Array.from({ length: 12 }, (_, index) => `like-${index}`),
      saves: Array.from({ length: 6 }, (_, index) => `save-${index}`),
      rating: 4.8,
      ratingCount: 24,
      createdAt: '2026-09-26T11:45:00.000Z',
    });

    expect(calculateFeedScore(trendingPost, sellerB, now)).toBeGreaterThan(calculateFeedScore(oldPost, sellerA, now));
  });

  it('reserves rotating exploration positions for new sellers regardless of lifetime popularity', () => {
    const sellers: User[] = [
      {
        id: 'seller-1',
        email: 'a@example.com',
        name: 'A',
        role: 'tailor',
        phone: '1',
        countryCode: 'GH',
        location: { country: 'Ghana', state: 'Greater Accra', city: 'Accra' },
        handle: '@a',
        isPromoted: true,
        isBlocked: false,
        followers: [],
        createdAt: '2026-08-01T00:00:00.000Z',
      },
      {
        id: 'seller-new',
        email: 'new@example.com',
        name: 'New',
        role: 'tailor',
        phone: '2',
        countryCode: 'GH',
        location: { country: 'Ghana', state: 'Greater Accra', city: 'Accra' },
        handle: '@new',
        isPromoted: false,
        isBlocked: false,
        followers: [],
        createdAt: '2026-09-20T00:00:00.000Z',
      },
    ];

    const posts = [
      makePost('p-1', {
        authorId: 'seller-1',
        imageUrl: 'https://example.test/established.jpg',
        likes: Array.from({ length: 500 }, (_, index) => `like-${index}`),
        saves: Array.from({ length: 200 }, (_, index) => `save-${index}`),
      }),
      makePost('p-2', { authorId: 'seller-new', imageUrl: 'https://example.test/new.jpg' }),
    ];

    const now = Date.parse('2026-09-26T12:00:00.000Z');
    expect(isNewSeller(sellers[1], now)).toBe(true);
    const ranked = getTopTailors(posts, sellers, now);
    expect(ranked.map(seller => seller.id)).toEqual(['seller-new', 'seller-1']);
  });
});