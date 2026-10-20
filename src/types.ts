export type UserRole = 'tailor' | 'fabric_seller' | 'buyer' | 'admin';

export interface UserLocation {
  country: string;
  countryCode?: string;
  currency?: string;
  state: string;
  city: string;
  lat?: number;
  lng?: number;
}

export interface PricingBreakdown {
  currency?: string;
  basic: number;
  premiumMaterial: number;
  bespokeComplexity: number;
}

export type ListingType = 'CLOTHING' | 'FABRIC' | 'TAILOR_PORTFOLIO';
export type ListingStatus = 'draft' | 'pending_review' | 'published' | 'rejected' | 'paused' | 'sold_out' | 'archived';
export type ListingModerationStatus = 'pending' | 'approved' | 'rejected';

export interface ListingImageAsset {
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  mimeType?: string;
}

export interface FabricListingDetails {
  material?: string;
  colour?: string;
  pattern?: string;
  width?: number;
  widthUnit?: 'cm' | 'in';
  priceUnit?: 'yard' | 'metre' | 'piece' | 'roll';
  minimumOrder?: number;
}

export interface ClothingListingDetails {
  garmentType?: string;
  gender?: string;
  sizes?: string[];
  customizationOptions?: string[];
  leadTimeDays?: number;
  fulfilment?: 'ready_made' | 'made_to_order';
}

export interface Listing {
  id: string;
  sellerId?: string;
  listingType?: ListingType;
  title: string;
  description: string;
  categoryId?: string;
  tags: string[];
  priceMin?: number | null;
  priceMax?: number | null;
  currency?: string;
  location?: UserLocation;
  imageAssets?: ListingImageAsset[];
  status?: ListingStatus;
  createdAt: string;
  updatedAt?: string;
  publishedAt?: string | null;
  stockQuantity?: number | null;
  availability?: 'available' | 'made_to_order' | 'limited' | 'unavailable';
  moderationStatus?: ListingModerationStatus;
  moderationNote?: string;
  listingDetails?: FabricListingDetails | ClothingListingDetails;
  deletedAt?: string | null;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone: string;
  passwordHash?: string;
  countryCode: string;
  location: UserLocation;
  whatsappNumber?: string;
  shopName?: string;
  bio?: string;
  handle: string;
  avatarUrl?: string;
  isPromoted: boolean;
  isBlocked: boolean;
  isWarned?: boolean;
  warningNote?: string;
  followers: string[]; // User IDs of followers
  createdAt: string;
  isSuperAdmin?: boolean;
  addedByEmail?: string;
}

export interface SavedPhoto {
  id: string;
  url: string;
  title: string;
  savedAt: string;
  postId?: string;
}

export interface SellerCollection {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  imageUrls: string[];
  createdAt: string;
}

export interface ClothPost extends Listing {
  authorId: string;
  authorName: string;
  authorRole: 'tailor' | 'fabric_seller';
  authorHandle: string;
  authorAvatar?: string;
  authorLocation: UserLocation;
  authorWhatsapp?: string;
  isPromoted: boolean;
  isBlocked?: boolean;
  pricing: PricingBreakdown;
  imageUrl: string;
  imageAlt?: string;
  imageHostSource?: string;
  likes: string[]; // User IDs who liked
  saves: string[]; // User IDs who saved picture
  rating?: number;
  ratingCount?: number;
  confidenceAdjustedRating?: number | null;
  sellerRating?: number;
  sellerReviewCount?: number;
  sellerConfidenceAdjustedRating?: number | null;
  likeCount?: number;
  saveCount?: number;
  trendScore?: number;
  trendConfidence?: number;
  recommendationReason?: string;
  searchLocationMatch?: boolean;
  searchLocationHint?: string;
}

export type MarketplaceFeedView = 'all' | 'clothing' | 'fabrics' | 'tailors' | 'for-you';
export type MarketplaceSort = 'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'rating' | 'popularity';

export interface MarketplaceFeedQuery {
  view: MarketplaceFeedView;
  sort: MarketplaceSort;
  search?: string;
  categoryId?: string;
  tag?: string;
  country?: string;
  state?: string;
  city?: string;
  minimumPrice?: number;
  maximumPrice?: number;
  currency?: string;
  material?: string;
  colour?: string;
  size?: string;
  fulfilment?: 'ready_made' | 'made_to_order';
  availability?: 'available' | 'made_to_order' | 'limited';
  cursor?: string;
  limit?: number;
}

export interface MarketplaceFeedPage {
  items: ClothPost[];
  nextCursor: string | null;
  hasMore: boolean;
}

export type MarketplaceTrendCategory =
  | 'TRENDING_NOW'
  | 'RISING'
  | 'POPULAR'
  | 'NEW_NOTICED'
  | 'HIGHLY_RATED'
  | 'MOST_VIEWED';

export type MarketplaceTrendEventType = 'IMPRESSION' | 'VIEW' | 'SHARE' | 'ENQUIRY' | 'HIDE';

export interface MarketplaceTrendingPage {
  items: ClothPost[];
  category: MarketplaceTrendCategory;
  scopeType: 'global' | 'region' | 'category' | 'style';
  scopeValue: string;
  fallback: boolean;
  fallbackMessage: string | null;
  computedAt: string | null;
}

export interface MarketplaceTrendingQuery {
  category: MarketplaceTrendCategory;
  scopeType?: 'global' | 'region' | 'category' | 'style';
  scopeValue?: string;
  limit?: number;
}

