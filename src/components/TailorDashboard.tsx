import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scissors, Sparkles, Upload, Image as ImageIcon, Share2, Star, AlertTriangle, CheckCircle, Trash2, Heart, Bookmark, Phone, MessageSquare, DollarSign, Tag, Clock, Pause, Archive, RotateCcw, Camera } from 'lucide-react';
import { User, ClothPost, AdminPromoPlan, FabricRequest, ListingImageAsset, ListingType } from '../types';
import { compressAndGenerateImageLink, ProcessedImageResult } from '../utils/imageProgram';
import { storageService } from '../services/storage';
import { api } from '../services/api';
import { getProfileInitials, getRoleLabel } from '../utils/profile';
import { safeCustomerErrorMessage } from '../utils/customerMessages';
import { PostImage } from './PostImage';

interface TailorDashboardProps {
  currentUser: User;
  initialStudioTab?: 'overview' | 'posts' | 'plans';
  posts: ClothPost[];
  promoPlans: AdminPromoPlan[];
  onOpenSocialShare: (handle: string, name: string) => void;
  onOpenImage: (src: string, alt: string) => void;
  isDarkMode: boolean;
}

export const TailorDashboard: React.FC<TailorDashboardProps> = ({
  currentUser,
  posts,
  promoPlans,
  onOpenSocialShare,
  onOpenImage,
  isDarkMode,
  initialStudioTab,
}) => {
  const [promotionLocations, setPromotionLocations] = useState(Array.isArray(currentUser.promotionTargeting?.locations) ? currentUser.promotionTargeting.locations.join(', ') : '');
  const [promotionCategories, setPromotionCategories] = useState(Array.isArray(currentUser.promotionTargeting?.categories) ? currentUser.promotionTargeting.categories.join(', ') : '');
  const [promotionAudiences, setPromotionAudiences] = useState<Array<'Men' | 'Women' | 'Children'>>(
    Array.isArray(currentUser.promotionTargeting?.audiences) ? currentUser.promotionTargeting.audiences : ['Men', 'Women'],
  );
  const targetingObjective = currentUser.promotionTargeting?.objective;
  const [promotionObjective, setPromotionObjective] = useState<'Profile visits' | 'Project views' | 'Enquiries'>(
    targetingObjective === 'Profile visits' || targetingObjective === 'Project views' || targetingObjective === 'Enquiries'
      ? targetingObjective
      : 'Profile visits',
  );
  const [targetingStatus, setTargetingStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [paymentLoadingPlan, setPaymentLoadingPlan] = useState('');

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref');
    if (!window.location.pathname.startsWith('/premium/verify') || !reference) return;
    setPaymentStatus('Verifying your payment...');
    api.verifyPaystackPayment(reference)
      .then(result => {
        setPaymentStatus(result.status === 'successful' ? 'Payment successful. Your promotion is active.' : 'Payment is still processing. Please check again shortly.');
      })
      .catch(() => setPaymentStatus('Payment verification is not complete yet. Please check your payment history.'));
  }, []);

  const startPaystackPayment = async (planId: string) => {
    const planKey = { 'promo-1': 'starter', 'promo-2': 'professional', 'promo-3': 'premium' }[planId] || '';
    if (!planKey) return;
    setPaymentLoadingPlan(planId);
    setPaymentStatus('');
    try {
      const result = await api.initializePaystackPayment(planKey);
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setPaymentStatus(safeCustomerErrorMessage(error, 'Payment could not be started. Please try again.'));
    } finally {
      setPaymentLoadingPlan('');
    }
  };

  const savePromotionTargeting = async () => {
    const targeting = {
      locations: promotionLocations.split(',').map(value => value.trim()).filter(Boolean),
      categories: promotionCategories.split(',').map(value => value.trim()).filter(Boolean),
      audiences: promotionAudiences,
      objective: promotionObjective,
    };
    try {
      await api.saveProfile({ promotionTargeting: targeting });
      storageService.updateUser(currentUser.id, { promotionTargeting: targeting });
      setTargetingStatus('Promotion targeting saved.');
    } catch (error) {
      setTargetingStatus(safeCustomerErrorMessage(error, "Promotion targeting couldn't be saved."));
    }
  };

  // Post Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [pricingBasic, setPricingBasic] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [stockQuantity, setStockQuantity] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [listingType, setListingType] = useState<ListingType>(currentUser.role === 'fabric_seller' ? 'FABRIC' : 'CLOTHING');
  const [fabricMaterial, setFabricMaterial] = useState('');
  const [fabricColour, setFabricColour] = useState('');
  const [fabricPattern, setFabricPattern] = useState('');
  const [fabricWidth, setFabricWidth] = useState('');
  const [fabricWidthUnit, setFabricWidthUnit] = useState<'cm' | 'in'>('cm');
  const [fabricPriceUnit, setFabricPriceUnit] = useState<'yard' | 'metre' | 'piece' | 'roll'>('yard');
  const [fabricMinimumOrder, setFabricMinimumOrder] = useState('1');
  const [garmentType, setGarmentType] = useState('');
  const [garmentGender, setGarmentGender] = useState('');
  const [garmentSizes, setGarmentSizes] = useState('');
  const [customizationOptions, setCustomizationOptions] = useState('');
  const [leadTimeDays, setLeadTimeDays] = useState('');
  const [fulfilment, setFulfilment] = useState<'ready_made' | 'made_to_order'>('ready_made');
  const [editingListingId, setEditingListingId] = useState<string | null>(null);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const currentAvatarUrl = currentUser.avatarUrl && failedAvatarUrl !== currentUser.avatarUrl ? currentUser.avatarUrl : null;
  const [sellerListings, setSellerListings] = useState<ClothPost[]>(() => posts.filter(post => post.authorId === currentUser.id));
  const [imageAssets, setImageAssets] = useState<ListingImageAsset[]>([]);

  const TAG_OPTIONS = ['Menwear', 'Womenwear', 'Commercial', 'Formal', 'Bridal', 'Casual', 'Streetwear', 'Fabrics'];

  const normalizeTags = (rawTags: string): string[] => {
    const normalized = rawTags
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);

    const matchTag = (value: string) => {
      const lowered = value.toLowerCase();
      if (lowered.includes('men') || lowered.includes('male')) return 'Menwear';
      if (lowered.includes('women') || lowered.includes('female')) return 'Womenwear';
      if (lowered.includes('commercial') || lowered.includes('retail')) return 'Commercial';
      if (lowered.includes('formal') || lowered.includes('occasion')) return 'Formal';
      if (lowered.includes('bridal') || lowered.includes('wedding')) return 'Bridal';
      if (lowered.includes('casual') || lowered.includes('everyday')) return 'Casual';
      if (lowered.includes('street') || lowered.includes('urban')) return 'Streetwear';
      if (lowered.includes('fabric') || lowered.includes('textile') || lowered.includes('cloth')) return 'Fabrics';

      const directMatch = TAG_OPTIONS.find(option => option.toLowerCase() === lowered);
      return directMatch || null;
    };

    const result: string[] = [];
    normalized.forEach(tag => {
      const mapped = matchTag(tag);
      const cleanTag = mapped || tag;
      if (!result.some(existing => existing.toLowerCase() === cleanTag.toLowerCase())) result.push(cleanTag);
    });

    return result.slice(0, 20);
  };
  const toggleTag = (tag: string) => {
    setTagsInput(previous => {
      const tags = previous.split(',').map(item => item.trim()).filter(Boolean);
      const selectedIndex = tags.findIndex(item => item.toLowerCase() === tag.toLowerCase());
      if (selectedIndex >= 0) tags.splice(selectedIndex, 1);
      else tags.push(tag);
      return tags.join(', ');
    });
  };
  // Image Program State
  const [imageUrl, setImageUrl] = useState('');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);
  const [compressionStats, setCompressionStats] = useState<ProcessedImageResult | null>(null);
  const [postStatus, setPostStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [fabricRequests, setFabricRequests] = useState<FabricRequest[]>([]);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const warningNoticeKey = `fabsattire-dismissed-warning:${currentUser.id}:${encodeURIComponent(currentUser.warningNote || '')}`;
  const [warningModalOpen, setWarningModalOpen] = useState(() => (
    Boolean(currentUser.isWarned && currentUser.warningNote)
    && localStorage.getItem(warningNoticeKey) !== 'dismissed'
  ));
  const [activeStudioTab, setActiveStudioTab] = useState<'overview' | 'posts' | 'plans'>(initialStudioTab || 'overview');
  useEffect(() => {
    if (initialStudioTab) setActiveStudioTab(initialStudioTab);
  }, [initialStudioTab]);
  const resetPostForm = () => {
    setTitle('');
    setDescription('');
    setImageAlt('');
    setTagsInput('');
    setImageUrl('');
    setImageAssets([]);
    setCompressionStats(null);
    setPricingBasic('');
    setPriceMax('');
    setStockQuantity('');
    setCategoryId('');
    setListingType(currentUser.role === 'fabric_seller' ? 'FABRIC' : 'CLOTHING');
    setFabricMaterial('');
    setFabricColour('');
    setFabricPattern('');
    setFabricWidth('');
    setFabricWidthUnit('cm');
    setFabricPriceUnit('yard');
    setFabricMinimumOrder('1');
    setGarmentType('');
    setGarmentGender('');
    setGarmentSizes('');
    setCustomizationOptions('');
    setLeadTimeDays('');
    setFulfilment('ready_made');
    setEditingListingId(null);
  };
  // Filter posts belonging to this tailor/seller
  const myPosts = sellerListings.filter(p => p.authorId === currentUser.id && !p.deletedAt).map(post => ({
    ...post,
    likes: Array.isArray(post.likes) ? post.likes : [],
    saves: Array.isArray(post.saves) ? post.saves : [],
    tags: Array.isArray(post.tags) ? post.tags : [],
  }));
  const totalLikes = myPosts.reduce((acc, p) => acc + p.likes.length, 0);
  const totalSaves = myPosts.reduce((acc, p) => acc + p.saves.length, 0);
  const followerCount = Array.isArray(currentUser.followers) ? currentUser.followers.length : 0;

  React.useEffect(() => {
    setSellerListings(posts.filter(post => post.authorId === currentUser.id));
    void api.getMyListings().then(setSellerListings).catch(() => undefined);
  }, [currentUser.id]);

  React.useEffect(() => {
    setListingType(currentUser.role === 'fabric_seller' ? 'FABRIC' : 'CLOTHING');
  }, [currentUser.role]);

  const acknowledgeWarning = async () => {
    const cleared = storageService.updateUser(currentUser.id, { isWarned: false, warningNote: '' });
    if (cleared) window.dispatchEvent(new CustomEvent('atelier_auth_changed', { detail: cleared }));
    localStorage.removeItem(warningNoticeKey);
    setWarningModalOpen(false);
    await api.saveProfile({ isWarned: false, warningNote: '' }).catch(() => undefined);
  };

  React.useEffect(() => {
    setWarningModalOpen(
      Boolean(currentUser.isWarned && currentUser.warningNote)
      && localStorage.getItem(warningNoticeKey) !== 'dismissed',
    );
  }, [currentUser.isWarned, currentUser.warningNote, warningNoticeKey]);

  React.useEffect(() => {
    const loadRequests = async () => {
      const cached = storageService.getFabricRequests().filter((request: FabricRequest) => request.sellerId === currentUser.id);
      setFabricRequests(cached);
      try {
        const remote = await api.getFabricRequests();
        const incoming = remote.filter(request => request.sellerId === currentUser.id);
        setFabricRequests(incoming);
        storageService.saveFabricRequests([
          ...incoming,
          ...storageService.getFabricRequests().filter((request: FabricRequest) => !incoming.some((item: FabricRequest) => item.id === request.id)),
        ]);
      } catch {
        // Local cache keeps the studio usable when the API is unavailable.
      }
    };
    void loadRequests();
    const handleRequestsUpdated = () => setFabricRequests(storageService.getFabricRequests().filter(request => request.sellerId === currentUser.id));
    window.addEventListener('atelier_requests_updated', handleRequestsUpdated);
    return () => window.removeEventListener('atelier_requests_updated', handleRequestsUpdated);
  }, [currentUser.id]);

  const updateRequestStatus = async (request: FabricRequest, status: FabricRequest['status']) => {
    try {
      const updated = await api.updateFabricRequestStatus(request.id, status);
      storageService.saveFabricRequests(storageService.getFabricRequests().map(item => item.id === updated.id ? updated : item));
      setRequestStatus('Request status updated.');
    } catch {
      storageService.updateFabricRequestStatus(request.id, status);
      setRequestStatus('Request saved locally and will sync when the API is available.');
    }
  };

  // Handle file upload through Image Link Program
  const processImageUpload = async (files: File[]) => {
    if (!files.length) return;

    setIsProcessingImage(true);
    setImageUploadProgress(0);
    setPostStatus(null);
    try {
      if (files.length > 1) throw new Error('A standard post can include one photo. Add multiple photos to a collection instead.');
      let lastCompression: ProcessedImageResult | null = null;
      const file = files[0];
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
        throw new Error('Choose JPEG, PNG, WebP, or GIF images.');
      }
      if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name} exceeds the 8 MB image limit.`);
      const result = await compressAndGenerateImageLink(file);
      if (!result.blob) throw new Error('Please sign in again before uploading an image.');
      const uploadedAsset = await api.uploadListingImage(result.blob, `${Date.now()}-${file.name}`, setImageUploadProgress);
      URL.revokeObjectURL(result.url);
      lastCompression = result;
      setImageAssets([uploadedAsset]);
      setImageUrl(uploadedAsset.url);
      setCompressionStats(lastCompression);
    } catch (err: any) {
      setPostStatus({
        type: 'error',
        message: safeCustomerErrorMessage(err, "We couldn't prepare this image. Please try another file.")
      });
    } finally {
      setIsProcessingImage(false);
    }
  };
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await processImageUpload(Array.from(e.target.files || []));
    e.target.value = '';
  };

  // Submit Post
  const handlePublishPost = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPostStatus(null);
    const intent = new FormData(e.currentTarget).get('intent') === 'draft' ? 'draft' : 'publish';

    if (currentUser.isBlocked) {
      setPostStatus({
        type: 'error',
        message: 'Your account has been restricted by an administrator. Posting is disabled.'
      });
      return;
    }

    if (!imageUrl.trim() || imageAssets.length === 0) {
      setPostStatus({ type: 'error', message: 'Add at least one product photo before continuing.' });
      return;
    }

    const tags = normalizeTags(tagsInput);
    if (tags.length === 0) {
      setPostStatus({ type: 'error', message: 'Choose or add at least one tag.' });
      return;
    }

    const postTitle = (title.trim() || `${tags[0]} by ${currentUser.shopName || currentUser.name}`).slice(0, 160);

    const details = listingType === 'FABRIC'
      ? {
          material: fabricMaterial.trim(),
          colour: fabricColour.trim(),
          pattern: fabricPattern,
          width: fabricWidth ? Number(fabricWidth) : null,
          widthUnit: fabricWidthUnit,
          priceUnit: fabricPriceUnit || 'piece',
          minimumOrder: Number(fabricMinimumOrder) || 1,
        }
      : {
          garmentType: garmentType.trim() || postTitle,
          gender: garmentGender,
          sizes: garmentSizes.split(',').map(size => size.trim()).filter(Boolean),
          customizationOptions: customizationOptions.split(',').map(option => option.trim()).filter(Boolean),
          leadTimeDays: leadTimeDays ? Number(leadTimeDays) : null,
          fulfilment,
        };
    const postData = {
      authorId: currentUser.id,
      authorName: currentUser.shopName || currentUser.name,
      authorRole: (currentUser.role === 'fabric_seller' ? 'fabric_seller' : 'tailor') as 'tailor' | 'fabric_seller',
      authorHandle: currentUser.handle,
      authorAvatar: currentUser.avatarUrl,
      authorLocation: currentUser.location,
      authorWhatsapp: currentUser.whatsappNumber,
      isPromoted: currentUser.isPromoted,
      title: postTitle,
      description: description.trim(),
      listingType,
      categoryId,
      currency: currentUser.location.currency || 'USD',
      imageAssets,
      stockQuantity: stockQuantity ? Number(stockQuantity) : null,
      availability: listingType === 'FABRIC' ? 'available' as const : fulfilment === 'made_to_order' ? 'made_to_order' as const : 'available' as const,
      priceMin: pricingBasic === '' ? null : Number(pricingBasic),
      priceMax: priceMax === '' ? null : Number(priceMax),
      listingDetails: details,
      tags,
      pricing: {
        currency: currentUser.location.currency || 'USD',
        basic: Number(pricingBasic) || 0,
        premiumMaterial: 0,
        bespokeComplexity: 0,
      },
      imageUrl: imageUrl.trim(),
      imageAlt: imageAlt.trim() || `${postTitle} by ${currentUser.shopName || currentUser.name}`,
      imageHostSource: compressionStats ? `Supabase Storage (${compressionStats.compressedSizeKb}KB)` : 'External Link'
    };

    try {
      const createdPost = editingListingId
        ? await api.updateListing(editingListingId, { ...postData, intent })
        : await api.createPost({ ...postData, intent });
      const cachedPosts = storageService.getPosts();
      const normalizedPost = {
        ...(cachedPosts.find(item => item.id === createdPost.id) || {}),
        ...createdPost,
        ...postData,
        id: createdPost.id,
        authorId: currentUser.id,
        authorRole: currentUser.role,
        likes: createdPost.likes || [],
        saves: createdPost.saves || [],
        rating: createdPost.rating || 0,
        ratingCount: createdPost.ratingCount || 0,
      } as ClothPost;
      storageService.savePosts([normalizedPost, ...cachedPosts.filter(item => item.id !== createdPost.id)]);
      setSellerListings(current => [normalizedPost, ...current.filter(item => item.id !== normalizedPost.id)]);
    } catch (error) {
      setPostStatus({ type: 'error', message: safeCustomerErrorMessage(error, "We couldn't publish this listing. Please try again.") });
      return;
    }

    setPostStatus({ type: 'success', message: intent === 'draft' ? 'Draft saved. It is visible only in your studio.' : 'Listing submitted for review and will appear in the marketplace after approval.' });
    resetPostForm();
  };

  // Delete Post
  const handleDeletePost = async (postId: string) => {
    if (!window.confirm('Are you sure you want to remove this bespoke design?')) return;

    const cachedPosts = storageService.getPosts();
    storageService.deletePost(postId, currentUser.id, false);

    try {
      await api.deletePost(postId);
      setSellerListings(current => current.filter(post => post.id !== postId));
      setPostStatus({ type: 'success', message: 'Post removed from the marketplace.' });
    } catch (error) {
      if (cachedPosts.some(post => post.id === postId)) storageService.savePosts(cachedPosts);
      setPostStatus({ type: 'error', message: safeCustomerErrorMessage(error, "We couldn't delete this listing. Please try again.") });
    }
  };

  const editListing = (post: ClothPost) => {
    const details = post.listingDetails || {};
    setEditingListingId(post.id);
    setListingType(post.listingType || (currentUser.role === 'fabric_seller' ? 'FABRIC' : 'CLOTHING'));
    setTitle(post.title);
    setDescription(post.description);
    setImageAlt(post.imageAlt || '');
    setTagsInput(post.tags.join(', '));
    setImageUrl(post.imageUrl);
    const coverImage = post.imageAssets?.find(asset => asset.url === post.imageUrl) || post.imageAssets?.[0];
    setImageAssets(coverImage ? [coverImage] : []);
    const legacyPrice = Number(post.pricing?.basic);
    setPricingBasic(post.priceMin === null || post.priceMin === undefined
      ? legacyPrice > 0 ? String(legacyPrice) : ''
      : String(post.priceMin));
    setPriceMax(post.priceMax === null || post.priceMax === undefined ? '' : String(post.priceMax));
    setStockQuantity(post.stockQuantity === null || post.stockQuantity === undefined ? '' : String(post.stockQuantity));
    setCategoryId(post.categoryId || '');
    setFabricMaterial('material' in details ? details.material || '' : '');
    setFabricColour('colour' in details ? details.colour || '' : '');
    setFabricPattern('pattern' in details ? details.pattern || '' : '');
    setFabricWidth('width' in details && details.width ? String(details.width) : '');
    setFabricWidthUnit('widthUnit' in details && details.widthUnit === 'in' ? 'in' : 'cm');
    setFabricPriceUnit('priceUnit' in details && details.priceUnit ? details.priceUnit : 'yard');
    setFabricMinimumOrder('minimumOrder' in details && details.minimumOrder ? String(details.minimumOrder) : '1');
    setGarmentType('garmentType' in details ? details.garmentType || '' : '');
    setGarmentGender('gender' in details ? details.gender || '' : '');
    setGarmentSizes('sizes' in details && Array.isArray(details.sizes) ? details.sizes.join(', ') : '');
    setCustomizationOptions('customizationOptions' in details && Array.isArray(details.customizationOptions) ? details.customizationOptions.join(', ') : '');
    setLeadTimeDays('leadTimeDays' in details && details.leadTimeDays ? String(details.leadTimeDays) : '');
    setFulfilment('fulfilment' in details && details.fulfilment === 'made_to_order' ? 'made_to_order' : 'ready_made');
    setActiveStudioTab('posts');
    setPostStatus(null);
    document.getElementById('listing-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const changeListingStatus = async (post: ClothPost, action: 'publish' | 'pause' | 'archive' | 'sold_out') => {
    try {
      const updated = await api.setListingStatus(post.id, action);
      const next = { ...post, ...updated, id: post.id } as ClothPost;
      setSellerListings(current => current.map(item => item.id === post.id ? next : item));
      storageService.savePosts(storageService.getPosts().map(item => item.id === post.id ? next : item));
      const message = action === 'publish' ? 'Listing submitted for moderation.'
        : action === 'sold_out' ? 'Listing marked sold out.'
          : `Listing ${action === 'pause' ? 'paused' : 'archived'}.`;
      setPostStatus({ type: 'success', message });
    } catch (error) {
      setPostStatus({ type: 'error', message: safeCustomerErrorMessage(error, "We couldn't update this listing. Please try again.") });
    }
  };

  return (
    <div className="relative z-10 flex w-full flex-col px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      <AnimatePresence>
        {warningModalOpen && currentUser.isWarned && currentUser.warningNote && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 14 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 10 }}
              className="w-full max-w-lg rounded-[28px] border border-red-500/30 bg-[#121316] p-5 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-300">Studio notice</p>
                  <h2 className="mt-2 text-2xl font-serif font-bold text-white">Important account message</h2>
                </div>
                <button type="button" onClick={() => {
                  localStorage.setItem(warningNoticeKey, 'dismissed');
                  setWarningModalOpen(false);
                }} className="rounded-full border border-white/10 p-2 text-neutral-400 transition hover:text-white" aria-label="Close notice">
                  <AlertTriangle className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm leading-7 text-red-100">
                {currentUser.warningNote}
              </div>

              <div className="mt-5 flex justify-end">
                <button type="button" onClick={() => void acknowledgeWarning()} className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-400">
                  I have read this
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Studio Header & Stats Banner */}
      <div className={`p-6 rounded-3xl border transition-all ${
        isDarkMode
          ? 'bg-gradient-to-br from-amber-500/10 via-[#121316] to-[#0c0d10] border-amber-500/30'
          : 'bg-gradient-to-br from-amber-50 via-white to-neutral-50 border-amber-300 shadow-sm'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 border border-amber-300/60 flex items-center justify-center font-serif text-2xl font-bold text-neutral-950 overflow-hidden">
                {currentAvatarUrl ? <img src={currentAvatarUrl} alt={currentUser.name} onError={() => setFailedAvatarUrl(currentAvatarUrl)} className="h-full w-full object-cover" /> : getProfileInitials(currentUser.name)}
              </div>
              {currentUser.isPromoted && (
                <div
                  title="Promoted Atelier"
                  className="absolute -bottom-2 -right-2 px-1.5 py-0.5 rounded-full bg-amber-400 text-neutral-950 text-[10px] font-bold shadow flex items-center gap-0.5"
                >
                  <Star className="w-3 h-3 fill-neutral-950" />
                  <span>VIP</span>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-serif font-bold">
                  {currentUser.name}
                </h1>
                {currentUser.isPromoted && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    ★ Promoted Atelier
                  </span>
                )}
              </div>

              <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-400">{getRoleLabel(currentUser.role)}</div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-400 mt-1 font-mono">
                <span className="text-amber-400 font-semibold">{currentUser.handle}</span>
                <span>•</span>
                <span>{[currentUser.location.city, currentUser.location.state, currentUser.location.country].filter(Boolean).join(', ')}</span>
                <span>•</span>
                <span>{currentUser.role === 'fabric_seller' ? 'Fabric Merchant' : 'Master Tailor'}</span>
              </div>

              {currentUser.bio && (
                <p className={`text-xs mt-2 italic max-w-xl ${isDarkMode ? 'text-neutral-300' : 'text-neutral-600'}`}>
                  "{currentUser.bio}"
                </p>
              )}
            </div>
          </div>

          {/* Social Share & Engagement Action */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => onOpenSocialShare(currentUser.handle, currentUser.shopName || currentUser.name)}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-neutral-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:shadow-lg hover:shadow-amber-500/20 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>Share Studio Handle</span>
            </button>
          </div>
        </div>

        {/* Real-time Metrics Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-amber-500/20">
          <div className="p-3 rounded-xl bg-neutral-900/40 border border-neutral-800">
            <span className="text-[10px] uppercase tracking-wider text-neutral-400 block font-mono">Followers</span>
                <span className="text-2xl font-serif font-bold text-amber-400">{followerCount}</span>
          </div>
          <div className="p-3 rounded-xl bg-neutral-900/40 border border-neutral-800">
            <span className="text-[10px] uppercase tracking-wider text-neutral-400 block font-mono">Total Likes</span>
            <span className="text-2xl font-serif font-bold text-red-400">{totalLikes}</span>
          </div>
          <div className="p-3 rounded-xl bg-neutral-900/40 border border-neutral-800">
            <span className="text-[10px] uppercase tracking-wider text-neutral-400 block font-mono">Client Saves</span>
            <span className="text-2xl font-serif font-bold text-purple-400">{totalSaves}</span>
          </div>
          <div className="p-3 rounded-xl bg-neutral-900/40 border border-neutral-800">
            <span className="text-[10px] uppercase tracking-wider text-neutral-400 block font-mono">Live Posts</span>
            <span className="text-2xl font-serif font-bold text-emerald-400">{myPosts.length}</span>
          </div>
        </div>
      </div>

      {/* Blocked Account Notice */}
      {currentUser.isBlocked && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/40 text-red-300 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
          <div className="text-xs">
            <strong className="font-semibold block text-sm mb-1">Account Posting Restricted</strong>
            Your studio account has been blocked by an administrator. You can still view client inquiries, but publishing new items to the marketplace is disabled.
          </div>
        </div>
      )}

      <section className={`rounded-3xl border p-6 ${isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white shadow-sm'}`}>
        <div className="flex flex-col gap-2 border-b border-neutral-800/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-amber-400" /><h2 className="text-xl font-serif font-bold">Client requests</h2></div>
            <p className={`mt-1 text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>Every request arrives with the quantity, delivery details, and buyer notes attached.</p>
          </div>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">{fabricRequests.filter(request => request.status === 'new').length} new</span>
        </div>
        {requestStatus && <p className="mt-3 text-xs text-emerald-400">{requestStatus}</p>}
        {fabricRequests.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-500">No client requests yet. New structured inquiries will appear here.</div>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {fabricRequests.map(request => (
              <article key={request.id} className={`overflow-hidden rounded-2xl border ${isDarkMode ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-50'}`}>
                <div className="flex gap-3 p-4">
                  <img src={request.postImageUrl} alt="" className="h-16 w-16 rounded-xl bg-neutral-950 object-contain" />
                  <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-semibold">{request.postTitle}</h3><span className="rounded-full border border-amber-500/30 px-2 py-0.5 text-[9px] uppercase tracking-wider text-amber-300">{request.status}</span></div><p className="mt-1 text-xs text-neutral-400">From {request.buyerName} · {request.buyerEmail}</p><p className="mt-1 text-xs text-neutral-300">{request.quantity} {request.quantityUnit}{request.preferredColor ? ` · ${request.preferredColor}` : ''}{request.budget ? ` · Budget ${request.currency} ${request.budget}` : ''}</p></div>
                </div>
                <div className="grid gap-2 border-t border-neutral-800/60 px-4 py-3 text-xs text-neutral-400 sm:grid-cols-2"><span>Deliver to: <strong className="font-medium text-neutral-200">{request.deliveryLocation}</strong></span><span>Needed by: <strong className="font-medium text-neutral-200">{request.neededBy || 'Flexible'}</strong></span></div>
                {request.notes && <p className="border-t border-neutral-800/60 px-4 py-3 text-xs leading-relaxed text-neutral-300">{request.notes}</p>}
                <div className="flex flex-wrap gap-2 border-t border-neutral-800/60 px-4 py-3"><button type="button" onClick={() => updateRequestStatus(request, 'reviewed')} className="rounded-lg border border-neutral-700 px-2.5 py-1.5 text-[10px] font-semibold hover:border-amber-500 hover:text-amber-300">Mark reviewed</button><button type="button" onClick={() => updateRequestStatus(request, 'quoted')} className="rounded-lg border border-emerald-500/40 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/10">Quoted</button><button type="button" onClick={() => updateRequestStatus(request, 'closed')} className="rounded-lg border border-neutral-700 px-2.5 py-1.5 text-[10px] font-semibold hover:border-neutral-500">Close</button></div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className={`rounded-3xl border p-4 sm:p-5 ${isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white shadow-sm'}`}>
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800/80 pb-4">
          {[
            { key: 'overview', label: 'Studio Overview' },
            { key: 'posts', label: 'My Posts' },
            { key: 'plans', label: 'Promotion Plans' },
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveStudioTab(tab.key as 'overview' | 'posts' | 'plans')}
              className={`rounded-full px-3.5 py-2 text-xs font-semibold transition-all ${
                activeStudioTab === tab.key
                  ? 'bg-amber-500 text-neutral-950 shadow-lg shadow-amber-500/20'
                  : isDarkMode
                    ? 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeStudioTab === 'overview' && (
          <div className="grid gap-4 pt-4 lg:grid-cols-2">
            <div className={`rounded-2xl border p-5 ${isDarkMode ? 'border-neutral-800 bg-neutral-900/50' : 'border-neutral-200 bg-neutral-50'}`}>
              <div className="flex items-center gap-2 text-amber-400">
                <Sparkles className="h-4 w-4" />
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em]">Quick actions</h3>
              </div>
              <div className="mt-4 space-y-3">
                <button type="button" onClick={() => setActiveStudioTab('posts')} className="flex w-full items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-left text-sm font-medium text-amber-200">
                  <span>Publish a new post</span>
                  <Scissors className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('navigate_to_tab', { detail: { view: 'marketplace', openStoryComposer: true } }))} className="flex w-full items-center justify-between rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-3 text-left text-sm font-medium text-orange-200">
                  <span>Post a story</span>
                  <Camera className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setActiveStudioTab('plans')} className="flex w-full items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-left text-sm font-medium text-emerald-200">
                  <span>View promotion plans</span>
                  <DollarSign className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className={`rounded-2xl border p-5 ${isDarkMode ? 'border-neutral-800 bg-neutral-900/50' : 'border-neutral-200 bg-neutral-50'}`}>
              <div className="flex items-center gap-2 text-amber-400">
                <MessageSquare className="h-4 w-4" />
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em]">Studio health</h3>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-neutral-700/60 bg-neutral-900/50 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-400">Requests</div>
                  <div className="mt-2 text-lg font-bold text-amber-300">{fabricRequests.filter(req => req.status === 'new').length}</div>
                </div>
                <div className="rounded-xl border border-neutral-700/60 bg-neutral-900/50 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-400">Posts</div>
                  <div className="mt-2 text-lg font-bold text-emerald-300">{myPosts.length}</div>
                </div>
                <div className="rounded-xl border border-neutral-700/60 bg-neutral-900/50 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-400">Likes</div>
                  <div className="mt-2 text-lg font-bold text-red-300">{totalLikes}</div>
                </div>
                <div className="rounded-xl border border-neutral-700/60 bg-neutral-900/50 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-400">Saves</div>
                  <div className="mt-2 text-lg font-bold text-purple-300">{totalSaves}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeStudioTab === 'posts' && (
          <div className="space-y-6 pt-4">
            <section className={`-mx-8 border-y px-4 py-5 transition-colors sm:mx-0 sm:rounded-3xl sm:border sm:p-6 ${isDarkMode ? 'bg-[#121316] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
              <div className="mb-5 flex items-center justify-between gap-3 border-b border-neutral-800/80 pb-4">
                <div className="flex min-w-0 items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                  <Scissors className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-serif font-bold">{currentUser.role === 'fabric_seller' ? 'List Fabric Material' : 'Publish Garment Post'}</h2>
                  <p className={`text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>Upload a photo, add tags, and publish.</p>
                </div>
                </div>
              </div>

              <AnimatePresence>
                {postStatus && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className={`p-3.5 rounded-xl text-xs flex items-center gap-2 mb-6 ${postStatus.type === 'success' ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300' : 'bg-red-500/15 border border-red-500/40 text-red-300'}`}>
                    {postStatus.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    <span>{postStatus.message}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <form id="listing-editor" onSubmit={handlePublishPost} className="space-y-5">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <div className="space-y-4">
                    <label className="block text-xs font-medium text-neutral-400">{listingType === 'FABRIC' ? 'Fabric photo *' : 'Post photo *'}</label>
                    <div
                      className="rounded-2xl border-2 border-dashed border-neutral-700 bg-neutral-900/30 p-6 text-center transition-all hover:border-amber-500/60"
                      onDragOver={event => event.preventDefault()}
                      onDrop={event => { event.preventDefault(); void processImageUpload(Array.from(event.dataTransfer.files)); }}
                    >
                      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" id="tailor-file-input" disabled={currentUser.isBlocked || isProcessingImage} onChange={handleFileUpload} className="hidden" />
                      <label htmlFor="tailor-file-input" className="flex cursor-pointer flex-col items-center justify-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400"><ImageIcon className="h-6 w-6" /></div>
                        <span className="text-xs font-semibold text-neutral-200">{isProcessingImage ? `Uploading ${imageUploadProgress}%…` : imageUrl ? 'Choose a different photo' : 'Choose a photo'}</span>
                        <span className="mt-1 text-[10px] text-neutral-500">JPEG, PNG, WebP, or GIF · up to 8 MB</span>
                      </label>
                      {isProcessingImage && <div className="mx-auto mt-3 max-w-sm"><div className="h-1.5 overflow-hidden rounded-full bg-neutral-800"><div className="h-full rounded-full bg-amber-400 transition-[width]" style={{ width: `${imageUploadProgress}%` }} /></div><p className="mt-1 text-[10px] text-amber-300">{imageUploadProgress}% uploaded</p></div>}
                    </div>
                    {imageUrl && <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-neutral-900">
                      <PostImage src={imageAssets.find(asset => asset.url === imageUrl)?.thumbnailUrl || imageUrl} alt={title || 'Selected post photo'} className="aspect-[4/3] w-full" />
                      <button type="button" onClick={() => { setImageAssets([]); setImageUrl(''); }} aria-label="Remove selected photo" className="absolute right-3 top-3 rounded-full bg-black/75 px-3 py-1.5 text-xs font-semibold text-white">Remove</button>
                    </div>}
                  </div>
                  <div className="space-y-5">
                    <label className="block text-xs font-medium text-neutral-400">Cloth / item name <span className="text-neutral-500">(optional)</span>
                      <input type="text" minLength={3} maxLength={160} disabled={currentUser.isBlocked} value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Indigo linen dress" className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-800/40 px-4 py-3 text-base text-neutral-100 focus:border-amber-500 focus:outline-none" />
                    </label>
                    <div>
                      <label htmlFor="post-tags" className="block text-xs font-medium text-neutral-400">Tags <span className="text-amber-400">*</span></label>
                      <input id="post-tags" type="text" disabled={currentUser.isBlocked} value={tagsInput} onChange={event => setTagsInput(event.target.value)} placeholder="Choose tags or add your own, separated by commas" className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-800/40 px-4 py-3 text-base text-neutral-100 focus:border-amber-500 focus:outline-none" />
                      <div className="mt-3 flex flex-wrap gap-2">
                        {TAG_OPTIONS.map(tag => {
                          const selected = normalizeTags(tagsInput).some(value => value.toLowerCase() === tag.toLowerCase());
                          return <button key={tag} type="button" aria-pressed={selected} onClick={() => toggleTag(tag)} className={`rounded-full border px-3 py-2 text-xs font-medium transition ${selected ? 'border-amber-400 bg-amber-400 text-neutral-950' : 'border-neutral-700 bg-neutral-800/60 text-neutral-300 hover:border-amber-500 hover:text-amber-300'}`}>{selected ? '✓ ' : '+ '}{tag}</button>;
                        })}
                      </div>
                      <p className="mt-2 text-[10px] text-neutral-500">Add one or more tags to help shoppers discover your post.</p>
                    </div>
                    {imageUrl && <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-amber-300">{listingType.replace('_', ' ')}</span>
                      <span className="truncate text-xs text-neutral-400">{title.trim() || normalizeTags(tagsInput)[0] || 'Your post'}</span>
                    </div>}
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-800 pt-4">
                  {editingListingId && <button type="button" onClick={() => { resetPostForm(); setPostStatus(null); }} className="rounded-xl border border-neutral-700 px-4 py-3 text-xs font-semibold">Cancel edit</button>}
                  <button type="submit" name="intent" value="draft" disabled={currentUser.isBlocked || isProcessingImage} className="rounded-xl border border-neutral-600 px-4 py-3 text-xs font-semibold disabled:opacity-50">Save draft</button>
                  <button type="submit" name="intent" value="publish" disabled={currentUser.isBlocked || isProcessingImage} className="rounded-xl bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-950 transition-all hover:shadow-lg hover:shadow-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50">{editingListingId ? 'Submit changes for review' : 'Publish post'}</button>
                </div>
              </form>
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-serif font-bold">My listings ({myPosts.length})</h2>
              </div>
              {myPosts.length === 0 ? (
                <div className="rounded-2xl border border-neutral-800/60 bg-neutral-900/20 p-8 text-center text-xs text-neutral-400">You have not published any garments yet. Use the form above to post your first bespoke creation.</div>
              ) : (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {myPosts.map(post => (
                    <div key={post.id} className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40">
                      <div className="relative aspect-4/3 overflow-hidden bg-neutral-900">
                        <button
                          type="button"
                          data-open-image-on-click
                          onClick={() => onOpenImage(post.imageUrl, post.title || 'Seller post')}
                          aria-label={`View ${post.title || 'post image'} full screen`}
                          className="absolute inset-0 z-10 h-full w-full cursor-zoom-in"
                        >
                          <PostImage src={post.imageUrl} alt={post.title} className="h-full w-full" imageClassName="brightness-110 saturate-110" referrerPolicy="no-referrer" />
                        </button>
                        <button type="button" onClick={() => handleDeletePost(post.id)} title="Delete post" className="absolute right-2 top-2 z-20 rounded-lg bg-black/70 p-1.5 text-white transition-colors hover:bg-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="space-y-2 p-4">
                        <div className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-amber-300">{(post.status || 'published').replace('_', ' ')}{post.moderationStatus === 'pending' ? ' · moderation pending' : ''}</div>
                        {post.moderationStatus === 'rejected' && post.moderationNote && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[10px] text-red-300">Review feedback: {post.moderationNote}</p>}
                        <h3 className="font-serif text-base font-bold leading-tight">{post.title}</h3>
                        <p className="text-xs text-neutral-400 line-clamp-2">{post.description || post.tags.slice(0, 3).map(tag => `#${tag}`).join(' ') || 'No description added.'}</p>
                        <div className="flex items-center justify-between border-t border-neutral-800 pt-2 text-xs font-mono text-neutral-400">
                          <span>{post.likes.length} Likes</span>
                          <span>{post.saves.length} Saves</span>
                          <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 border-t border-neutral-800 p-3">
                          <button type="button" onClick={() => editListing(post)} className="rounded-lg border border-neutral-700 px-3 py-1.5 text-[10px] font-semibold">Edit</button>
                          {(post.status === 'draft' || post.status === 'rejected' || post.status === 'paused' || post.status === 'archived') && <button type="button" onClick={() => void changeListingStatus(post, 'publish')} className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-[10px] font-semibold text-amber-300">Submit for review</button>}
                          {post.status === 'published' && <button type="button" onClick={() => void changeListingStatus(post, 'pause')} className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 px-3 py-1.5 text-[10px] font-semibold"><Pause className="h-3 w-3" />Pause</button>}
                          {post.status === 'published' && <button type="button" onClick={() => void changeListingStatus(post, 'sold_out')} className="rounded-lg border border-neutral-700 px-3 py-1.5 text-[10px] font-semibold">Sold out</button>}
                          {post.status !== 'archived' && <button type="button" onClick={() => void changeListingStatus(post, 'archive')} className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 px-3 py-1.5 text-[10px] font-semibold"><Archive className="h-3 w-3" />Archive</button>}
                          {post.status === 'sold_out' && <button type="button" onClick={() => void changeListingStatus(post, 'publish')} className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 px-3 py-1.5 text-[10px] font-semibold"><RotateCcw className="h-3 w-3" />Relist</button>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {activeStudioTab === 'plans' && (
          <section className="space-y-4 pt-4">
            <div className="flex items-center justify-between pb-2">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  <h2 className="text-xl font-serif font-bold">Get More Eyes on Your Atelier</h2>
                </div>
                <p className={`mt-1 text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>Choose how long you want the same premium promotion package to work for your business.</p>
              </div>
            </div>
            {currentUser.isPromoted && currentUser.promotionExpiresAt && (
              <div className={`rounded-xl border px-4 py-3 text-sm ${isDarkMode ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
                Promoted until {new Date(currentUser.promotionExpiresAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {promoPlans.map(plan => (
                <div key={plan.id} className={`flex flex-col justify-between overflow-hidden rounded-2xl border p-6 transition-all ${isDarkMode ? 'border-neutral-800 bg-[#121316] hover:border-amber-500/50 shadow-md' : 'border-neutral-200 bg-white shadow-sm hover:border-amber-500/50'}`}>
                  <div>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white" style={{ backgroundColor: plan.accentColor || '#d97706' }}>{plan.badgeLabel}</span>
                      <span className="flex items-center gap-1 text-xs text-neutral-400 font-mono"><Clock className="h-3 w-3 text-amber-500" />{plan.timeRange}</span>
                    </div>
                    <h3 className="mb-2 text-xl font-serif font-bold">Promoted Tailor Visibility</h3>
                    <ul className={`mb-4 space-y-2 text-xs leading-relaxed ${isDarkMode ? 'text-neutral-300' : 'text-neutral-600'}`}>
                      <li>• Promoted listings appear more frequently in marketplace discovery.</li>
                      <li>• Your atelier portrait appears in the promoted-tailors rail on the marketplace.</li>
                      <li>• A “Promoted” badge on your listings and tailor profile.</li>
                      <li>• Access to share 24-hour photo and video stories.</li>
                      <li>• Up to 10 collection slots, plus any slots you purchase.</li>
                    </ul>
                  </div>

                  <div className="border-t border-neutral-800/80 pt-4">
                    <button
                      type="button"
                      onClick={() => startPaystackPayment(plan.id)}
                      disabled={Boolean(paymentLoadingPlan)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-60"
                    >
                      {paymentLoadingPlan === plan.id ? 'Opening secure checkout...' : `Pay securely — ₦${plan.id === 'promo-1' ? '5,000' : plan.id === 'promo-2' ? '25,000' : '50,000'}`}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {paymentStatus && (
              <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${isDarkMode ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-emerald-300 bg-emerald-50 text-emerald-800'}`}>
                {paymentStatus}
              </div>
            )}
            {currentUser.isPromoted && (
              <div className={`mt-6 rounded-2xl border p-5 ${isDarkMode ? 'border-amber-500/25 bg-amber-500/[0.05]' : 'border-amber-300 bg-amber-50'}`}>
                <h3 className="font-serif text-xl font-bold">Promotion targeting</h3>
                <p className="mt-1 text-xs text-neutral-500">Choose who should see your featured profile and project placements.</p>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="text-xs font-semibold">Locations
                    <input value={promotionLocations} onChange={event => setPromotionLocations(event.target.value)} placeholder="Aba, Lagos, Abuja" className="mt-2 w-full rounded-xl border border-neutral-700 bg-transparent px-3 py-3 text-sm outline-none focus:border-amber-400" />
                  </label>
                  <label className="text-xs font-semibold">Fashion categories
                    <input value={promotionCategories} onChange={event => setPromotionCategories(event.target.value)} placeholder="Suits, Agbada, Wedding" className="mt-2 w-full rounded-xl border border-neutral-700 bg-transparent px-3 py-3 text-sm outline-none focus:border-amber-400" />
                  </label>
                  <fieldset>
                    <legend className="text-xs font-semibold">Audience</legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(['Men', 'Women', 'Children'] as const).map(audience => (
                        <button key={audience} type="button" onClick={() => setPromotionAudiences(current => current.includes(audience) ? current.filter(value => value !== audience) : [...current, audience])} className={`rounded-full border px-3 py-2 text-xs font-semibold ${promotionAudiences.includes(audience) ? 'border-amber-400 bg-amber-400 text-neutral-950' : 'border-neutral-700 text-neutral-400'}`}>{audience}</button>
                      ))}
                    </div>
                  </fieldset>
                  <label className="text-xs font-semibold">Campaign objective
                    <select value={promotionObjective} onChange={event => setPromotionObjective(event.target.value as typeof promotionObjective)} className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-3 text-sm outline-none focus:border-amber-400">
                      <option>Profile visits</option>
                      <option>Project views</option>
                      <option>Enquiries</option>
                    </select>
                  </label>
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => void savePromotionTargeting()} className="rounded-xl bg-amber-400 px-5 py-3 text-xs font-bold text-neutral-950 hover:bg-amber-300">Save targeting</button>
                  {targetingStatus && <span className="text-xs text-neutral-400">{targetingStatus}</span>}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};
