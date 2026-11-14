const SEARCH_SYNONYMS: Record<string, string[]> = {
  'native wear': ['traditional wear', 'traditional attire'],
  senator: ['senator wear', 'senator suit'],
  agbada: ['agbada attire'],
  ankara: ['african wax print', 'wax print'],
  'wax print': ['african wax print', 'ankara'],
  'african wax print': ['ankara', 'wax print'],
  senetor: ['senator', 'senator wear'],
  ankaraa: ['ankara'],
  cloth: ['fabric', 'fabrics', 'textile', 'textiles'],
  fabric: ['cloth', 'textile', 'textiles'],
  fabrics: ['cloth', 'textile', 'textiles'],
  clothing: ['clothes', 'garment', 'garments'],
  clothes: ['clothing', 'garment', 'garments'],
};

const IGNORED_TERMS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'on', 'the', 'to', 'with']);
const normalizeWords = (value: string): string[] => value
  .normalize('NFKC')
  .toLowerCase()
  .split(/[^\p{L}\p{N}]+/u)
  .filter(Boolean);

const containsPhrase = (text: string, phrase: string): boolean => {
  const words = normalizeWords(text);
  const sought = normalizeWords(phrase);
  if (!sought.length || sought.length > words.length) return false;
  return words.some((_, index) => sought.every((word, offset) => words[index + offset] === word));
};

export interface ParsedMarketplaceSearch {
  text: string;
  locationHint: string;
  termGroups: string[][];
}

export function parseMarketplaceSearch(value: string): ParsedMarketplaceSearch {
  const normalized = value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
  const locationMatch = normalized.match(/\s+in\s+([\p{L}\p{N}][\p{L}\p{N}\s'-]{1,38})$/u);
  const locationHint = locationMatch?.[1]?.trim() || '';
  const text = (locationMatch ? normalized.slice(0, locationMatch.index) : normalized).trim();
  const words = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const termGroups: string[][] = [];

  for (let index = 0; index < words.length;) {
    const phrase = words.slice(index, index + 2).join(' ');
    const single = words[index];
    const phraseSynonyms = SEARCH_SYNONYMS[phrase];
    const singleSynonyms = SEARCH_SYNONYMS[single];
    if (phraseSynonyms) {
      termGroups.push([phrase, ...phraseSynonyms]);
      index += 2;
      continue;
    }
    if (singleSynonyms) {
      termGroups.push([single, ...singleSynonyms]);
      index += 1;
      continue;
    }
    if (!IGNORED_TERMS.has(single)) termGroups.push([single]);
    index += 1;
  }

  return { text, locationHint, termGroups };
}

export function getMarketplaceSearchRelevance(post: {
  title?: string;
  description?: string;
  categoryId?: string;
  listingType?: string;
  tags?: string[];
  listingDetails?: object;
  authorName?: string;
  authorLocation?: { city?: string; state?: string; country?: string };
}, search: ParsedMarketplaceSearch): number {
  const title = post.title || '';
  const category = post.categoryId || '';
  const tags = Array.isArray(post.tags) ? post.tags.join(' ') : '';
  const details = post.listingDetails ? Object.values(post.listingDetails).flat().join(' ') : '';
  const description = post.description || '';
  const searchableFields = [title, category, tags, details, description, post.authorName || '', post.listingType || ''];
  const matchedGroups = search.termGroups.filter(group =>
    group.some(term => searchableFields.some(field => containsPhrase(field, term))),
  ).length;
  const matchedIn = (field: string) => search.termGroups.filter(group =>
    group.some(term => containsPhrase(field, term)),
  ).length;
  const requestedArea = search.locationHint;
  const location = [post.authorLocation?.city, post.authorLocation?.state, post.authorLocation?.country]
    .filter(Boolean).join(' ');
  const exactSearchIn = (field: string) => search.text && containsPhrase(field, search.text);
  return (matchedGroups / Math.max(1, search.termGroups.length)) * 10
    + matchedIn(title) * 1.5
    + matchedIn(tags) * 1.8
    + matchedIn(category) * 1.5
    + matchedIn(details) * 1
    + matchedIn(description) * 0.5
    + (exactSearchIn(title) ? 4 : 0)
    + (exactSearchIn(category) ? 3 : 0)
    + (requestedArea && containsPhrase(location, requestedArea) ? 2 : 0);
}
