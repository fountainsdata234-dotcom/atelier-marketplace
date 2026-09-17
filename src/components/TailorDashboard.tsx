import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scissors, Sparkles, Upload, Image as ImageIcon, Link as LinkIcon, Share2, Star, AlertTriangle, CheckCircle, Trash2, Heart, Bookmark, Phone, MessageSquare, DollarSign, Tag, Clock } from 'lucide-react';
import { User, ClothPost, AdminPromoPlan, FabricRequest } from '../types';
import { compressAndGenerateImageLink, validateImageLink, ProcessedImageResult } from '../utils/imageProgram';
import { storageService } from '../services/storage';
import { firebaseAuth, uploadUserImage } from '../services/firebase';
import { api } from '../services/api';

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
  const [tagsInput, setTagsInput] = useState('');
  const [pricingBasic, setPricingBasic] = useState<number>(0);

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
  const [imageHostMode, setImageHostMode] = useState<'upload_compress' | 'direct_link'>('upload_compress');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [compressionStats, setCompressionStats] = useState<ProcessedImageResult | null>(null);
  const [postStatus, setPostStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [fabricRequests, setFabricRequests] = useState<FabricRequest[]>([]);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);

  // Filter posts belonging to this tailor/seller
  const myPosts = posts.filter(p => p.authorId === currentUser.id).map(post => ({
    ...post,
    likes: Array.isArray(post.likes) ? post.likes : [],
    saves: Array.isArray(post.saves) ? post.saves : [],
    tags: Array.isArray(post.tags) ? post.tags : [],
  }));
  const totalLikes = myPosts.reduce((acc, p) => acc + p.likes.length, 0);
  const totalSaves = myPosts.reduce((acc, p) => acc + p.saves.length, 0);
  const followerCount = Array.isArray(currentUser.followers) ? currentUser.followers.length : 0;

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
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingImage(true);
    setPostStatus(null);
    try {
      const result = await compressAndGenerateImageLink(file);
      if (!result.blob || !firebaseAuth.currentUser) {
        throw new Error('Please sign in again before uploading an image.');
      }
      const uploadedUrl = await uploadUserImage(result.blob, firebaseAuth.currentUser.uid, 'posts', `${Date.now()}.jpg`);
      URL.revokeObjectURL(result.url);
      setImageUrl(uploadedUrl);
      setCompressionStats(result);
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
  const handlePublishPost = async (e: React.FormEvent) => {
    e.preventDefault();
    setPostStatus(null);

    if (currentUser.isBlocked) {
      setPostStatus({
        type: 'error',
        message: 'Your account has been restricted by an administrator. Posting is disabled.'
      });
      return;
    }

    if (!title.trim() || !imageUrl.trim()) {
      setPostStatus({
        type: 'error',
        message: 'Please provide a post title and an image link or uploaded photo.'
      });
      return;
    }

    const tags = normalizeTags(tagsInput);

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
      tags: tags.length > 0 ? tags : [currentUser.role === 'fabric_seller' ? 'Fabrics' : 'Menwear'],
      pricing: {
        currency: currentUser.location.currency || 'USD',
        basic: Number(pricingBasic) || 0,
        premiumMaterial: 0,
        bespokeComplexity: 0,
      },
      imageUrl: imageUrl.trim(),
      imageHostSource: compressionStats ? `Firebase Storage · ${compressionStats.compressedSizeKb}KB` : 'External Link'
    };

    try {
      const createdPost = await api.createPost(postData);
      const cachedPosts = storageService.getPosts();
      storageService.savePosts([
        { ...createdPost, likes: createdPost.likes || [], saves: createdPost.saves || [], rating: createdPost.rating || 0, ratingCount: createdPost.ratingCount || 0, ratingsByUser: createdPost.ratingsByUser || {} },
        ...cachedPosts.filter(item => item.id !== createdPost.id)
      ]);
    } catch (error) {
      setPostStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to publish post.' });
      return;
    }

    setPostStatus({ type: 'success', message: 'Post published successfully to the marketplace!' });
    setTitle('');
    setDescription('');
    setTagsInput('');
    setImageUrl('');
    setCompressionStats(null);
  };

  // Delete Post
  const handleDeletePost = async (postId: string) => {
    if (!window.confirm('Are you sure you want to remove this bespoke design?')) return;

    const cachedPosts = storageService.getPosts();
    const postExists = cachedPosts.some(post => post.id === postId);
    if (!postExists) return;

    storageService.deletePost(postId, currentUser.id, false);

    try {
      await api.deletePost(postId);
      setPostStatus({ type: 'success', message: 'Post removed from the marketplace.' });
    } catch (error) {
      storageService.savePosts(cachedPosts);
      setPostStatus({ type: 'error', message: error instanceof Error ? error.message : 'The post could not be deleted.' });
    }
  };

  return (
    <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      <div className="glass-panel overflow-hidden rounded-[28px] p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-600">Welcome message</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900 md:text-2xl">Welcome to Fabrilux Atelier</h2>
          </div>
          <div className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700 ring-1 ring-amber-500/30">
            Premium studio
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[22px] bg-gradient-to-r from-amber-600 to-orange-500 p-4 text-white shadow-lg shadow-orange-500/20">
            <p className="text-xs uppercase tracking-[0.18em] text-orange-100">General greeting</p>
            <p className="mt-2 text-sm leading-relaxed text-orange-50">
              Hello {currentUser.name || 'there'}, welcome to your premium fashion studio. Start by publishing your first garment or fabric, connect with buyers globally, and let your brand look polished on mobile and desktop.
            </p>
          </div>

          <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Invoice snapshot</p>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <div className="flex items-center justify-between">
                <span>Studio plan</span>
                <span className="font-semibold">Starter</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Due</span>
                <span className="font-semibold">$0.00</span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                <span className="font-semibold text-slate-900">Total</span>
                <span className="font-bold text-slate-900">$0.00</span>
              </div>
            </div>
            {currentUser.isWarned && currentUser.warningNote && <div className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-700"><strong className="block text-[10px] uppercase tracking-wider">Urgent account alert</strong><span className="mt-1 block leading-relaxed">{currentUser.warningNote}</span></div>}
          </div>
        </div>
      </div>

      {/* Studio Header & Stats Banner */}
      <div className={`p-6 rounded-3xl border transition-all ${
        isDarkMode
          ? 'bg-gradient-to-br from-amber-500/10 via-[#121316] to-[#0c0d10] border-amber-500/30'
          : 'bg-gradient-to-br from-amber-50 via-white to-neutral-50 border-amber-300 shadow-sm'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center font-serif text-2xl font-bold text-amber-400">
                {currentUser.name.charAt(0)}
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
                  {currentUser.shopName || currentUser.name}
                </h1>
                {currentUser.isPromoted && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    ★ Promoted Atelier
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-400 mt-1 font-mono">
                <span className="text-amber-400 font-semibold">{currentUser.handle}</span>
                <span>•</span>
                <span>{currentUser.location.city}, {currentUser.location.country}</span>
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
                  <img src={request.postImageUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
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

      {/* Promotion & Premium Plans Section (Requested 3 Admin Cards) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h2 className="text-xl font-serif font-bold">Atelier Promotion & Premium Plans</h2>
            </div>
            <p className={`text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              Accelerate your studio exposure. Verified promoted status places your bespoke work in the top carousel and feeds.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {promoPlans.map((plan) => (
            <div
              key={plan.id}
              className={`p-6 rounded-2xl border transition-all flex flex-col justify-between relative overflow-hidden ${
                isDarkMode
                  ? 'bg-[#121316] border-neutral-800 hover:border-amber-500/50 shadow-md'
                  : 'bg-white border-neutral-200 hover:border-amber-500/50 shadow-sm'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span
                    className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-white"
                    style={{ backgroundColor: plan.accentColor || '#d97706' }}
                  >
                    {plan.badgeLabel}
                  </span>
                  <span className="text-xs text-neutral-400 font-mono flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-500" />
                    <span>{plan.timeRange}</span>
                  </span>
                </div>

                <h3 className="text-xl font-serif font-bold mb-2">{plan.caption}</h3>
                <p className={`text-xs mb-4 leading-relaxed ${isDarkMode ? 'text-neutral-300' : 'text-neutral-600'}`}>
                  {plan.description}
                </p>
              </div>

              <div className="pt-4 border-t border-neutral-800/80">
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-3xl font-serif font-bold text-amber-400">
                    ${plan.amount}
                  </span>
                  <span className="text-xs text-neutral-400 font-mono">/ {plan.timeRange}</span>
                </div>

                {/* Direct WhatsApp communication button to Admin */}
                <a
                  href={`https://wa.me/${plan.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(
                    `Hello Admin! I am tailor ${currentUser.name} (${currentUser.handle}) on Atelier Marketplace. I would like to purchase the "${plan.caption}" plan for $${plan.amount} (${plan.timeRange}). Please activate my promoted studio.`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Request Plan on WhatsApp</span>
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Create New Post Form */}
      <section className={`p-6 sm:p-8 rounded-3xl border transition-colors ${
        isDarkMode ? 'bg-[#121316] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
      }`}>
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-neutral-800">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
            <Scissors className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-serif font-bold">
              {currentUser.role === 'fabric_seller' ? 'List Fabric Material' : 'Publish Garment Post'}
            </h2>
            <p className={`text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              Add a clear seller price for your item or leave it negotiable. Images are processed via our high-efficiency upload program.
            </p>
          </div>
        </div>

        {/* Post status message */}
        <AnimatePresence>
          {postStatus && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`p-3.5 rounded-xl text-xs flex items-center gap-2 mb-6 ${
                postStatus.type === 'success'
                  ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
                  : 'bg-red-500/15 border border-red-500/40 text-red-300'
              }`}
            >
              {postStatus.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              <span>{postStatus.message}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handlePublishPost} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Details & Pricing */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1.5">
                  Item Title *
                </label>
                <input
                  type="text"
                  required
                  disabled={currentUser.isBlocked}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={currentUser.role === 'fabric_seller' ? 'e.g. Royal Italian 100% Cashmere Wool' : 'e.g. Double-Breasted Tuxedo'}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-neutral-800/40 border border-neutral-700 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1.5">
                  Garment / Fabric Description & Labeling *
                </label>
                <textarea
                  rows={3}
                  required
                  disabled={currentUser.isBlocked}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the fabric weave, fit silhouette, hand-stitched lapels, occasion suitability, and turnaround time."
                  className="w-full p-3 text-xs rounded-xl bg-neutral-800/40 border border-neutral-700 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1.5">
                  Tags (general categories)
                </label>
                <input
                  type="text"
                  disabled={currentUser.isBlocked}
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g. menwear, womenwear, formal, bridal"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-neutral-800/40 border border-neutral-700 focus:border-amber-500 focus:outline-none"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {TAG_OPTIONS.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setTagsInput(prev => {
                        const currentValues = prev.split(',').map(item => item.trim()).filter(Boolean);
                        return currentValues.includes(tag) ? prev : `${prev ? `${prev}, ` : ''}${tag}`;
                      })}
                      className="px-2.5 py-1 rounded-full text-[10px] border border-neutral-700 bg-neutral-800/60 text-neutral-300 hover:border-amber-500 hover:text-amber-300"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pricing: one field, currency already selected from country */}
              <div className="p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 space-y-3">
                <span className="text-xs font-semibold text-amber-400 block font-mono">
                  Seller Price ({currentUser.location.currency || 'USD'})
                </span>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-neutral-500 text-xs">{currentUser.location.currency || 'USD'}</span>
                  <input
                    type="number"
                    min="0"
                    disabled={currentUser.isBlocked}
                    value={pricingBasic}
                    onChange={(e) => setPricingBasic(Number(e.target.value))}
                    placeholder="Leave blank for negotiable"
                    className="w-full pl-6 pr-2 py-1.5 text-xs rounded-lg bg-neutral-800 border border-neutral-700 font-mono"
                  />
                </div>
                <p className="text-[10px] text-neutral-400">
                  Leave it empty and the item will appear as negotiable.
                </p>
              </div>
            </div>

            {/* Right Column: Image upload */}
            <div className="space-y-4">
              <label className="block text-xs font-medium text-neutral-400">
                Garment image *
              </label>

              {/* Mode switch: Upload & Compress vs Direct Link */}
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setImageHostMode('upload_compress')}
                  className={`flex-1 py-2 rounded-xl border font-medium flex items-center justify-center gap-1.5 transition-all ${
                    imageHostMode === 'upload_compress'
                      ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                      : 'border-neutral-700 text-neutral-400'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload & Auto-Compress</span>
                </button>

                <button
                  type="button"
                  onClick={() => setImageHostMode('direct_link')}
                  className={`flex-1 py-2 rounded-xl border font-medium flex items-center justify-center gap-1.5 transition-all ${
                    imageHostMode === 'direct_link'
                      ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                      : 'border-neutral-700 text-neutral-400'
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span>Paste Direct Link / CDN</span>
                </button>
              </div>

              {imageHostMode === 'upload_compress' ? (
                <div className="border-2 border-dashed border-neutral-700 hover:border-amber-500/60 rounded-2xl p-6 text-center transition-all bg-neutral-900/30">
                  <input
                    type="file"
                    accept="image/*"
                    id="tailor-file-input"
                    disabled={currentUser.isBlocked || isProcessingImage}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <label
                    htmlFor="tailor-file-input"
                    className="cursor-pointer flex flex-col items-center justify-center"
                  >
                    <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-3">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-semibold text-neutral-200">
                      {isProcessingImage ? 'Compressing & Generating Optimized Link...' : 'Click to Upload Device Photo or Take Picture'}
                    </span>
                    <span className="text-[10px] text-neutral-500 mt-1">
                      Our program shrinks high-res photos to &lt;100KB without visual loss.
                    </span>
                  </label>
                </div>
              ) : (
                <div>
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/... or Cloudinary URL"
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-neutral-800/40 border border-neutral-700 focus:border-amber-500 focus:outline-none font-mono"
                  />
                </div>
              )}

              {/* Compression stats banner */}
              {compressionStats && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between font-mono">
                  <span>Compressed: {compressionStats.originalSizeKb}KB → {compressionStats.compressedSizeKb}KB</span>
                  <span className="font-bold">
                    Saved {Math.round((1 - compressionStats.compressedSizeKb / compressionStats.originalSizeKb) * 100)}%
                  </span>
                </div>
              )}

              {/* Image Live Preview */}
              {imageUrl && (
                <div className="relative aspect-16/10 rounded-2xl overflow-hidden border border-amber-500/30 bg-neutral-900">
                  <img
                    src={imageUrl}
                    alt="Preview"
                    className="w-full h-full object-cover object-center"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded text-[9px] bg-black/70 text-amber-300 backdrop-blur-md">
                    Live Preview
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-neutral-800">
            <button
              type="submit"
              disabled={currentUser.isBlocked || isProcessingImage}
              className="px-8 py-3 rounded-xl font-medium text-xs uppercase tracking-wider text-neutral-950 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 hover:shadow-lg hover:shadow-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Publish to Atelier Marketplace
            </button>
          </div>
        </form>
      </section>

      {/* My Published Posts List */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-serif font-bold">
            Published Atelier Designs ({myPosts.length})
          </h2>
        </div>

        {myPosts.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-neutral-800/60 bg-neutral-900/20 text-xs text-neutral-400">
            You have not published any garments yet. Use the form above to post your first bespoke creation.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {myPosts.map((post) => (
              <div
                key={post.id}
                className="rounded-2xl border border-neutral-800 overflow-hidden bg-neutral-900/40 flex flex-col justify-between"
              >
                <div className="relative aspect-4/3 w-full bg-neutral-900 overflow-hidden">
                  <img
                    src={post.imageUrl}
                    alt={post.title}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <button
                    onClick={() => handleDeletePost(post.id)}
                    title="Delete post"
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 hover:bg-red-600 text-white transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="p-4 space-y-2">
                  <h3 className="font-serif font-bold text-base leading-tight">{post.title}</h3>
                  <p className="text-xs text-neutral-400 line-clamp-2">{post.description}</p>
                  
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-neutral-800 font-mono text-neutral-400">
                    <span>{post.likes.length} Likes</span>
                    <span>{post.saves.length} Saves</span>
                    <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
