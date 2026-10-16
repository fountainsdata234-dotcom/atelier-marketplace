import { ClothPost, DiscoveryEvent, DiscoveryEventType, RecommendationEventType, RecommendationPreferences, User } from '../types';
import { getMarketplaceSearchRelevance, parseMarketplaceSearch } from './marketplaceSearch';

const EVENT_WEIGHTS: Partial<Record<RecommendationEventType, number>> = {
  VIEW: 1,
  LIKE: 5,
  SAVE: 7,
  SHARE: 6,
  ENQUIRY: 9,
};

const DAY_IN_MS = 86_400_000;
const NEW_SELLER_WINDOW_MS = 30 * DAY_IN_MS;
const EXPLORATION_CADENCE = 3;
const INTEREST_HALF_LIFE_MS = 14 * DAY_IN_MS;
const HIDE_RETENTION_MS = 30 * DAY_IN_MS;
const RECOMMENDATION_RETENTION_MS = 180 * DAY_IN_MS;
export const RECOMMENDATION_WEIGHTS = {
  personalRelevance: 0.25,
  recentTrend: 0.25,
  listingRating: 0.2,
  freshness: 0.15,
  sellerReputation: 0.15,
} as const;

const PERSONAL_EVENT_WEIGHTS: Partial<Record<RecommendationEventType, number>> = {
  IMPRESSION: 0,
  VIEW: 0.25,
  LIKE: 2,
  SAVE: 4,
  SHARE: 3,
  ENQUIRY: 5,
  HIDE: -5,
  DISMISS: -5,
  NOT_INTERESTED: -7,
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const normalizeToken = (value: string): string => value.trim().toLowerCase();

export const isNewSeller = (seller: User, now = Date.now()): boolean => {
  const createdAt = Date.parse(seller.createdAt);
  return Number.isFinite(createdAt) && now - createdAt >= 0 && now - createdAt <= NEW_SELLER_WINDOW_MS;
};

export const getRatingQuality = (rating = 0, ratingCount = 0): number => {
  const validCount = Number.isFinite(ratingCount) ? Math.max(0, ratingCount) : 0;
  const validRating = Number.isFinite(rating) ? Math.min(5, Math.max(0, rating)) : 0;
  return validCount > 0 ? validRating / 5 : 0;
};

export const calculateFeedScore = (
  post: ClothPost,
  seller?: User | null,
  now = Date.now(),
): number => {
  const ageMs = Math.max(0, now - postTimestamp(post));
  const likes = Array.isArray(post.likes) ? post.likes.length : 0;
  const saves = Array.isArray(post.saves) ? post.saves.length : 0;
  const completionRate = (post.imageUrl ? 0.35 : 0)
    + (post.description?.trim() ? 0.2 : 0)
    + (Array.isArray(post.tags) && post.tags.length ? 0.2 : 0)
    + (post.title?.trim() ? 0.15 : 0)
    + (post.authorName?.trim() ? 0.1 : 0);
  const freshness = Math.exp(-ageMs / (2 * DAY_IN_MS));
  const recencyBoost = freshness * 240;
  const duplicatePenalty = Array.isArray(post.tags) && post.tags.length > 6 ? 8 : 0;
  const spamPenalty = seller?.isBlocked ? 80 : 0;
  const likesScore = Math.log1p(likes) * 14;
  const savesScore = Math.log1p(saves) * 18;

  const score = likesScore
    + savesScore
    + completionRate * 25
    + recencyBoost
    - duplicatePenalty
    - spamPenalty;

  return Number.isFinite(score) ? score : 0;
};

export const getTopTailors = (
  posts: ClothPost[],
  users: User[],
  now = Date.now(),
): User[] => {
  const candidates = users
    .filter(user => !user.isBlocked && (user.role === 'tailor' || user.role === 'fabric_seller'))
    .map(seller => {
      const portfolio = posts.filter(post =>
        post.authorId === seller.id
        && !post.deletedAt
        && (post.status === undefined || post.status === 'published')
        && (post.moderationStatus === undefined || post.moderationStatus === 'approved')
        && post.availability !== 'unavailable'
        && post.status !== 'sold_out'
        && !post.isBlocked
        && Boolean(post.imageUrl?.trim()),
      );
      if (portfolio.length === 0) return null;
      const engagement = portfolio.reduce((sum, post) =>
        sum + Math.log1p(post.likes?.length || 0) + 1.5 * Math.log1p(post.saves?.length || 0), 0);
      const recency = portfolio.reduce((sum, post) => {
        const timestamp = postTimestamp(post);
        return timestamp ? sum + Math.exp(-Math.max(0, now - timestamp) / (14 * DAY_IN_MS)) : sum;
      }, 0);
      return {
        seller,
        isNew: isNewSeller(seller, now),
        score: engagement / Math.sqrt(portfolio.length) + Math.log1p(portfolio.length) + recency,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((a, b) => b.score - a.score || a.seller.id.localeCompare(b.seller.id));

  const established = candidates.filter(candidate => !candidate.isNew);
  const newSellers = candidates.filter(candidate => candidate.isNew);
  if (newSellers.length > 1) {
    const weeklyOffset = Math.floor(now / (7 * DAY_IN_MS)) % newSellers.length;
    newSellers.push(...newSellers.splice(0, weeklyOffset));
  }

  const ordered: typeof candidates = [];
  let establishedIndex = 0;
  let newSellerIndex = 0;
  while (establishedIndex < established.length || newSellerIndex < newSellers.length) {
    if (newSellerIndex < newSellers.length) ordered.push(newSellers[newSellerIndex++]);
    for (let slot = 0; slot < EXPLORATION_CADENCE - 1 && establishedIndex < established.length; slot += 1) {
      ordered.push(established[establishedIndex++]);
    }
  }
  return ordered.map(candidate => candidate.seller);
};

export const rankMarketplaceListings = (
  posts: ClothPost[],
  users: User[],
  events: DiscoveryEvent[],
  preferences: RecommendationPreferences,
  options: {
    search?: string;
    categoryId?: string;
    trendScores?: ReadonlyMap<string, { score: number; confidence: number }>;
    now?: number;
  } = {},
): ClothPost[] => {
  const now = options.now ?? Date.now();
  const userById = new Map(users.map(user => [user.id, user]));
  const postById = new Map(posts.map(post => [post.id, post]));
  const recentEvents = (preferences.enabled ? events : []).filter(event => {
    const timestamp = Date.parse(event.timestamp);
    return Number.isFinite(timestamp) && now - timestamp >= 0 && now - timestamp <= RECOMMENDATION_RETENTION_MS;
  });
  const interestByToken = new Map<string, number>();
  const listingSignals = new Map<string, number>();
  const exposureCounts = new Map<string, number>();
  const lastExposure = new Map<string, number>();
  const hiddenListings = new Set<string>();
  const weightedActivityCount = recentEvents.filter(event => event.eventType !== 'IMPRESSION').length;
  const activityNormalizer = 1 + Math.sqrt(weightedActivityCount) * 0.15;

  recentEvents.forEach(event => {
    if (event.eventType === 'IMPRESSION') {
      exposureCounts.set(event.itemId, (exposureCounts.get(event.itemId) || 0) + 1);
      const impressionTime = Date.parse(event.timestamp);
      lastExposure.set(event.itemId, Math.max(lastExposure.get(event.itemId) || 0, impressionTime));
    }
    const weight = PERSONAL_EVENT_WEIGHTS[event.eventType];
    const timestamp = Date.parse(event.timestamp);
    if (!weight || !Number.isFinite(timestamp)) return;
    const age = Math.max(0, now - timestamp);
    if (weight < 0 && age <= HIDE_RETENTION_MS) hiddenListings.add(event.itemId);
    const contribution = weight * Math.pow(2, -age / INTEREST_HALF_LIFE_MS) / activityNormalizer;
    listingSignals.set(event.itemId, (listingSignals.get(event.itemId) || 0) + contribution);

    const post = postById.get(event.itemId);
    const tokens = [
      ...(Array.isArray(event.tags) ? event.tags : post?.tags || []),
      event.categoryId || post?.categoryId || '',
      event.listingType || post?.listingType || '',
    ].map(normalizeToken).filter(Boolean);
    tokens.forEach(token => interestByToken.set(token, (interestByToken.get(token) || 0) + contribution / Math.max(tokens.length, 1)));
  });

  const preferredCategories = preferences.enabled ? preferences.categories.map(normalizeToken).filter(Boolean) : [];
  const preferredStyles = preferences.enabled ? preferences.styles.map(normalizeToken).filter(Boolean) : [];
  const parsedSearch = options.search ? parseMarketplaceSearch(options.search) : null;
  const searchTerms = (parsedSearch?.text || '').split(/\s+/).filter(term => term.length > 1);
  const candidates = posts.filter(post => {
    const seller = userById.get(post.authorId);
    const hasPricePreference = preferences.enabled
      && (preferences.minimumPrice !== null || preferences.maximumPrice !== null);
    const priceMin = post.priceMin ?? post.pricing?.basic ?? null;
    const priceMax = post.priceMax ?? priceMin;
    const priceCurrency = normalizeToken(post.currency || post.pricing?.currency || post.authorLocation?.currency || '');
    const withinPreferredPrice = !hasPricePreference || (priceMin !== null
      && Boolean(preferences.currency)
      && priceCurrency === normalizeToken(preferences.currency)
      && (preferences.minimumPrice === null || priceMax === null || priceMax >= preferences.minimumPrice)
      && (preferences.maximumPrice === null || priceMin <= preferences.maximumPrice));
    return !hiddenListings.has(post.id)
      && !seller?.isBlocked
      && !post.isBlocked
      && !post.deletedAt
      && (post.status === undefined || post.status === 'published')
      && (post.moderationStatus === undefined || post.moderationStatus === 'approved')
      && post.availability !== 'unavailable'
      && post.status !== 'sold_out'
      && withinPreferredPrice;
  }).map(post => {
    const tags = (Array.isArray(post.tags) ? post.tags : []).map(normalizeToken).filter(Boolean);
    const category = normalizeToken(post.categoryId || '');
    const listingType = normalizeToken(post.listingType || '');
    const allTokens = [...tags, category, listingType];
    const priceMin = post.priceMin ?? post.pricing?.basic ?? null;
    const priceMax = post.priceMax ?? priceMin;
    const priceCurrency = normalizeToken(post.currency || post.pricing?.currency || post.authorLocation?.currency || '');
    const priceMatches = priceMin !== null
      && Boolean(preferences.currency)
      && priceCurrency === normalizeToken(preferences.currency)
      && (preferences.minimumPrice === null || priceMax === null || priceMax >= preferences.minimumPrice)
      && (preferences.maximumPrice === null || priceMin <= preferences.maximumPrice);
    const explicitCategoryMatch = preferredCategories.some(value => value === category || value === listingType);
    const explicitStyleMatches = preferredStyles.filter(style =>
      allTokens.some(token => token.includes(style)) || `${post.title} ${post.description}`.toLowerCase().includes(style),
    ).length;
    const countryMatches = preferences.country
      && normalizeToken(post.authorLocation?.country || '') === normalizeToken(preferences.country);
    const stateMatches = preferences.state
      && normalizeToken(post.authorLocation?.state || '') === normalizeToken(preferences.state);
    const searchMatchCount = searchTerms.filter(term =>
      `${post.title} ${post.description} ${tags.join(' ')} ${post.authorName}`.toLowerCase().includes(term),
    ).length;
    const queryMatch = searchTerms.length ? searchMatchCount / searchTerms.length : 0;
    const chosenCategoryMatch = options.categoryId && category === normalizeToken(options.categoryId) ? 1 : 0;
    const preferenceMatches = (explicitCategoryMatch ? 0.4 : 0)
      + Math.min(0.35, explicitStyleMatches * 0.12)
      + (priceMatches && (preferences.minimumPrice !== null || preferences.maximumPrice !== null) ? 0.15 : 0)
      + (countryMatches ? 0.07 : 0)
      + (stateMatches ? 0.03 : 0);
    const learnedInterest = allTokens.reduce((sum, token) => sum + (interestByToken.get(token) || 0), 0);
    const positiveLearnedInterest = clamp01(Math.max(0, learnedInterest) / (Math.max(0, learnedInterest) + 3));
    const negativeLearnedInterest = clamp01(Math.max(0, -learnedInterest) / (Math.max(0, -learnedInterest) + 3));
    const directIntent = listingSignals.get(post.id) || 0;
    const personalRelevance = clamp01(
      Math.max(queryMatch, chosenCategoryMatch, preferenceMatches)
      + (preferences.enabled ? positiveLearnedInterest * 0.35 : 0)
      - negativeLearnedInterest * 0.5
      + clamp01(Math.max(0, directIntent) / (Math.max(0, directIntent) + 5)) * 0.25,
    );
    const exposurePenalty = Math.min(0.12, (exposureCounts.get(post.id) || 0) * 0.025)
      * Math.pow(2, -Math.max(0, now - (lastExposure.get(post.id) || now)) / (7 * DAY_IN_MS));
    const trend = options.trendScores?.get(post.id);
    const trendConfidence = trend?.confidence ?? 0;
    const trendScore = trend && trendConfidence >= 0.25 ? clamp01(Math.log1p(Math.max(0, trend.score)) / 8) : 0;
    const ageMs = Math.max(0, now - postTimestamp(post));
    const freshness = Math.exp(-ageMs / (30 * DAY_IN_MS));
    const listingRating = post.confidenceAdjustedRating === null || post.confidenceAdjustedRating === undefined
      ? 3.5
      : post.confidenceAdjustedRating;
    const sellerRating = post.sellerConfidenceAdjustedRating === null || post.sellerConfidenceAdjustedRating === undefined
      ? 3.5
      : post.sellerConfidenceAdjustedRating;
    const listingRatingQuality = clamp01(listingRating / 5);
    const sellerReputation = clamp01(sellerRating / 5);
    const score = RECOMMENDATION_WEIGHTS.personalRelevance * personalRelevance
      + RECOMMENDATION_WEIGHTS.recentTrend * trendScore
      + RECOMMENDATION_WEIGHTS.listingRating * listingRatingQuality
      + RECOMMENDATION_WEIGHTS.freshness * freshness
      + RECOMMENDATION_WEIGHTS.sellerReputation * sellerReputation
      - exposurePenalty
      + (parsedSearch?.termGroups.length
        ? getMarketplaceSearchRelevance(post, parsedSearch) * 100
        : 0);
    const reason = preferences.enabled && preferenceMatches > 0
      ? 'Matches your selected preferences'
      : countryMatches
        ? 'In your selected country'
        : trendScore > 0 && trendConfidence >= 0.5
          ? 'Recent marketplace interest'
          : (post.ratingCount || 0) >= 3 && listingRating >= 4
            ? 'Strong firsthand listing feedback'
            : (post.sellerReviewCount || 0) >= 3 && sellerRating >= 4
              ? 'Strong firsthand seller feedback'
          : ageMs <= 7 * DAY_IN_MS
            ? 'Recently published'
            : 'Marketplace discovery';

    return {
      post: { ...post, recommendationReason: reason },
      score,
      isRecent: ageMs <= 7 * DAY_IN_MS
        && Boolean(post.imageUrl?.trim())
        && Boolean(post.title?.trim())
        && Boolean(post.description?.trim()),
      sellerId: post.authorId,
      category: category || listingType,
      sponsored: post.isPromoted === true,
    };
  }).sort((a, b) => b.score - a.score
    || postTimestamp(b.post) - postTimestamp(a.post)
    || a.post.id.localeCompare(b.post.id));

  const organic = candidates.filter(candidate => !candidate.sponsored);
  const sponsored = candidates.filter(candidate => candidate.sponsored);
  const ordered: typeof candidates = [];
  const sellerPositions = new Map<string, number[]>();
  const categoryPositions = new Map<string, number[]>();
  const takeEligible = (pool: typeof candidates, allowRecentSlot: boolean): number => {
    let index = pool.findIndex((candidate, poolIndex) => {
      if (allowRecentSlot && !candidate.isRecent) return false;
      const recentSellerPositions = (sellerPositions.get(candidate.sellerId) || []).filter(position => ordered.length - position < 6);
      const recentCategoryPositions = (categoryPositions.get(candidate.category) || []).filter(position => ordered.length - position < 6);
      return recentSellerPositions.length < 2 && recentCategoryPositions.length < 3 && poolIndex >= 0;
    });
    if (index < 0 && pool.length && !allowRecentSlot) index = 0;
    if (index < 0) return -1;
    const [candidate] = pool.splice(index, 1);
    const position = ordered.length;
    ordered.push(candidate);
    sellerPositions.set(candidate.sellerId, [...(sellerPositions.get(candidate.sellerId) || []), position]);
    categoryPositions.set(candidate.category, [...(categoryPositions.get(candidate.category) || []), position]);
    return index;
  };

  while (organic.length || sponsored.length) {
    const before = ordered.length;
    if (ordered.length > 0 && ordered.length % 5 === 4 && organic.some(candidate => candidate.isRecent)) {
      if (takeEligible(organic, true) < 0) takeEligible(organic, false);
    } else {
      takeEligible(organic, false);
    }
    if (ordered.length % 5 === 0 && sponsored.length) takeEligible(sponsored, false);
    if (ordered.length === before) {
      if (organic.length) takeEligible(organic, false);
      else if (sponsored.length) takeEligible(sponsored, false);
    }
  }
  return ordered.map(candidate => candidate.post);
};

const postTimestamp = (post: ClothPost): number => {
  const timestamp = Date.parse(post.createdAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const rankTrendingPosts = (
  posts: ClothPost[],
  users: User[],
  events: DiscoveryEvent[],
  currentUserId: string | undefined,
  searchHistory: string[],
  now = Date.now(),
): ClothPost[] => {
  const userById = new Map(users.map(user => [user.id, user]));
  const postById = new Map(posts.map(post => [post.id, post]));
  const eventScores = new Map<string, number>();
  const personalTagScores = new Map<string, number>();
  const followedSellerIds = new Set(
    users.filter(user => currentUserId && user.followers?.includes(currentUserId)).map(user => user.id),
  );

  events.forEach(event => {
    const weight = EVENT_WEIGHTS[event.eventType];
    if (!weight) return;
    const timestamp = Date.parse(event.timestamp);
    if (!Number.isFinite(timestamp)) return;
    const ageMs = Math.max(0, now - timestamp);
    const recency = Math.exp(-ageMs / (7 * DAY_IN_MS));
    eventScores.set(event.itemId, (eventScores.get(event.itemId) || 0) + weight * recency);

    if (currentUserId && event.userId === currentUserId) {
      const post = postById.get(event.itemId);
      if (!post) return;
      const interestWeight = weight * Math.exp(-ageMs / (90 * DAY_IN_MS));
      (Array.isArray(post.tags) ? post.tags : []).forEach(tag => {
        const normalizedTag = tag.trim().toLowerCase();
        if (normalizedTag) personalTagScores.set(normalizedTag, (personalTagScores.get(normalizedTag) || 0) + interestWeight);
      });
    }
  });

  const searchTerms = searchHistory.map(term => term.trim().toLowerCase()).filter(Boolean);
  const scores = posts.map(post => {
    const author = userById.get(post.authorId);
    const ageMs = Math.max(0, now - postTimestamp(post));
    const tags = Array.isArray(post.tags) ? post.tags : [];
    const text = `${post.title} ${post.description} ${tags.join(' ')} ${post.authorName}`.toLowerCase();
    const personal = tags.reduce((score, tag) => score + (personalTagScores.get(tag.trim().toLowerCase()) || 0), 0)
      + searchTerms.reduce((score, term, index) => text.includes(term) ? score + Math.max(2, 10 - index) : score, 0);
    const feedScore = calculateFeedScore(post, author, now);
    const trendPulse = (eventScores.get(post.id) || 0) + (post.likes?.length || 0) * 2 + (post.saves?.length || 0) * 3 + (followedSellerIds.has(post.authorId) ? 25 : 0);

    return {
      post,
      trend: trendPulse,
      personal,
      freshness: Math.exp(-ageMs / (30 * DAY_IN_MS)),
      feedScore,
    };
  });

  const maxTrend = Math.max(1, ...scores.map(item => item.trend));
  const maxPersonal = Math.max(1, ...scores.map(item => item.personal));
  const maxFeedScore = Math.max(1, ...scores.map(item => item.feedScore));

  return scores
    .sort((a, b) => {
      const scoreA = 0.4 * (a.trend / maxTrend) + 0.3 * (a.personal / maxPersonal)
        + 0.18 * a.freshness + 0.12 * (a.feedScore / maxFeedScore);
      const scoreB = 0.4 * (b.trend / maxTrend) + 0.3 * (b.personal / maxPersonal)
        + 0.18 * b.freshness + 0.12 * (b.feedScore / maxFeedScore);
      return scoreB - scoreA
        || postTimestamp(b.post) - postTimestamp(a.post)
        || a.post.id.localeCompare(b.post.id);
    })
    .map(item => item.post);
};