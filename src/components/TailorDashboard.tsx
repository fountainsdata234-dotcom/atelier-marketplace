import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scissors, Sparkles, Upload, Image as ImageIcon, Link as LinkIcon, Share2, Star, AlertTriangle, CheckCircle, Trash2, Heart, Bookmark, Phone, MessageSquare, DollarSign, Tag, Clock } from 'lucide-react';
import { User, ClothPost, AdminPromoPlan } from '../types';
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
  const [pricingBasic, setPricingBasic] = useState<number>(120);
  const [pricingPremium, setPricingPremium] = useState<number>(220);
  const [pricingBespoke, setPricingBespoke] = useState<number>(350);

  // Image Program State
  const [imageUrl, setImageUrl] = useState('');
  const [imageHostMode, setImageHostMode] = useState<'upload_compress' | 'direct_link'>('upload_compress');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [compressionStats, setCompressionStats] = useState<ProcessedImageResult | null>(null);
  const [postStatus, setPostStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filter posts belonging to this tailor/seller
  const myPosts = posts.filter(p => p.authorId === currentUser.id);
  const totalLikes = myPosts.reduce((acc, p) => acc + p.likes.length, 0);
  const totalSaves = myPosts.reduce((acc, p) => acc + p.saves.length, 0);

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

    const tags = tagsInput
      .split(',')
      .map(t => t.trim().replace(/^#/, ''))
      .filter(t => t.length > 0);

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
      tags: tags.length > 0 ? tags : [currentUser.role === 'fabric_seller' ? 'Textiles' : 'Bespoke'],
      pricing: {
        currency: currentUser.location.currency || 'USD',
        basic: Number(pricingBasic) || 0,
        premiumMaterial: Number(pricingPremium) || 0,
        bespokeComplexity: Number(pricingBespoke) || 0
      },
      imageUrl: imageUrl.trim(),
      imageHostSource: compressionStats ? `Firebase Storage · ${compressionStats.compressedSizeKb}KB` : 'External Link'
    };

    try {
      await api.createPost(postData);
      window.dispatchEvent(new CustomEvent('atelier_posts_updated'));
    } catch (error) {
      setPostStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to publish post.' });
      return;
    }

    setPostStatus({ type: 'success', message: 'Bespoke post published successfully to the marketplace!' });
    setTitle('');
    setDescription('');
    setTagsInput('');
    setImageUrl('');
    setCompressionStats(null);
  };

  // Delete Post
  const handleDeletePost = (postId: string) => {
    if (confirm('Are you sure you want to remove this bespoke design?')) {
      api.deletePost(postId).then(() => window.dispatchEvent(new CustomEvent('atelier_posts_updated'))).catch(error => setPostStatus({ type: 'error', message: error.message }));
    }
  };

  return (
    <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
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
            <span className="text-2xl font-serif font-bold text-amber-400">{currentUser.followers.length}</span>
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
              {currentUser.role === 'fabric_seller' ? 'List Fabric Material' : 'Publish Bespoke Garment Post'}
            </h2>
            <p className={`text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              Attach custom pricing tiers for material and complexity. Images are processed via our high-efficiency link program.
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
                  placeholder={currentUser.role === 'fabric_seller' ? 'e.g. Royal Italian 100% Cashmere Wool' : 'e.g. Bespoke Double-Breasted Tuxedo'}
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
                  Tags (Separated by commas) *
                </label>
                <input
                  type="text"
                  disabled={currentUser.isBlocked}
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g. Tuxedo, ItalianWool, Bespoke, Wedding, Kaftan, Luxury"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-neutral-800/40 border border-neutral-700 focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Custom Pricing Breakdown by Material & Complexity */}
              <div className="p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 space-y-3">
                <span className="text-xs font-semibold text-amber-400 block font-mono">
                  Custom Pricing Structure ({currentUser.location.currency || 'USD'})
                </span>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-1">Standard Cut</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-neutral-500 text-xs">{currentUser.location.currency || 'USD'}</span>
                      <input
                        type="number"
                        min="1"
                        disabled={currentUser.isBlocked}
                        value={pricingBasic}
                        onChange={(e) => setPricingBasic(Number(e.target.value))}
                        className="w-full pl-6 pr-2 py-1.5 text-xs rounded-lg bg-neutral-800 border border-neutral-700 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-1">With Fine Material</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-neutral-500 text-xs">{currentUser.location.currency || 'USD'}</span>
                      <input
                        type="number"
                        min="1"
                        disabled={currentUser.isBlocked}
                        value={pricingPremium}
                        onChange={(e) => setPricingPremium(Number(e.target.value))}
                        className="w-full pl-6 pr-2 py-1.5 text-xs rounded-lg bg-neutral-800 border border-neutral-700 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-1">Bespoke Handcrafted</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-neutral-500 text-xs">{currentUser.location.currency || 'USD'}</span>
                      <input
                        type="number"
                        min="1"
                        disabled={currentUser.isBlocked}
                        value={pricingBespoke}
                        onChange={(e) => setPricingBespoke(Number(e.target.value))}
                        className="w-full pl-6 pr-2 py-1.5 text-xs rounded-lg bg-neutral-800 border border-neutral-700 font-mono"
                      />
                    </div>
                  </div>
                </div>
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