export type MarketplaceReviewType = 'listing' | 'seller';
export type MarketplaceReviewModerationStatus = 'pending' | 'published' | 'rejected' | 'removed';

export interface MarketplaceReview {
  id: string;
  reviewType: MarketplaceReviewType;
  reviewerId: string;
  reviewer?: { id: string; name: string; avatarUrl?: string };
  sellerId: string;
  listingId?: string | null;
  rating: number;
  categoryBreakdown: Record<string, number>;
  reviewText: string;
  evidenceAssets: ListingImageAsset[];
  verificationStatus: 'unverified';
  eligibilityType: 'firsthand_attestation';
  moderationStatus: MarketplaceReviewModerationStatus;
  moderationNote?: string;
  createdAt: string;
  updatedAt: string;
  sellerResponse?: string;
  sellerRespondedAt?: string;
  helpfulCount: number;
  viewerFoundHelpful: boolean;
}

export interface MarketplaceReviewSummary {
  rawAverage: number;
  eligibleReviewCount: number;
  ratingDistribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  confidenceAdjustedRating: number | null;
  priorMean: number;
  priorStrength: number;
  baselineScope: string;
  configVersion: string;
}

export interface MarketplaceReviewsPage {
  summary: MarketplaceReviewSummary;
  reviews: MarketplaceReview[];
  hasMore: boolean;
  nextCursor: string | null;
  ownReview: MarketplaceReview | null;
  reviewSubmissionsEnabled?: boolean;
}

export interface MarketplaceReviewQueueItem {
  id: string;
  reviewType: MarketplaceReviewType;
  queueType?: 'appeal' | 'report';
  targetId?: string;
  reviewerId?: string;
  reporterId?: string;
  reviewer?: { id: string; name?: string; email?: string };
  reporter?: { id: string; name?: string; email?: string };
  seller?: { id: string; name?: string; shopName?: string };
  listing?: { id: string; title?: string };
  review?: { id: string; rating?: number; reviewText?: string; listing?: { id: string; title?: string } } | null;
  rating?: number;
  reviewText?: string;
  moderationStatus?: MarketplaceReviewModerationStatus;
  reason?: string;
  details?: string;
  createdAt: string;
  reviewId?: string;
  status?: string;
}

export interface ListingReport {
  id: string;
  listingId: string;
  reporterId: string;
  reason: string;
  details: string;
  status: 'open' | 'reviewed' | 'dismissed';
  createdAt: string;
  listing?: { title?: string };
  reporter?: { name?: string; email?: string };
}

export interface MarketplaceAbuseFlag {
  id: number;
  action: string;
  flagType: string;
  severity: 'low' | 'medium' | 'high';
  actorId?: string | null;
  targetId?: string | null;
  signalHash?: string | null;
  evidence: Record<string, unknown>;
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  resolutionNote?: string;
  createdAt: string;
}

export type DiscoveryEventType = 'VIEW' | 'LIKE' | 'SAVE' | 'SHARE' | 'ENQUIRY';
export type RecommendationEventType = DiscoveryEventType | 'IMPRESSION' | 'HIDE' | 'DISMISS' | 'NOT_INTERESTED';

export interface DiscoveryEvent {
  userId?: string;
  itemId: string;
  eventType: RecommendationEventType;
  timestamp: string;
  sessionId: string;
  categoryId?: string;
  listingType?: ListingType;
  tags?: string[];
  recommendationReason?: string;
}

export interface RecommendationPreferences {
  enabled: boolean;
  categories: string[];
  styles: string[];
  minimumPrice: number | null;
  maximumPrice: number | null;
  currency: string;
  country: string;
  state: string;
}

export interface AdminPromoPlan {
  id: string;
  caption: string;
  timeRange: string;
  description: string;
  amount: number;
  currency?: string;
  whatsappNumber: string;
  badgeLabel: string;
  accentColor: string;
  isActive: boolean;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  recipientId: string;
  recipientName: string;
  postId?: string;
  postTitle?: string;
  content: string;
  timestamp: string;
  isRead: boolean;
  type?: 'chat' | 'general';
}

export type FabricRequestStatus = 'new' | 'reviewed' | 'quoted' | 'closed';

export interface FabricRequest {
  id: string;
  postId: string;
  postTitle: string;
  postImageUrl: string;
  sellerId: string;
  sellerName: string;
  sellerRole: 'tailor' | 'fabric_seller';
  buyerId: string;
  buyerName: string;
  buyerEmail: string;
  quantity: number;
  quantityUnit: 'yards' | 'meters' | 'pieces';
  preferredColor?: string;
  budget?: number;
  currency: string;
  deliveryLocation: string;
  neededBy?: string;
  notes: string;
  status: FabricRequestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BroadcastMessage {
  id: string;
  sender: string;
  target: 'all' | 'sellers' | 'buyers';
  title: string;
  body: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: 'follow' | 'like' | 'message' | 'system';
  createdAt: string;
  isRead: boolean;
  actionUrl?: string;
}

export interface CountryGeo {
  name: string;
  code: string;
  dialCode: string;
  flag: string;
  currency?: string;
  states: {
    code?: string;
    name: string;
    cities: string[];
  }[];
  lat: number;
  lng: number;
}

export interface LocationCountry {
  name: string;
  code: string;
  dialCode: string;
  flag: string;
  currency: string | null;
}

export interface LocationRegion {
  code: string;
  name: string;
}

export interface LocationCity {
  name: string;
  latitude?: number;
  longitude?: number;
}

export interface LocationCurrency {
  code: string;
  name: string;
}
