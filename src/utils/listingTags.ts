export const LISTING_TAG_OPTIONS = [
  'Menwear',
  'Womenwear',
  'Commercial',
  'Formal',
  'Bridal',
  'Casual',
  'Streetwear',
  'Fabrics',
] as const;

const TAG_ALIASES: Record<string, string> = {
  men: 'Menwear',
  male: 'Menwear',
  menwear: 'Menwear',
  menswear: 'Menwear',
  'men wear': 'Menwear',
  'mens wear': 'Menwear',
  women: 'Womenwear',
  woman: 'Womenwear',
  female: 'Womenwear',
  womenwear: 'Womenwear',
  womenswear: 'Womenwear',
  'women wear': 'Womenwear',
  'womens wear': 'Womenwear',
  commercial: 'Commercial',
  retail: 'Commercial',
  formal: 'Formal',
  occasion: 'Formal',
  bridal: 'Bridal',
  wedding: 'Bridal',
  casual: 'Casual',
  everyday: 'Casual',
  street: 'Streetwear',
  streetwear: 'Streetwear',
  urban: 'Streetwear',
  fabric: 'Fabrics',
  fabrics: 'Fabrics',
  textile: 'Fabrics',
  textiles: 'Fabrics',
  cloth: 'Fabrics',
};

export function normalizeListingTags(rawTags: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const rawTag of rawTags.split(',')) {
    const tag = rawTag.trim().slice(0, 48);
    if (!tag) continue;

    const normalized = TAG_ALIASES[tag.toLowerCase()] || tag;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);

    if (result.length === 20) break;
  }

  return result;
}

export function toggleListingTag(rawTags: string, tag: string): string {
  const tags = normalizeListingTags(rawTags);
  const selectedIndex = tags.findIndex(item => item.toLowerCase() === tag.toLowerCase());
  if (selectedIndex >= 0) tags.splice(selectedIndex, 1);
  else tags.push(tag);
  return tags.join(', ');
}
