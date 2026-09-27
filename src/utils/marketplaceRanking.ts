import { ClothPost, DiscoveryEvent, DiscoveryEventType, User } from '../types';

const EVENT_WEIGHTS: Record<DiscoveryEventType, number> = {
  VIEW: 1,
  LIKE: 5,
  SAVE: 7,
  SHARE: 6,
  ENQUIRY: 9,
  ADD_TO_CART: 10,
  PURCHASE: 14,
  RATING: 4,
};

const PRIOR_RATING = 3.5;
const PRIOR_RATING_COUNT = 5;
const DAY_IN_MS = 86_400_000;

export const getRatingQuality = (rating = 0, ratingCount = 0): number => {
  const validCount = Number.isFinite(ratingCount) ? Math.max(0, ratingCount) : 0;
  const validRating = Number.isFinite(rating) ? Math.min(5, Math.max(0, rating)) : 0;
  const posteriorRating = (validRating * validCount + PRIOR_RATING * PRIOR_RATING_COUNT) / (validCount + PRIOR_RATING_COUNT);
  return posteriorRating / 5;
};

export const calculateFeedScore = (
  post: ClothPost,
  seller?: User | null,
  now = Date.now(),
): number => {
  const ageMs = Math.max(0, now - postTimestamp(post));
  const likes = Array.isArray(post.likes) ? post.likes.length : 0;
  const saves = Array.isArray(post.saves) ? post.saves.length : 0;
  const ratingQuality = getRatingQuality(post.rating, post.ratingCount);
  const followers = Array.isArray(seller?.followers) ? seller.followers.length : 0;
  const sellerAgeDays = seller?.createdAt ? Math.max(0, (now - Date.parse(seller.createdAt)) / DAY_IN_MS) : 0;
  const profileReputation = Math.min(1, 0.35 + Math.min(followers / 200, 0.35) + Math.min(sellerAgeDays / 365, 0.3) + (seller?.isPromoted ? 0.1 : 0));
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
  const ratingSignal = Math.log1p(Math.max(0, post.ratingCount ?? 0)) * 9;

  const score = ratingQuality * 110
    + likesScore
    + savesScore
    + ratingSignal
    + profileReputation * 35
    + completionRate * 25
    + recencyBoost
    - duplicatePenalty
    - spamPenalty;

  return Number.isFinite(score) ? score : 0;
};

export const getTopTailors = (
  posts: ClothPost[],
  users: User[],
  currentUser?: User | null,
  now = Date.now(),
): User[] => {
  const sellers = users.filter(user => user.role === 'tailor' || user.role === 'fabric_seller');

  return sellers
    .map(seller => {
      const sellerPosts = posts.filter(post => post.authorId === seller.id);
      const averageRating = sellerPosts.length
        ? sellerPosts.reduce((sum, post) => sum + (validRating(post.rating) * Math.max(1, validRatingCount(post.ratingCount))), 0) / sellerPosts.length
        : 0;
      const engagement = sellerPosts.reduce((sum, post) => sum + (post.likes?.length || 0) * 2 + (post.saves?.length || 0) * 3 + (post.ratingCount || 0), 0);
      const localBoost = currentUser && seller.location?.city && currentUser.location?.city && seller.location.city.toLowerCase() === currentUser.location.city.toLowerCase() ? 24 : 0;
      const followedBoost = currentUser && Array.isArray(seller.followers) && seller.followers.includes(currentUser.id) ? 30 : 0;
      const promotedBoost = seller.isPromoted ? 16 : 0;
      const recencyBoost = sellerPosts.reduce((sum, post) => {
        const timestamp = Date.parse(post.createdAt);
        if (!Number.isFinite(timestamp)) return sum;
        const ageMs = Math.max(0, now - timestamp);
        return sum + Math.exp(-ageMs / (14 * DAY_IN_MS));
      }, 0) * 14;

      return {
        seller,
        score: engagement + averageRating * 32 + localBoost + followedBoost + promotedBoost + recencyBoost,
      };
    })
    .sort((a, b) => b.score - a.score)
    .map(item => item.seller);
};

const validRatingCount = (count: number | undefined): number =>
  Number.isFinite(count) ? Math.max(0, count || 0) : 0;

const validRating = (rating: number | undefined): number =>
  Number.isFinite(rating) ? Math.min(5, Math.max(0, rating || 0)) : 0;

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

  const sellerRatingTotals = new Map<string, { total: number; count: number }>();
  posts.forEach(post => {
    const current = sellerRatingTotals.get(post.authorId) || { total: 0, count: 0 };
    const count = validRatingCount(post.ratingCount);
    current.total += validRating(post.rating) * count;
    current.count += count;
    sellerRatingTotals.set(post.authorId, current);
  });

  const searchTerms = searchHistory.map(term => term.trim().toLowerCase()).filter(Boolean);
  const scores = posts.map(post => {
    const author = userById.get(post.authorId);
    const ageMs = Math.max(0, now - postTimestamp(post));
    const tags = Array.isArray(post.tags) ? post.tags : [];
    const text = `${post.title} ${post.description} ${tags.join(' ')} ${post.authorName}`.toLowerCase();
    const personal = tags.reduce((score, tag) => score + (personalTagScores.get(tag.trim().toLowerCase()) || 0), 0)
      + searchTerms.reduce((score, term, index) => text.includes(term) ? score + Math.max(2, 10 - index) : score, 0);
    const sellerRatings = sellerRatingTotals.get(post.authorId) || { total: 0, count: 0 };
    const sellerRating = sellerRatings.count ? sellerRatings.total / sellerRatings.count : 0;
    const followers = Array.isArray(author?.followers) ? author.followers.length : 0;
    const feedScore = calculateFeedScore(post, author, now);
    const trendPulse = (eventScores.get(post.id) || 0) + (post.likes?.length || 0) * 2 + (post.saves?.length || 0) * 3 + (followedSellerIds.has(post.authorId) ? 25 : 0);

    return {
      post,
      trend: trendPulse,
      personal,
      quality: getRatingQuality(post.rating, post.ratingCount),
      freshness: Math.exp(-ageMs / (30 * DAY_IN_MS)),
      feedScore,
      sellerReputation: Math.min(1, (sellerRating / 5) * 0.8 + Math.min(followers / 100, 1) * 0.2),
    };
  });

  const maxTrend = Math.max(1, ...scores.map(item => item.trend));
  const maxPersonal = Math.max(1, ...scores.map(item => item.personal));
  const maxFeedScore = Math.max(1, ...scores.map(item => item.feedScore));

  return scores
    .sort((a, b) => {
      const scoreA = 0.28 * (a.trend / maxTrend) + 0.2 * (a.personal / maxPersonal)
        + 0.18 * a.quality + 0.12 * a.freshness + 0.12 * a.sellerReputation + 0.1 * (a.feedScore / maxFeedScore);
      const scoreB = 0.28 * (b.trend / maxTrend) + 0.2 * (b.personal / maxPersonal)
        + 0.18 * b.quality + 0.12 * b.freshness + 0.12 * b.sellerReputation + 0.1 * (b.feedScore / maxFeedScore);
      return scoreB - scoreA
        || postTimestamp(b.post) - postTimestamp(a.post)
        || a.post.id.localeCompare(b.post.id);
    })
    .map(item => item.post);
};