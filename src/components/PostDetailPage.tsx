import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, MapPin, MessageCircle, Share2, Flag, X } from 'lucide-react';
import { ClothPost, User } from '../types';
import { getRoleLabel } from '../utils/profile';
import { api } from '../services/api';
import { safeCustomerErrorMessage } from '../utils/customerMessages';
import { PostImage } from './PostImage';

interface PostDetailPageProps {
  post: ClothPost | null;
  posts: ClothPost[];
  users: User[];
  currentUser: User | null;
  onOpenAuth: () => void;
  isDarkMode: boolean;
  onBack: () => void;
  onSelectPost: (post: ClothPost) => void;
  onSelectSeller: (seller: User) => void;
  onInquire: (post: ClothPost) => void;
  onShare: (post: ClothPost) => void;
  onView: (post: ClothPost) => void;
}

export const PostDetailPage: React.FC<PostDetailPageProps> = ({
  post,
  posts,
  users,
  currentUser,
  onOpenAuth,
  isDarkMode,
  onBack,
  onSelectPost,
  onSelectSeller,
  onInquire,
  onShare,
  onView,
}) => {
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(post?.imageUrl || null);
  const [isImageExpanded, setIsImageExpanded] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [reportReason, setReportReason] = useState('Misleading content');
  const [reportDetails, setReportDetails] = useState('');
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const [sellerAvatarUnavailable, setSellerAvatarUnavailable] = useState(false);
  const seller = users.find(user => user.id === post?.authorId);
  useEffect(() => setSellerAvatarUnavailable(false), [seller?.avatarUrl]);
  const userById = useMemo(() => new Map(users.map(user => [user.id, user])), [users]);
  const postTags = useMemo(() => new Set((post?.tags || []).map(tag => tag.trim().toLowerCase()).filter(Boolean)), [post?.tags]);
  const visiblePosts = useMemo(() => posts.filter(item =>
    !userById.get(item.authorId)?.isBlocked
    && !item.deletedAt
    && (item.status === undefined || (item.status === 'published' && (item.moderationStatus === undefined || item.moderationStatus === 'approved'))),
  ), [posts, userById]);
  const sameSeller = useMemo(() => visiblePosts
    .filter(item => item.authorId === post?.authorId && item.id !== post?.id)
    .map(item => ({ post: item, matchCount: item.tags.filter(tag => postTags.has(tag.trim().toLowerCase())).length }))
    .filter(item => item.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount || new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime())
    .slice(0, 4)
    .map(item => item.post), [visiblePosts, post?.authorId, post?.id, postTags]);
  const fromOtherSellers = useMemo(() => visiblePosts
    .filter(item => item.authorId !== post?.authorId && item.id !== post?.id)
    .map(item => ({ post: item, matchCount: item.tags.filter(tag => postTags.has(tag.trim().toLowerCase())).length }))
    .filter(item => item.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount
      || new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime())
    .slice(0, 6)
    .map(item => item.post), [visiblePosts, post?.authorId, post?.id, postTags]);

  useEffect(() => {
    if (post) onView(post);
  }, [post?.id]);

  useEffect(() => {
    setSelectedImageUrl(post?.imageUrl || null);
    setIsImageExpanded(false);
  }, [post?.id]);

  useEffect(() => {
    if (!isImageExpanded) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsImageExpanded(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isImageExpanded]);

  const surface = isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white';
  const muted = isDarkMode ? 'text-neutral-400' : 'text-neutral-600';

    if (!post) {
    return (
      <main className="w-full px-4 py-8 sm:px-6 lg:px-8">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-amber-500"><ArrowLeft className="h-4 w-4" /> Back to marketplace</button>
        <p className={`mt-12 text-center text-sm ${muted}`}>This listing is no longer available.</p>
      </main>
    );
  }

  const location = [post.authorLocation.city, post.authorLocation.state, post.authorLocation.country].filter(Boolean).join(', ');
  const reportListing = async (event: React.FormEvent) => {
    event.preventDefault();
    setReportMessage(null);
    try {
      await api.reportListing(post.id, reportReason, reportDetails);
      setReportMessage('Thank you. Your report has been sent to the moderation team.');
      setIsReporting(false);
      setReportDetails('');
    } catch (error) {
      setReportMessage(safeCustomerErrorMessage(error, "Your report couldn't be submitted. Please try again."));
    }
  };

  const renderRelatedCard = (relatedPost: ClothPost) => (
    <button key={relatedPost.id} type="button" onClick={() => onSelectPost(relatedPost)} className={`group min-w-0 overflow-hidden rounded-xl border text-left transition-colors hover:border-amber-500/50 ${surface}`}>
      <PostImage src={relatedPost.imageAssets?.[0]?.thumbnailUrl || relatedPost.imageUrl} alt={relatedPost.title} className="aspect-[4/3]" imageClassName="brightness-110 saturate-110" />
      <span className="block truncate px-3 pt-2.5 text-xs font-semibold">{relatedPost.title}</span>
      <span className={`block truncate px-3 pb-3 pt-1 text-[10px] ${muted}`}>{relatedPost.tags.slice(0, 2).map(tag => `#${tag}`).join(' ')}</span>
    </button>
  );

  return (
    <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-amber-500 hover:text-amber-300"><ArrowLeft className="h-4 w-4" /> Back to marketplace</button>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)] lg:items-start">
        <div className={`overflow-hidden rounded-2xl border ${surface}`}>
          <div className="flex min-h-[320px] items-center justify-center bg-neutral-950 sm:min-h-[480px] lg:min-h-[620px]">
            <button
              type="button"
              onClick={() => setIsImageExpanded(true)}
              data-marketplace-listing-id={post.id}
              aria-label={`View ${post.imageAlt || post.title} full screen`}
              className="block h-full min-h-[320px] w-full cursor-zoom-in sm:min-h-[480px] lg:min-h-[620px]"
            >
              <PostImage src={selectedImageUrl || post.imageUrl} alt={post.imageAlt || post.title} className="h-full min-h-[320px] w-full sm:min-h-[480px] lg:min-h-[620px]" imageClassName="max-h-[78vh]" fetchPriority="high" decoding="async" />
            </button>
          </div>
          {post.tags.length > 0 && <div className="flex flex-wrap gap-2 border-t border-neutral-800/60 p-4">{post.tags.map(tag => <span key={tag} className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-400">#{tag}</span>)}</div>}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <div className={`rounded-2xl border p-5 sm:p-6 ${surface}`}>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-500">{getRoleLabel(post.authorRole)}</p>
            {post.listingType && <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{post.listingType.replace('_', ' ')}{post.categoryId ? ` · ${post.categoryId}` : ''}</p>}
            <h1 className="mt-2 font-serif text-2xl font-bold sm:text-3xl">{post.title}</h1>
            <div className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs ${muted}`}>
              <span>Firsthand feedback is shown below</span>
              {location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-amber-500" />{location}</span>}
            </div>
            <p className={`mt-5 whitespace-pre-line text-sm leading-relaxed ${muted}`}>{post.description || 'Contact the seller for details about this piece.'}</p>
            <div className="mt-5 flex items-center justify-between border-t border-neutral-800/60 pt-4 text-xs">
              <span className="font-bold uppercase tracking-wider text-amber-500">Price</span>
              <span>{post.priceMin !== null && post.priceMin !== undefined
                ? `${post.currency || post.pricing.currency || post.authorLocation.currency || 'USD'} ${post.priceMin}${post.priceMax !== null && post.priceMax !== undefined && post.priceMax !== post.priceMin ? ` – ${post.priceMax}` : ''}`
                : post.pricing.basic > 0 ? `${post.pricing.currency || post.authorLocation.currency || 'USD'} ${post.pricing.basic}` : 'Price on request'}</span>
            </div>
            {post.listingDetails && <div className={`mt-3 grid grid-cols-2 gap-2 border-t border-neutral-800/60 pt-4 text-xs ${muted}`}>
              {'material' in post.listingDetails && <><span>Material</span><span className="text-right">{post.listingDetails.material}</span><span>Colour</span><span className="text-right">{post.listingDetails.colour}</span>{post.listingDetails.pattern && <><span>Pattern</span><span className="text-right">{post.listingDetails.pattern}</span></>}{post.listingDetails.width && <><span>Width</span><span className="text-right">{post.listingDetails.width} {post.listingDetails.widthUnit || 'cm'}</span></>}{post.listingDetails.priceUnit && <><span>Price unit</span><span className="text-right">{post.listingDetails.priceUnit}</span></>}{post.listingDetails.minimumOrder && <><span>Minimum order</span><span className="text-right">{post.listingDetails.minimumOrder} {post.listingDetails.priceUnit}</span></>}</>}
              {'garmentType' in post.listingDetails && post.listingDetails.garmentType && <><span>Garment</span><span className="text-right">{post.listingDetails.garmentType}</span>{post.listingDetails.gender && <><span>Style</span><span className="text-right">{post.listingDetails.gender}</span></>}{post.listingDetails.fulfilment && <><span>Fulfilment</span><span className="text-right">{post.listingDetails.fulfilment.replace('_', ' ')}</span></>}{post.listingDetails.sizes?.length ? <><span>Sizes</span><span className="text-right">{post.listingDetails.sizes.join(', ')}</span></> : null}{post.listingDetails.leadTimeDays !== undefined && <><span>Lead time</span><span className="text-right">{post.listingDetails.leadTimeDays} days</span></>}{post.listingDetails.customizationOptions?.length ? <><span>Customization</span><span className="text-right">{post.listingDetails.customizationOptions.join(', ')}</span></> : null}</>}
              {post.stockQuantity !== null && post.stockQuantity !== undefined && <><span>Available quantity</span><span className="text-right">{post.stockQuantity}</span></>}
            </div>}
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => onInquire(post)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-3 text-xs font-bold text-neutral-950 transition-colors hover:bg-amber-300"><MessageCircle className="h-4 w-4" /> Inquire</button>
              <button type="button" onClick={() => onShare(post)} title="Share listing" aria-label="Share listing" className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border ${isDarkMode ? 'border-neutral-700 text-neutral-300 hover:bg-neutral-800' : 'border-neutral-300 text-neutral-700 hover:bg-neutral-100'}`}><Share2 className="h-4 w-4" /></button>
              <button type="button" onClick={() => { setIsReporting(open => !open); setReportMessage(null); }} title="Report listing" aria-label="Report listing" className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border ${isDarkMode ? 'border-neutral-700 text-neutral-300 hover:bg-neutral-800' : 'border-neutral-300 text-neutral-700 hover:bg-neutral-100'}`}><Flag className="h-4 w-4" /></button>
            </div>
            {isReporting && <form onSubmit={reportListing} className="mt-4 space-y-2 border-t border-neutral-800/60 pt-4">
              <label className="block text-xs font-semibold">Report reason<select value={reportReason} onChange={event => setReportReason(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs"><option>Misleading content</option><option>Prohibited item</option><option>Impersonation</option><option>Inappropriate content</option><option>Other</option></select></label>
              <textarea value={reportDetails} onChange={event => setReportDetails(event.target.value)} maxLength={1000} rows={3} placeholder="Additional context (optional)" className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs" />
              <button type="submit" className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-neutral-950">Send report</button>
            </form>}
            {reportMessage && <p role="status" className="mt-3 text-xs text-amber-400">{reportMessage}</p>}
          </div>

          {seller && <div className={`rounded-2xl border p-4 ${surface}`}>
            <button type="button" onClick={() => onSelectSeller(seller)} className="flex w-full items-center gap-3 text-left">
              {seller.avatarUrl && !sellerAvatarUnavailable ? <img src={seller.avatarUrl} alt="" onError={() => setSellerAvatarUnavailable(true)} className="h-11 w-11 rounded-full object-cover" /> : <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/15 text-sm font-bold text-amber-500">{seller.name.slice(0, 2).toUpperCase()}</span>}
              <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{seller.shopName || seller.name}</strong><small className={`mt-0.5 block truncate text-[10px] ${muted}`}>{seller.handle} · {getRoleLabel(seller.role)}</small></span>
              <ArrowRight className="h-4 w-4 shrink-0 text-amber-500" />
            </button>
            <div className="mt-4 flex items-center justify-between border-t border-neutral-800/60 pt-3"><h2 className="text-xs font-bold">{sameSeller.length ? 'More from this seller' : 'Explore this seller'}</h2><button type="button" onClick={() => onSelectSeller(seller)} className="text-[10px] font-semibold text-amber-500 hover:text-amber-300">View collection</button></div>
            {sameSeller.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2">{sameSeller.slice(0, 2).map(renderRelatedCard)}</div>}
          </div>}
        </aside>
      </section>


      {isImageExpanded && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3 backdrop-blur-md sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={`Full-screen image: ${post.imageAlt || post.title}`}
          onClick={() => setIsImageExpanded(false)}
        >
          <button
            type="button"
            onClick={() => setIsImageExpanded(false)}
            aria-label="Close full-screen image"
            className="absolute right-4 top-4 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white shadow-lg transition hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="h-full max-h-[92vh] w-full max-w-[96vw]" onClick={event => event.stopPropagation()}>
            <PostImage
              src={selectedImageUrl || post.imageUrl}
              alt={post.imageAlt || post.title}
              className="h-full w-full rounded-xl"
              imageClassName="max-h-[92vh] cursor-zoom-out"
              loading="eager"
            />
          </div>
        </div>
      )}

      {fromOtherSellers.length > 0 && <section className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-3 border-b border-amber-500/15 pb-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-500">Selected by shared tags</p><h2 className="mt-1 font-serif text-2xl font-bold">Related pieces</h2></div><span className={`text-xs ${muted}`}>{fromOtherSellers.length} match{fromOtherSellers.length === 1 ? '' : 'es'}</span></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{fromOtherSellers.map(renderRelatedCard)}</div>
      </section>}
    </main>
  );
};