import { describe, expect, it } from 'vitest';
import { normalizeListingTags, toggleListingTag } from './listingTags';

describe('listing tags', () => {
  it('keeps womenwear in its own category instead of matching menwear', () => {
    expect(normalizeListingTags('Womenwear')).toEqual(['Womenwear']);
    expect(normalizeListingTags('women, Womenwear')).toEqual(['Womenwear']);
  });

  it('preserves custom tags and removes duplicate tags case-insensitively', () => {
    expect(normalizeListingTags('Hand-embroidered, hand-embroidered, Suit for men'))
      .toEqual(['Hand-embroidered', 'Suit for men']);
  });

  it('toggles an aliased preset off and on', () => {
    expect(toggleListingTag('women', 'Womenwear')).toBe('');
    expect(toggleListingTag('', 'Womenwear')).toBe('Womenwear');
  });
});
