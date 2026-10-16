import { describe, expect, it } from 'vitest';
import { getMarketplaceSearchRelevance, parseMarketplaceSearch } from './marketplaceSearch';

describe('marketplace search parsing and ranking', () => {
  it('normalizes terms and extracts trailing location hints without losing search intent', () => {
    expect(parseMarketplaceSearch('  BLACK   Senator fabric in Aba ')).toEqual({
      text: 'black senator fabric',
      locationHint: 'aba',
      termGroups: [['black'], ['senator', 'senator wear', 'senator suit'], ['fabric']],
    });
  });

  it('expands maintained aliases without conflating unrelated fabric terms', () => {
    const ankara = parseMarketplaceSearch('Ankara');
    expect(ankara.termGroups).toContainEqual(['ankara', 'african wax print', 'wax print']);
    expect(ankara.termGroups).not.toContainEqual(expect.arrayContaining(['senator']));
  });

  it('ranks exact title/category and structured attribute matches above weak description matches', () => {
    const parsed = parseMarketplaceSearch('black Senator');
    const exact = getMarketplaceSearchRelevance({
      title: 'Black Senator Suit',
      categoryId: 'senator',
      listingDetails: { colour: 'Black', garmentType: 'Senator' },
    }, parsed);
    const descriptionOnly = getMarketplaceSearchRelevance({
      title: 'Custom outfit',
      description: 'Black senator styles are available',
    }, parsed);
    expect(exact).toBeGreaterThan(descriptionOnly);
  });
});
