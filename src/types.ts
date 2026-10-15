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
  pricing: PricingBreakdown;
  imageUrl: string;
  imageAlt?: string;
  imageHostSource?: string;
  likes: string[]; // User IDs who liked
  saves: string[]; // User IDs who saved picture
  rating?: number;
  ratingCount?: number;
  ratingsByUser?: Record<string, number>;
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

export type DiscoveryEventType = 'VIEW' | 'LIKE' | 'SAVE' | 'SHARE' | 'ENQUIRY' | 'ADD_TO_CART' | 'PURCHASE' | 'RATING';

export interface DiscoveryEvent {
  userId?: string;
  itemId: string;
  eventType: DiscoveryEventType;
  timestamp: string;
  sessionId: string;
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
