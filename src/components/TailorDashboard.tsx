import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scissors, Sparkles, Upload, Image as ImageIcon, Share2, Star, AlertTriangle, CheckCircle, Trash2, Heart, Bookmark, Phone, MessageSquare, DollarSign, Tag, Clock, Eye, Pause, Archive, RotateCcw } from 'lucide-react';
import { User, ClothPost, AdminPromoPlan, FabricRequest, ListingImageAsset, ListingType } from '../types';
import { compressAndGenerateImageLink, ProcessedImageResult } from '../utils/imageProgram';
import { storageService } from '../services/storage';
import { api } from '../services/api';
import { getProfileInitials, getRoleLabel } from '../utils/profile';

interface TailorDashboardProps {
  currentUser: User;
  posts: ClothPost[];
  promoPlans: AdminPromoPlan[];
  onOpenSocialShare: (handle: string, name: string) => void;
  isDarkMode: boolean;
}

export const TailorDashboard: React.FC<TailorDashboardProps> = ({
  currentUser,
  posts,
  promoPlans,
  onOpenSocialShare,
  isDarkMode
}) => {
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
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [sellerListings, setSellerListings] = useState<ClothPost[]>(() => posts.filter(post => post.authorId === currentUser.id));
  const [imageAssets, setImageAssets] = useState<ListingImageAsset[]>([]);

  const TAG_OPTIONS = ['Menwear', 'Womenwear', 'Commercial', 'Formal', 'Bridal', 'Casual', 'Streetwear', 'Fabrics'];

  const normalizeTags = (rawTags: string): string[] => {
    const normalized = rawTags
      .split(',')
      .map(tag => tag.trim().toLowerCase())
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
      if (mapped && !result.includes(mapped)) {
        result.push(mapped);
      }
    });

    return result.slice(0, 4);
  };

  // Image Program State
  const [imageUrl, setImageUrl] = useState('');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [compressionStats, setCompressionStats] = useState<ProcessedImageResult | null>(null);
  const [postStatus, setPostStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [fabricRequests, setFabricRequests] = useState<FabricRequest[]>([]);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [warningModalOpen, setWarningModalOpen] = useState(Boolean(currentUser.isWarned && currentUser.warningNote));
  const [activeStudioTab, setActiveStudioTab] = useState<'overview' | 'posts' | 'plans'>('overview');

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
    setWarningModalOpen(false);
    await api.saveProfile({ isWarned: false, warningNote: '' }).catch(() => undefined);
  };

  React.useEffect(() => {
    setWarningModalOpen(Boolean(currentUser.isWarned && currentUser.warningNote));
  }, [currentUser.isWarned, currentUser.warningNote]);

  React.useEffect(() => {
    const loadRequests = async () => {
      const cached = storageService.getFabricRequests().filter(request => request.sellerId === currentUser.id);
      setFabricRequests(cached);
      try {
        const remote = await api.getFabricRequests();
        const incoming = remote.filter(request => request.sellerId === currentUser.id);
        setFabricRequests(incoming);
        storageService.saveFabricRequests([
          ...incoming,
          ...storageService.getFabricRequests().filter(request => !incoming.some(item => item.id === request.id)),
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
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setIsProcessingImage(true);
    setPostStatus(null);
    try {
      const remainingSlots = 8 - imageAssets.length;
      if (files.length > remainingSlots) throw new Error(`You can add up to 8 images. ${remainingSlots} image slot(s) remain.`);
      const uploadedAssets: ListingImageAsset[] = [];
      let lastCompression: ProcessedImageResult | null = null;
      for (const file of files) {
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
          throw new Error('Choose JPEG, PNG, WebP, or GIF images.');
        }
        if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name} exceeds the 8 MB image limit.`);
        const result = await compressAndGenerateImageLink(file);
        if (!result.blob) throw new Error('Please sign in again before uploading an image.');
        uploadedAssets.push(await api.uploadListingImage(result.blob, `${Date.now()}-${file.name}`));
        URL.revokeObjectURL(result.url);
        lastCompression = result;
      }
      setImageAssets(current => [...current, ...uploadedAssets]);
      if ((imageAssets.length === 0 || !imageUrl) && uploadedAssets[0]) setImageUrl(uploadedAssets[0].url);
      setCompressionStats(lastCompression);
    } catch (err: any) {
      setPostStatus({
        type: 'error',
        message: err.message || 'Failed to process image through compression program.'
      });
    } finally {
      setIsProcessingImage(false);
    }
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

    if (!title.trim() || !imageUrl.trim() || imageAssets.length === 0) {
      setPostStatus({
        type: 'error',
        message: 'Please provide a post title and an image link or uploaded photo.'
      });
      return;
    }

    const tags = normalizeTags(tagsInput);

    const details = listingType === 'FABRIC'
      ? {
          material: fabricMaterial,
          colour: fabricColour,
          pattern: fabricPattern,
          width: fabricWidth ? Number(fabricWidth) : null,
          widthUnit: fabricWidthUnit,
          priceUnit: fabricPriceUnit,
          minimumOrder: Number(fabricMinimumOrder),
        }
      : {
          garmentType,
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
      title: title.trim(),
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
      tags: tags.length > 0 ? tags : [currentUser.role === 'fabric_seller' ? 'Fabrics' : 'Menwear'],
      pricing: {
        currency: currentUser.location.currency || 'USD',
        basic: Number(pricingBasic) || 0,
        premiumMaterial: 0,
        bespokeComplexity: 0,
      },
      imageUrl: imageUrl.trim(),
      imageAlt: imageAlt.trim() || `${title.trim()} by ${currentUser.shopName || currentUser.name}`,
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
      setPostStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to publish post.' });
      return;
    }

    setPostStatus({ type: 'success', message: intent === 'draft' ? 'Draft saved. It is visible only in your studio.' : 'Listing submitted for review and will appear in the marketplace after approval.' });
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
    setEditingListingId(null);
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
      setPostStatus({ type: 'error', message: error instanceof Error ? error.message : 'The post could not be deleted.' });
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
    setImageAssets(post.imageAssets || []);
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
      setPostStatus({ type: 'error', message: error instanceof Error ? error.message : 'The listing status could not be changed.' });
    }
  };

  return (
    <div className="relative z-10 flex w-full max-w-7xl flex-col mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      {isPreviewOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Listing preview">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-neutral-700 bg-[#121316] shadow-2xl">
            {imageUrl && <img src={imageAssets[0]?.thumbnailUrl || imageUrl} alt={imageAlt || title} className="max-h-[50vh] w-full bg-neutral-950 object-contain" />}
            <div className="space-y-3 p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400">{listingType.replace('_', ' ')}</div>
              <h2 className="font-serif text-2xl font-bold">{title || 'Listing title'}</h2>
              <p className="whitespace-pre-line text-sm text-neutral-300">{description || 'Listing description preview.'}</p>
              <div className="flex justify-between border-t border-neutral-700 pt-3 text-sm">
                <span>{currentUser.location.currency || 'USD'} {pricingBasic || 'Price on request'}{priceMax ? ` – ${priceMax}` : ''}</span>
                <span>{[currentUser.location.city, currentUser.location.country].filter(Boolean).join(', ')}</span>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setIsPreviewOpen(false)} className="rounded-lg border border-neutral-600 px-4 py-2 text-xs font-semibold">Close preview</button>
                <button type="button" onClick={() => setIsPreviewOpen(false)} className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-bold text-neutral-950">Continue editing</button>
              </div>
            </div>
          </div>
        </div>
      )}
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
                <button type="button" onClick={() => setWarningModalOpen(false)} className="rounded-full border border-white/10 p-2 text-neutral-400 transition hover:text-white" aria-label="Close notice">
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
                {currentUser.avatarUrl ? <img src={currentUser.avatarUrl} alt={currentUser.name} className="h-full w-full object-cover" /> : getProfileInitials(currentUser.name)}
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
            <section className={`p-5 sm:p-6 rounded-3xl border transition-colors ${isDarkMode ? 'bg-[#121316] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-neutral-800/80">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                  <Scissors className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-serif font-bold">{currentUser.role === 'fabric_seller' ? 'List Fabric Material' : 'Publish Garment Post'}</h2>
                  <p className={`text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>Add a clean, ready-to-buy listing with high-quality media and clear pricing.</p>
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

              <form id="listing-editor" onSubmit={handlePublishPost} className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-neutral-400">Listing type *</label>
                      <select value={listingType} disabled={currentUser.isBlocked || Boolean(editingListingId)} onChange={event => setListingType(event.target.value as ListingType)} className="w-full rounded-xl border border-neutral-700 bg-neutral-800/40 px-3.5 py-2.5 text-xs focus:border-amber-500 focus:outline-none">
                        {currentUser.role === 'fabric_seller'
                          ? <option value="FABRIC">Fabric</option>
                          : <><option value="CLOTHING">Clothing</option><option value="TAILOR_PORTFOLIO">Tailor portfolio</option></>}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-400 mb-1.5">Item Title *</label>
                      <input type="text" minLength={3} maxLength={160} required disabled={currentUser.isBlocked} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={currentUser.role === 'fabric_seller' ? 'e.g. Royal Italian 100% Cashmere Wool' : 'e.g. Double-Breasted Tuxedo'} className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-neutral-800/40 border border-neutral-700 focus:border-amber-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-400 mb-1.5">Description & Labeling *</label>
                      <textarea rows={3} minLength={10} maxLength={3000} required disabled={currentUser.isBlocked} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the fabric weave, fit silhouette, occasion, and turnaround time." className="w-full p-3 text-xs rounded-xl bg-neutral-800/40 border border-neutral-700 focus:border-amber-500 focus:outline-none" />
                    </div>
                    {listingType === 'FABRIC' ? (
                      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
                        <label className="text-xs text-neutral-400">Material *<input required value={fabricMaterial} onChange={event => setFabricMaterial(event.target.value)} maxLength={100} placeholder="Cotton, silk, wool…" className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-neutral-100" /></label>
                        <label className="text-xs text-neutral-400">Colour *<input required value={fabricColour} onChange={event => setFabricColour(event.target.value)} maxLength={80} placeholder="Navy blue" className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-neutral-100" /></label>
                        <label className="text-xs text-neutral-400">Pattern<input value={fabricPattern} onChange={event => setFabricPattern(event.target.value)} maxLength={100} placeholder="Plain, floral, plaid…" className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-neutral-100" /></label>
                        <label className="text-xs text-neutral-400">Width<input type="number" min="0.1" step="0.1" value={fabricWidth} onChange={event => setFabricWidth(event.target.value)} placeholder="Optional" className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-neutral-100" /></label>
                        <label className="text-xs text-neutral-400">Width unit<select value={fabricWidthUnit} onChange={event => setFabricWidthUnit(event.target.value as 'cm' | 'in')} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-neutral-100"><option value="cm">Centimetres</option><option value="in">Inches</option></select></label>
                        <label className="text-xs text-neutral-400">Price per *<select value={fabricPriceUnit} onChange={event => setFabricPriceUnit(event.target.value as 'yard' | 'metre' | 'piece' | 'roll')} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-neutral-100"><option value="yard">Yard</option><option value="metre">Metre</option><option value="piece">Piece</option><option value="roll">Roll</option></select></label>
                        <label className="col-span-2 text-xs text-neutral-400">Minimum order *<input type="number" required min="0.001" step="0.001" value={fabricMinimumOrder} onChange={event => setFabricMinimumOrder(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-neutral-100" /></label>
                      </div>
                    ) : listingType === 'CLOTHING' ? (
                      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
                        <label className="text-xs text-neutral-400">Garment type *<input required value={garmentType} onChange={event => setGarmentType(event.target.value)} maxLength={100} placeholder="Suit, dress, shirt…" className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-neutral-100" /></label>
                        <label className="text-xs text-neutral-400">Gender / style<input value={garmentGender} onChange={event => setGarmentGender(event.target.value)} maxLength={40} placeholder="Unisex, womenswear…" className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-neutral-100" /></label>
                        <label className="col-span-2 text-xs text-neutral-400">Sizes<input value={garmentSizes} onChange={event => setGarmentSizes(event.target.value)} placeholder="Separate sizes with commas: S, M, L" className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-neutral-100" /></label>
                        <label className="col-span-2 text-xs text-neutral-400">Customization options<input value={customizationOptions} onChange={event => setCustomizationOptions(event.target.value)} placeholder="Separate options with commas" className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-neutral-100" /></label>
                        <label className="text-xs text-neutral-400">Fulfilment<select value={fulfilment} onChange={event => setFulfilment(event.target.value as 'ready_made' | 'made_to_order')} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-neutral-100"><option value="ready_made">Ready-made</option><option value="made_to_order">Made to order</option></select></label>
                        <label className="text-xs text-neutral-400">Lead time (days)<input type="number" min="0" max="365" value={leadTimeDays} onChange={event => setLeadTimeDays(event.target.value)} placeholder="Optional" className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-neutral-100" /></label>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 text-xs text-neutral-400">Showcase a completed tailoring project in your portfolio. Include what was made, the techniques used, and any client-approved customization details.</div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-neutral-400 mb-1.5">Tags</label>
                      <input type="text" disabled={currentUser.isBlocked} value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="e.g. menwear, womenwear, formal, bridal" className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-neutral-800/40 border border-neutral-700 focus:border-amber-500 focus:outline-none" />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {TAG_OPTIONS.map(tag => (
                          <button key={tag} type="button" onClick={() => setTagsInput(prev => { const currentValues = prev.split(',').map(item => item.trim()).filter(Boolean); return currentValues.includes(tag) ? prev : `${prev ? `${prev}, ` : ''}${tag}`; })} className="rounded-full border border-neutral-700 bg-neutral-800/60 px-2.5 py-1 text-[10px] text-neutral-300 hover:border-amber-500 hover:text-amber-300">{tag}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-400 mb-1.5">Image Alt Description</label>
                      <input type="text" disabled={currentUser.isBlocked} value={imageAlt} onChange={(e) => setImageAlt(e.target.value)} placeholder="e.g. Tailored ivory wedding suit photographed in daylight on a neutral studio backdrop" className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-neutral-800/40 border border-neutral-700 focus:border-amber-500 focus:outline-none" />
                      <p className="mt-1 text-[10px] text-neutral-500">This helps screen readers and makes the collection more professional.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
                      <label className="text-xs font-semibold text-amber-400">Minimum price ({currentUser.location.currency || 'USD'})<input type="number" min="0" step="0.01" disabled={currentUser.isBlocked} value={pricingBasic} onChange={event => setPricingBasic(event.target.value)} placeholder="Optional" className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 font-mono text-xs text-neutral-100" /></label>
                      <label className="text-xs font-semibold text-amber-400">Maximum price<input type="number" min="0" step="0.01" disabled={currentUser.isBlocked} value={priceMax} onChange={event => setPriceMax(event.target.value)} placeholder="Optional" className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 font-mono text-xs text-neutral-100" /></label>
                      <label className="col-span-2 text-xs text-neutral-400">Available quantity<input type="number" min="0" step="0.001" disabled={currentUser.isBlocked} value={stockQuantity} onChange={event => setStockQuantity(event.target.value)} placeholder="Leave blank if availability is not quantity-based" className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-neutral-100" /></label>
                      <label className="col-span-2 text-xs text-neutral-400">Category<input value={categoryId} onChange={event => setCategoryId(event.target.value)} maxLength={80} placeholder="Optional category" className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-neutral-100" /></label>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="block text-xs font-medium text-neutral-400">{listingType === 'FABRIC' ? 'Fabric images *' : 'Garment / portfolio images *'}</label>
                    <div className="rounded-2xl border-2 border-dashed border-neutral-700 bg-neutral-900/30 p-6 text-center transition-all hover:border-amber-500/60">
                    <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" id="tailor-file-input" disabled={currentUser.isBlocked || isProcessingImage || imageAssets.length >= 8} onChange={handleFileUpload} className="hidden" />
                      <label htmlFor="tailor-file-input" className="flex cursor-pointer flex-col items-center justify-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400"><ImageIcon className="h-6 w-6" /></div>
                        <span className="text-xs font-semibold text-neutral-200">{isProcessingImage ? 'Processing and securely uploading…' : 'Upload a product image'}</span>
                        <span className="mt-1 text-[10px] text-neutral-500">Add up to 8 JPEG, PNG, WebP, or GIF images, 8 MB each. Optimized images and thumbnails are generated on the server.</span>
                      </label>
                    </div>
                    {imageAssets.length > 0 && <div className="grid grid-cols-4 gap-2">{imageAssets.map((asset, index) => (
                      <div key={asset.url} className="relative aspect-square overflow-hidden rounded-lg border border-neutral-700">
                        <img src={asset.thumbnailUrl || asset.url} alt={`Listing image ${index + 1}`} className="h-full w-full object-cover" />
                        <button type="button" onClick={() => {
                          const next = imageAssets.filter(item => item.url !== asset.url);
                          setImageAssets(next);
                          if (imageUrl === asset.url) setImageUrl(next[0]?.url || '');
                        }} className="absolute right-1 top-1 rounded bg-black/80 px-1.5 py-0.5 text-xs text-white" aria-label={`Remove image ${index + 1}`}>×</button>
                        {imageUrl === asset.url && <span className="absolute bottom-1 left-1 rounded bg-black/80 px-1.5 py-0.5 text-[9px] text-amber-300">Main</span>}
                        {imageUrl !== asset.url && <button type="button" onClick={() => setImageUrl(asset.url)} className="absolute inset-x-0 bottom-0 bg-black/70 py-1 text-[9px] text-white">Make primary</button>}
                      </div>
                    ))}</div>}

                    {compressionStats && (
                      <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400 font-mono">
                        <span>Upload size: {compressionStats.originalSizeKb}KB → {compressionStats.compressedSizeKb}KB</span>
                        <span>{compressionStats.compressedSizeKb < compressionStats.originalSizeKb ? `Saved ${Math.round((1 - compressionStats.compressedSizeKb / compressionStats.originalSizeKb) * 100)}%` : 'Original kept'}</span>
                      </div>
                    )}

                    {imageUrl && (
                      <div className="relative aspect-16/10 overflow-hidden rounded-2xl border border-amber-500/30 bg-neutral-900">
                        <img src={imageUrl} alt="Preview" className="h-full w-full object-contain brightness-110 saturate-110" referrerPolicy="no-referrer" />
                        <div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-0.5 text-[9px] text-amber-300">Live preview</div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-800 pt-4">
                  {editingListingId && <button type="button" onClick={() => { setEditingListingId(null); setTitle(''); setDescription(''); setImageUrl(''); setImageAssets([]); }} className="rounded-xl border border-neutral-700 px-4 py-3 text-xs font-semibold">Cancel edit</button>}
                  <button type="button" onClick={() => setIsPreviewOpen(true)} disabled={!title.trim()} className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 px-4 py-3 text-xs font-semibold disabled:opacity-40"><Eye className="h-4 w-4" />Preview</button>
                  <button type="submit" name="intent" value="draft" disabled={currentUser.isBlocked || isProcessingImage} className="rounded-xl border border-neutral-600 px-5 py-3 text-xs font-semibold disabled:opacity-50">Save draft</button>
                  <button type="submit" name="intent" value="publish" disabled={currentUser.isBlocked || isProcessingImage} className="rounded-xl bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-950 transition-all hover:shadow-lg hover:shadow-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50">
                    {editingListingId ? 'Submit changes for review' : 'Submit for review'}
                  </button>
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
                        <img src={post.imageUrl} alt={post.title} className="h-full w-full object-contain brightness-110 saturate-110" referrerPolicy="no-referrer" />
                        <button onClick={() => handleDeletePost(post.id)} title="Delete post" className="absolute right-2 top-2 rounded-lg bg-black/70 p-1.5 text-white transition-colors hover:bg-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="space-y-2 p-4">
                        <div className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-amber-300">{(post.status || 'published').replace('_', ' ')}{post.moderationStatus === 'pending' ? ' · moderation pending' : ''}</div>
                        {post.moderationStatus === 'rejected' && post.moderationNote && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[10px] text-red-300">Review feedback: {post.moderationNote}</p>}
                        <h3 className="font-serif text-base font-bold leading-tight">{post.title}</h3>
                        <p className="text-xs text-neutral-400 line-clamp-2">{post.description}</p>
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
                  <h2 className="text-xl font-serif font-bold">Promotion & Premium Plans</h2>
                </div>
                <p className={`mt-1 text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>Boost studio visibility, priority ranking, and direct buyer attention through a clean promotion dashboard.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {promoPlans.map(plan => (
                <div key={plan.id} className={`flex flex-col justify-between overflow-hidden rounded-2xl border p-6 transition-all ${isDarkMode ? 'border-neutral-800 bg-[#121316] hover:border-amber-500/50 shadow-md' : 'border-neutral-200 bg-white shadow-sm hover:border-amber-500/50'}`}>
                  <div>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white" style={{ backgroundColor: plan.accentColor || '#d97706' }}>{plan.badgeLabel}</span>
                      <span className="flex items-center gap-1 text-xs text-neutral-400 font-mono"><Clock className="h-3 w-3 text-amber-500" />{plan.timeRange}</span>
                    </div>
                    <h3 className="mb-2 text-xl font-serif font-bold">{plan.caption}</h3>
                    <p className={`mb-4 text-xs leading-relaxed ${isDarkMode ? 'text-neutral-300' : 'text-neutral-600'}`}>{plan.description}</p>
                  </div>

                  <div className="border-t border-neutral-800/80 pt-4">
                    <div className="mb-4 flex items-baseline gap-1">
                      <span className="text-3xl font-serif font-bold text-amber-400">${plan.amount}</span>
                      <span className="text-xs text-neutral-400 font-mono">/ {plan.timeRange}</span>
                    </div>
                    <a href={`https://wa.me/${plan.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello Admin! I am tailor ${currentUser.name} (${currentUser.handle}) on FABSATTIRE. I would like to purchase the "${plan.caption}" plan for $${plan.amount} (${plan.timeRange}). Please activate my promoted studio.`)}`} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500">
                      <Phone className="h-3.5 w-3.5" />Request Plan on WhatsApp
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
