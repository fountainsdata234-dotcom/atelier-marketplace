import React, { useEffect, useMemo } from 'react';
import { ArrowLeft, ArrowRight, MapPin, MessageCircle, Share2, Star } from 'lucide-react';
import { ClothPost, User } from '../types';
import { getRoleLabel } from '../utils/profile';

interface PostDetailPageProps {
  post: ClothPost | null;
  posts: ClothPost[];
  users: User[];
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
  isDarkMode,
  onBack,
  onSelectPost,
  onSelectSeller,
  onInquire,
  onShare,
  onView,
}) => {
  const seller = users.find(user => user.id === post?.authorId);
  const userById = useMemo(() => new Map(users.map(user => [user.id, user])), [users]);
  const postTags = useMemo(() => new Set((post?.tags || []).map(tag => tag.trim().toLowerCase()).filter(Boolean)), [post?.tags]);
  const visiblePosts = useMemo(() => posts.filter(item => !userById.get(item.authorId)?.isBlocked), [posts, userById]);
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
      || (b.post.rating || 0) - (a.post.rating || 0)
      || new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime())
    .slice(0, 6)
    .map(item => item.post), [visiblePosts, post?.authorId, post?.id, postTags]);

  useEffect(() => {
    if (post) onView(post);
  }, [post?.id]);

  const surface = isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white';
  const muted = isDarkMode ? 'text-neutral-400' : 'text-neutral-600';

  if (!post || !seller) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-amber-500"><ArrowLeft className="h-4 w-4" /> Back to marketplace</button>
        <p className={`mt-12 text-center text-sm ${muted}`}>This listing is no longer available.</p>
      </main>
    );
  }

  const location = [post.authorLocation.city, post.authorLocation.state, post.authorLocation.country].filter(Boolean).join(', ');

  const renderRelatedCard = (relatedPost: ClothPost) => (
    <button key={relatedPost.id} type="button" onClick={() => onSelectPost(relatedPost)} className={`group min-w-0 overflow-hidden rounded-xl border text-left transition-colors hover:border-amber-500/50 ${surface}`}>
      <div className="aspect-[4/3] overflow-hidden bg-neutral-900">
        <img src={relatedPost.imageUrl} alt={relatedPost.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]" />
      </div>
      <span className="block truncate px-3 pt-2.5 text-xs font-semibold">{relatedPost.title}</span>
      <span className={`block truncate px-3 pb-3 pt-1 text-[10px] ${muted}`}>{relatedPost.tags.slice(0, 2).map(tag => `#${tag}`).join(' ')}</span>
    </button>
  );

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-amber-500 hover:text-amber-300"><ArrowLeft className="h-4 w-4" /> Back to marketplace</button>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)] lg:items-start">
        <div className={`overflow-hidden rounded-2xl border ${surface}`}>
          <div className="flex min-h-[320px] items-center justify-center bg-neutral-950 sm:min-h-[480px] lg:min-h-[620px]">
            <img src={post.imageUrl} alt={post.title} fetchPriority="high" decoding="async" className="max-h-[78vh] w-full object-contain" />
          </div>
          {post.tags.length > 0 && <div className="flex flex-wrap gap-2 border-t border-neutral-800/60 p-4">{post.tags.map(tag => <span key={tag} className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-400">#{tag}</span>)}</div>}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <div className={`rounded-2xl border p-5 sm:p-6 ${surface}`}>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-500">{getRoleLabel(post.authorRole)}</p>
            <h1 className="mt-2 font-serif text-2xl font-bold sm:text-3xl">{post.title}</h1>
            <div className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs ${muted}`}>
              <span>{post.ratingCount ? <><Star className="mr-1 inline h-3.5 w-3.5 fill-amber-400 text-amber-400" />{post.rating?.toFixed(1)} ({post.ratingCount})</> : 'Not rated yet'}</span>
              {location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-amber-500" />{location}</span>}
            </div>
            <p className={`mt-5 whitespace-pre-line text-sm leading-relaxed ${muted}`}>{post.description || 'Contact the seller for details about this piece.'}</p>
            <div className="mt-5 flex items-center justify-between border-t border-neutral-800/60 pt-4 text-xs">
              <span className="font-bold uppercase tracking-wider text-amber-500">Price</span>
              <span>{post.pricing.basic > 0 ? `${post.pricing.currency || post.authorLocation.currency || 'USD'} ${post.pricing.basic}` : 'Negotiable'}</span>
            </div>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => onInquire(post)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-3 text-xs font-bold text-neutral-950 transition-colors hover:bg-amber-300"><MessageCircle className="h-4 w-4" /> Inquire</button>
              <button type="button" onClick={() => onShare(post)} title="Share listing" aria-label="Share listing" className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border ${isDarkMode ? 'border-neutral-700 text-neutral-300 hover:bg-neutral-800' : 'border-neutral-300 text-neutral-700 hover:bg-neutral-100'}`}><Share2 className="h-4 w-4" /></button>
            </div>
          </div>

          <div className={`rounded-2xl border p-4 ${surface}`}>
            <button type="button" onClick={() => onSelectSeller(seller)} className="flex w-full items-center gap-3 text-left">
              {seller.avatarUrl ? <img src={seller.avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" /> : <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/15 text-sm font-bold text-amber-500">{seller.name.slice(0, 2).toUpperCase()}</span>}
              <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{seller.shopName || seller.name}</strong><small className={`mt-0.5 block truncate text-[10px] ${muted}`}>{seller.handle} · {getRoleLabel(seller.role)}</small></span>
              <ArrowRight className="h-4 w-4 shrink-0 text-amber-500" />
            </button>
            <div className="mt-4 flex items-center justify-between border-t border-neutral-800/60 pt-3"><h2 className="text-xs font-bold">{sameSeller.length ? 'More from this seller' : 'Explore this seller'}</h2><button type="button" onClick={() => onSelectSeller(seller)} className="text-[10px] font-semibold text-amber-500 hover:text-amber-300">View collection</button></div>
            {sameSeller.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2">{sameSeller.slice(0, 2).map(renderRelatedCard)}</div>}
          </div>
        </aside>
      </section>

      {fromOtherSellers.length > 0 && <section className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-3 border-b border-amber-500/15 pb-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-500">Selected by shared tags</p><h2 className="mt-1 font-serif text-2xl font-bold">Related pieces</h2></div><span className={`text-xs ${muted}`}>{fromOtherSellers.length} match{fromOtherSellers.length === 1 ? '' : 'es'}</span></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{fromOtherSellers.map(renderRelatedCard)}</div>
      </section>}
    </main>
  );
};