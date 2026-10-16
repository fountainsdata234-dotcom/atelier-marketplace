const SEARCH_SYNONYMS: Record<string, string[]> = {
  'native wear': ['traditional wear', 'traditional attire'],
  senator: ['senator wear', 'senator suit'],
  agbada: ['agbada attire'],
  ankara: ['african wax print', 'wax print'],
  'wax print': ['african wax print', 'ankara'],
  'african wax print': ['ankara', 'wax print'],
  senetor: ['senator', 'senator wear'],
  ankaraa: ['ankara'],
};

const IGNORED_TERMS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'on', 'the', 'to', 'with']);

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
  tags?: string[];
  listingDetails?: object;
  authorName?: string;
  authorLocation?: { city?: string; state?: string; country?: string };
}, search: ParsedMarketplaceSearch): number {
  const tokens = [
    post.title,
    post.categoryId,
    post.tags?.join(' '),
    post.listingDetails ? Object.values(post.listingDetails).flat().join(' ') : '',
    post.authorName,
    post.description,
  ].join(' ').toLowerCase();
  const title = (post.title || '').toLowerCase();
  const category = (post.categoryId || '').toLowerCase();
  const matchedGroups = search.termGroups.filter(group => group.some(term =>
    tokens.includes(term) || (term.length >= 4 && tokens.includes(term.slice(0, -1))),
  )).length;
  const requestedArea = search.locationHint.toLowerCase();
  const location = [post.authorLocation?.city, post.authorLocation?.state, post.authorLocation?.country]
    .filter(Boolean).join(' ').toLowerCase();
  return (matchedGroups / Math.max(1, search.termGroups.length)) * 10
    + (search.text && title.includes(search.text) ? 6 : 0)
    + (search.text && category.includes(search.text) ? 4 : 0)
    + (requestedArea && location.includes(requestedArea) ? 2 : 0);
}
