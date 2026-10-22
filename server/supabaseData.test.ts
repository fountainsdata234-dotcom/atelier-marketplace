import { describe, expect, it } from 'vitest';
import { buildMarketplaceCursorFilter, isMissingRpcFunction, type MarketplaceCursor } from './supabaseData.js';

describe('marketplace keyset pagination', () => {
  it('keeps deterministic tie breakers for popularity sorting', () => {
    const cursor: MarketplaceCursor = {
      sort: 'popularity',
      values: [8.5, '2026-10-15T11:00:00.000Z', '00000000-0000-4000-8000-000000000001'],
    };

    expect(buildMarketplaceCursorFilter('popularity', cursor)).toBe(
      'popularity_score.lt.8.5,'
      + 'and(popularity_score.eq.8.5,published_at.lt.2026-10-15T11:00:00.000Z),'
      + 'and(popularity_score.eq.8.5,published_at.eq.2026-10-15T11:00:00.000Z,id.lt.00000000-0000-4000-8000-000000000001)',
    );
  });

  describe('database RPC compatibility detection', () => {
    it('recognizes PostgREST missing-function responses for the requested RPC', () => {
      expect(isMissingRpcFunction({
        code: 'PGRST202',
        message: 'Could not find the function public.record_marketplace_recommendation_impression',
      }, 'record_marketplace_recommendation_impression')).toBe(true);
    });

    it('does not treat other RPC failures as missing migrations', () => {
      expect(isMissingRpcFunction({
        code: 'PGRST202',
        message: 'Could not find the function public.other_function',
      }, 'record_marketplace_recommendation_impression')).toBe(false);
      expect(isMissingRpcFunction({
        code: 'XX000',
        message: 'Database connection failed',
      }, 'record_marketplace_recommendation_impression')).toBe(false);
    });
  });

  it('includes null prices after non-null prices in ascending order', () => {
    const cursor: MarketplaceCursor = {
      sort: 'price_asc',
      values: [25, '2026-10-15T11:00:00.000Z', '00000000-0000-4000-8000-000000000001'],
    };

    expect(buildMarketplaceCursorFilter('price_asc', cursor)).toBe(
      'or(price_min.gt.25,price_min.is.null),'
      + 'and(price_min.eq.25,published_at.lt.2026-10-15T11:00:00.000Z),'
      + 'and(price_min.eq.25,published_at.eq.2026-10-15T11:00:00.000Z,id.lt.00000000-0000-4000-8000-000000000001)',
    );
  });

  it('continues within the null-price tail without returning priced rows', () => {
    const cursor: MarketplaceCursor = {
      sort: 'price_desc',
      values: [null, '2026-10-15T11:00:00.000Z', '00000000-0000-4000-8000-000000000001'],
    };

    expect(buildMarketplaceCursorFilter('price_desc', cursor)).toBe(
      'and(price_min.is.null,published_at.lt.2026-10-15T11:00:00.000Z),'
      + 'and(price_min.is.null,published_at.eq.2026-10-15T11:00:00.000Z,id.lt.00000000-0000-4000-8000-000000000001)',
    );
  });
});
