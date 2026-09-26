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

    return {
      post,
      trend: (eventScores.get(post.id) || 0)
        + (post.likes?.length || 0) * 2
        + (post.saves?.length || 0) * 3
        + (followedSellerIds.has(post.authorId) ? 25 : 0),
      personal,
      quality: getRatingQuality(post.rating, post.ratingCount),
      freshness: Math.exp(-ageMs / (30 * DAY_IN_MS)),
      sellerReputation: Math.min(1, (sellerRating / 5) * 0.8 + Math.min(followers / 100, 1) * 0.2),
    };
  });

  const maxTrend = Math.max(1, ...scores.map(item => item.trend));
  const maxPersonal = Math.max(1, ...scores.map(item => item.personal));

  return scores
    .sort((a, b) => {
      const scoreA = 0.3 * (a.trend / maxTrend) + 0.25 * (a.personal / maxPersonal)
        + 0.2 * a.quality + 0.15 * a.freshness + 0.1 * a.sellerReputation;
      const scoreB = 0.3 * (b.trend / maxTrend) + 0.25 * (b.personal / maxPersonal)
        + 0.2 * b.quality + 0.15 * b.freshness + 0.1 * b.sellerReputation;
      return scoreB - scoreA
        || postTimestamp(b.post) - postTimestamp(a.post)
        || a.post.id.localeCompare(b.post.id);
    })
    .map(item => item.post);
};