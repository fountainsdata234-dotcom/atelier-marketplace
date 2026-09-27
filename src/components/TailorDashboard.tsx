import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scissors, Sparkles, Upload, Image as ImageIcon, Link as LinkIcon, Share2, Star, AlertTriangle, CheckCircle, Trash2, Heart, Bookmark, Phone, MessageSquare, DollarSign, Tag, Clock } from 'lucide-react';
import { User, ClothPost, AdminPromoPlan, FabricRequest } from '../types';
import { compressAndGenerateImageLink, validateImageLink, ProcessedImageResult } from '../utils/imageProgram';
import { storageService } from '../services/storage';
import { firebaseAuth, uploadUserImage } from '../services/firebase';
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
  const [warningModalOpen, setWarningModalOpen] = useState(Boolean(currentUser.isWarned && currentUser.warningNote));
  const [activeStudioTab, setActiveStudioTab] = useState<'overview' | 'posts' | 'plans'>('overview');

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
    <div className="relative z-10 flex w-full max-w-7xl flex-col mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
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

              <form onSubmit={handlePublishPost} className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-neutral-400 mb-1.5">Item Title *</label>
                      <input type="text" required disabled={currentUser.isBlocked} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={currentUser.role === 'fabric_seller' ? 'e.g. Royal Italian 100% Cashmere Wool' : 'e.g. Double-Breasted Tuxedo'} className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-neutral-800/40 border border-neutral-700 focus:border-amber-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-400 mb-1.5">Description & Labeling *</label>
                      <textarea rows={3} required disabled={currentUser.isBlocked} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the fabric weave, fit silhouette, occasion, and turnaround time." className="w-full p-3 text-xs rounded-xl bg-neutral-800/40 border border-neutral-700 focus:border-amber-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-400 mb-1.5">Tags</label>
                      <input type="text" disabled={currentUser.isBlocked} value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="e.g. menwear, womenwear, formal, bridal" className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-neutral-800/40 border border-neutral-700 focus:border-amber-500 focus:outline-none" />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {TAG_OPTIONS.map(tag => (
                          <button key={tag} type="button" onClick={() => setTagsInput(prev => { const currentValues = prev.split(',').map(item => item.trim()).filter(Boolean); return currentValues.includes(tag) ? prev : `${prev ? `${prev}, ` : ''}${tag}`; })} className="rounded-full border border-neutral-700 bg-neutral-800/60 px-2.5 py-1 text-[10px] text-neutral-300 hover:border-amber-500 hover:text-amber-300">{tag}</button>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
                      <span className="block text-xs font-semibold text-amber-400 font-mono">Seller Price ({currentUser.location.currency || 'USD'})</span>
                      <div className="relative mt-3">
                        <span className="absolute left-2.5 top-2 text-neutral-500 text-xs">{currentUser.location.currency || 'USD'}</span>
                        <input type="number" min="0" disabled={currentUser.isBlocked} value={pricingBasic} onChange={(e) => setPricingBasic(Number(e.target.value))} placeholder="Leave blank for negotiable" className="w-full pl-6 pr-2 py-1.5 text-xs rounded-lg bg-neutral-800 border border-neutral-700 font-mono" />
                      </div>
                      <p className="mt-2 text-[10px] text-neutral-400">Leave it empty and the item will appear as negotiable.</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="block text-xs font-medium text-neutral-400">Garment image *</label>
                    <div className="flex gap-2 text-xs">
                      <button type="button" onClick={() => setImageHostMode('upload_compress')} className={`flex-1 rounded-xl border py-2 font-medium transition-all ${imageHostMode === 'upload_compress' ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-neutral-700 text-neutral-400'}`}><span className="inline-flex items-center justify-center gap-1.5"><Upload className="w-3.5 h-3.5" />Upload & Compress</span></button>
                      <button type="button" onClick={() => setImageHostMode('direct_link')} className={`flex-1 rounded-xl border py-2 font-medium transition-all ${imageHostMode === 'direct_link' ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-neutral-700 text-neutral-400'}`}><span className="inline-flex items-center justify-center gap-1.5"><LinkIcon className="w-3.5 h-3.5" />Direct Link</span></button>
                    </div>

                    {imageHostMode === 'upload_compress' ? (
                      <div className="rounded-2xl border-2 border-dashed border-neutral-700 bg-neutral-900/30 p-6 text-center transition-all hover:border-amber-500/60">
                        <input type="file" accept="image/*" id="tailor-file-input" disabled={currentUser.isBlocked || isProcessingImage} onChange={handleFileUpload} className="hidden" />
                        <label htmlFor="tailor-file-input" className="flex cursor-pointer flex-col items-center justify-center">
                          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400"><ImageIcon className="h-6 w-6" /></div>
                          <span className="text-xs font-semibold text-neutral-200">{isProcessingImage ? 'Compressing & generating optimized link...' : 'Click to upload a product image'}</span>
                          <span className="mt-1 text-[10px] text-neutral-500">Our compression tool keeps files lightweight without sacrificing quality.</span>
                        </label>
                      </div>
                    ) : (
                      <input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://images.unsplash.com/... or Cloudinary URL" className="w-full rounded-xl border border-neutral-700 bg-neutral-800/40 px-3.5 py-2.5 text-xs font-mono focus:border-amber-500 focus:outline-none" />
                    )}

                    {compressionStats && (
                      <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400 font-mono">
                        <span>Compressed: {compressionStats.originalSizeKb}KB → {compressionStats.compressedSizeKb}KB</span>
                        <span>Saved {Math.round((1 - compressionStats.compressedSizeKb / compressionStats.originalSizeKb) * 100)}%</span>
                      </div>
                    )}

                    {imageUrl && (
                      <div className="relative aspect-16/10 overflow-hidden rounded-2xl border border-amber-500/30 bg-neutral-900">
                        <img src={imageUrl} alt="Preview" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                        <div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-0.5 text-[9px] text-amber-300">Live preview</div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end border-t border-neutral-800 pt-4">
                  <button type="submit" disabled={currentUser.isBlocked || isProcessingImage} className="rounded-xl bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 px-8 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-950 transition-all hover:shadow-lg hover:shadow-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50">
                    Publish to Marketplace
                  </button>
                </div>
              </form>
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-serif font-bold">Published Atelier Designs ({myPosts.length})</h2>
              </div>
              {myPosts.length === 0 ? (
                <div className="rounded-2xl border border-neutral-800/60 bg-neutral-900/20 p-8 text-center text-xs text-neutral-400">You have not published any garments yet. Use the form above to post your first bespoke creation.</div>
              ) : (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {myPosts.map(post => (
                    <div key={post.id} className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40">
                      <div className="relative aspect-4/3 overflow-hidden bg-neutral-900">
                        <img src={post.imageUrl} alt={post.title} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                        <button onClick={() => handleDeletePost(post.id)} title="Delete post" className="absolute right-2 top-2 rounded-lg bg-black/70 p-1.5 text-white transition-colors hover:bg-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="space-y-2 p-4">
                        <h3 className="font-serif text-base font-bold leading-tight">{post.title}</h3>
                        <p className="text-xs text-neutral-400 line-clamp-2">{post.description}</p>
                        <div className="flex items-center justify-between border-t border-neutral-800 pt-2 text-xs font-mono text-neutral-400">
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
                    <a href={`https://wa.me/${plan.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello Admin! I am tailor ${currentUser.name} (${currentUser.handle}) on Atelier Marketplace. I would like to purchase the "${plan.caption}" plan for $${plan.amount} (${plan.timeRange}). Please activate my promoted studio.`)}`} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500">
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
