import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, X, ChevronLeft, ChevronRight, LoaderCircle, Trash2, Eye, Heart, Send, Play } from 'lucide-react';
import { TailorStory, User } from '../types';
import { api } from '../services/api';

interface StoryRailProps {
  users: User[];
  currentUser: User | null;
  isDarkMode: boolean;
  onOpenPlans: () => void;
  onSelectSeller: (user: User) => void;
}

export function StoryRail({ users, currentUser, isDarkMode, onOpenPlans, onSelectSeller }: StoryRailProps) {
  const [stories, setStories] = useState<TailorStory[]>([]);
  const [activeTailorId, setActiveTailorId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [draftUrl, setDraftUrl] = useState('');
  const [draftCaption, setDraftCaption] = useState('');
  const [uploadError, setUploadError] = useState('');
  const storyFileInputRef = useRef<HTMLInputElement>(null);
  const userById = useMemo(() => new Map(users.map(user => [user.id, user])), [users]);

  const loadStories = () => {
    api.getStories().then(setStories).catch(() => setStories([]));
  };

  useEffect(loadStories, []);

  useEffect(() => {
    const openStoryPicker = () => storyFileInputRef.current?.click();
    window.addEventListener('atelier_open_story_composer', openStoryPicker);
    return () => window.removeEventListener('atelier_open_story_composer', openStoryPicker);
  }, []);

  useEffect(() => () => {
    if (draftUrl) URL.revokeObjectURL(draftUrl);
  }, [draftUrl]);

  const groupedStories = useMemo(() => {
    const groups = new Map<string, TailorStory[]>();
    [...stories]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .forEach(story => groups.set(story.tailorId, [...(groups.get(story.tailorId) || []), story]));
    return [...groups.entries()].filter(([tailorId]) => {
      const user = userById.get(tailorId);
      const isPromotedTailor = user?.role === 'tailor' && user.isPromoted && (!user.promotionExpiresAt || new Date(user.promotionExpiresAt).getTime() > Date.now());
      return isPromotedTailor || user?.role === 'admin';
    });
  }, [stories, userById]);

  const canAddStory = currentUser?.role === 'admin'
    || (currentUser?.role === 'tailor'
      && currentUser.isPromoted
      && (!currentUser.promotionExpiresAt || new Date(currentUser.promotionExpiresAt).getTime() > Date.now()));
  const activeIndex = activeTailorId ? groupedStories.findIndex(([tailorId]) => tailorId === activeTailorId) : -1;
  const activeStories = activeTailorId ? groupedStories.find(([tailorId]) => tailorId === activeTailorId)?.[1] || [] : [];
  const openComposer = (file: File) => {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return;
    if (draftUrl) URL.revokeObjectURL(draftUrl);
    setDraftFile(file);
    setDraftUrl(URL.createObjectURL(file));
    setDraftCaption('');
  };
  const uploadStory = async () => {
    if (!draftFile) return;
    setUploading(true);
    setUploadError('');
    try {
      await api.createStory(draftFile, draftCaption);
      setDraftFile(null);
      setDraftUrl('');
      loadStories();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'The story could not be published.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {(currentUser?.role === 'tailor' || groupedStories.length > 0) && (
      <section aria-label="Tailor stories" className={`overflow-hidden rounded-2xl border px-3 pb-3 pt-2.5 sm:px-4 ${isDarkMode ? 'border-amber-400/15 bg-[#111214]' : 'border-amber-200 bg-white shadow-sm'}`}>
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-amber-300 via-orange-400 to-amber-600 text-neutral-950 shadow-[0_6px_18px_rgba(245,158,11,.28)]"><Play className="h-4 w-4 fill-current" /></span>
            <div className="min-w-0">
              <h2 className="font-serif text-sm font-bold leading-tight">Stories</h2>
              <p className={`text-[9px] ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>Discover looks from verified merchants</p>
            </div>
          </div>
          {(currentUser?.role === 'tailor' || currentUser?.role === 'admin') && (
            canAddStory ? (
              <button type="button" onClick={() => storyFileInputRef.current?.click()} className="shrink-0 rounded-full bg-gradient-to-r from-amber-300 to-orange-500 px-3 py-1.5 text-[10px] font-extrabold text-neutral-950"><Plus className="mr-1 inline h-3 w-3" strokeWidth={3} />Post a story</button>
            ) : (
              <button type="button" onClick={onOpenPlans} className="shrink-0 rounded-full border border-amber-400/30 px-3 py-1.5 text-[10px] font-bold text-amber-500">Unlock stories</button>
            )
          )}
        </div>
        <input ref={storyFileInputRef} className="hidden" aria-label="Add a story" type="file" accept="image/*,video/*" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; if (file) openComposer(file); event.target.value = ''; }} />
        <div className="flex snap-x gap-3.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:gap-4">
          {groupedStories.map(([tailorId, tailorStories]) => {
            const tailor = userById.get(tailorId);
            return (
              <button key={tailorId} type="button" onClick={() => setActiveTailorId(tailorId)} className="flex min-w-[76px] flex-col items-center gap-1.5">
                <span className="rounded-full bg-gradient-to-tr from-amber-300 via-orange-500 to-red-500 p-[3px] shadow-[0_9px_22px_rgba(245,158,11,.18)]">
                  <span className={`block h-[62px] w-[62px] overflow-hidden rounded-full border-[3px] bg-neutral-950 ${isDarkMode ? 'border-neutral-950' : 'border-white'}`}>
                    {tailorStories[0].mediaType === 'video'
                      ? <video src={tailorStories[0].thumbnailUrl || tailorStories[0].mediaUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                      : <img src={tailorStories[0].mediaUrl} alt="" className="h-full w-full object-cover" />}
                  </span>
                </span>
                <span className="w-[76px] truncate text-[10px] font-bold">@{tailor?.handle || tailor?.shopName || tailor?.name || 'merchant'}</span>
              </button>
            );
          })}
        </div>
      </section>
      )}

      <AnimatePresence>
        {activeTailorId && activeStories.length > 0 && (
          <StoryViewer
            stories={activeStories}
            tailor={userById.get(activeTailorId)}
            owner={currentUser?.id === activeTailorId}
            onDelete={async storyId => {
              await api.deleteStory(storyId);
              loadStories();
              setActiveTailorId(null);
            }}
            onAdd={() => storyFileInputRef.current?.click()}
            onClose={() => setActiveTailorId(null)}
            onPrevious={() => setActiveTailorId(groupedStories[Math.max(0, activeIndex - 1)]?.[0] || null)}
            onNext={() => setActiveTailorId(groupedStories[Math.min(groupedStories.length - 1, activeIndex + 1)]?.[0] || null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {draftFile && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110] flex items-end justify-center bg-black/75 sm:items-center">
            <motion.div initial={{ y: 40 }} animate={{ y: 0 }} className="max-h-[96dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] bg-neutral-950 text-white sm:rounded-[28px]">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div><p className="text-[9px] font-bold uppercase tracking-[.18em] text-amber-400">New story</p><h2 className="font-serif text-lg font-bold">Preview & compose</h2></div>
                <button type="button" aria-label="Close composer" onClick={() => { setDraftFile(null); setDraftUrl(''); }}><X className="h-5 w-5" /></button>
              </div>
              <div className="relative mx-4 mt-4 aspect-[9/16] max-h-[54dvh] overflow-hidden rounded-2xl bg-black">
                {draftFile.type.startsWith('video/')
                  ? <video src={draftUrl} controls playsInline className="h-full w-full object-contain" />
                  : <img src={draftUrl} alt="Story preview" className="h-full w-full object-contain" />}
                {draftCaption && <p className="absolute bottom-5 left-5 right-5 rounded-xl bg-black/55 px-3 py-2 text-center text-sm font-semibold backdrop-blur">{draftCaption}</p>}
              </div>
              <div className="px-4 py-4">
                <textarea value={draftCaption} onChange={event => setDraftCaption(event.target.value.slice(0, 280))} rows={3} placeholder="Add a message to your story..." className="mt-4 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none focus:border-amber-400" />
                {uploadError && <p role="alert" className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{uploadError}</p>}
                <button type="button" disabled={uploading} onClick={() => void uploadStory()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-neutral-950 disabled:opacity-60"><Send className="h-4 w-4" />{uploading ? 'Publishing...' : 'Share story'}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function PromotedTailorRail({ users, isDarkMode, onSelectSeller }: {
  users: User[];
  isDarkMode: boolean;
  onSelectSeller: (user: User) => void;
}) {
  const promotedTailors = users.filter(user =>
    user.role === 'tailor'
    && !user.isBlocked
    && user.isPromoted
    && (!user.promotionExpiresAt || new Date(user.promotionExpiresAt).getTime() > Date.now()),
  );
  if (!promotedTailors.length) return null;

  return (
    <section aria-label="Promoted tailors" className={`col-span-full rounded-2xl border px-3 py-3 ${isDarkMode ? 'border-amber-500/20 bg-[#121316]/90' : 'border-amber-200 bg-white shadow-sm'}`}>
      <div className="mb-3 flex items-center justify-between px-1">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-500">Featured ateliers</p>
          <h2 className="text-sm font-serif font-bold">Promoted Tailors</h2>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
        {promotedTailors.map(tailor => (
          <button key={tailor.id} type="button" onClick={() => onSelectSeller(tailor)} className="flex min-w-[76px] flex-col items-center gap-1.5">
            <span className="rounded-full bg-gradient-to-tr from-amber-300 via-orange-500 to-yellow-200 p-[2px] shadow-[0_8px_20px_rgba(245,158,11,.18)]">
              <span className="block rounded-full border-2 border-neutral-950 bg-neutral-900 p-[2px]">
                {tailor.avatarUrl
                  ? <img src={tailor.avatarUrl} alt={`${tailor.shopName || tailor.name} profile`} className="h-[58px] w-[58px] rounded-full object-cover" />
                  : <span className="grid h-[58px] w-[58px] place-items-center rounded-full bg-neutral-800 text-lg font-black text-amber-300">{(tailor.shopName || tailor.name || 'T').slice(0, 1).toUpperCase()}</span>}
              </span>
            </span>
            <span className="w-[76px] truncate text-[10px] font-semibold">{tailor.shopName || tailor.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function StoryViewer({ stories, tailor, owner, onDelete, onAdd, onClose, onPrevious, onNext }: {
  stories: TailorStory[];
  tailor?: User;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  owner: boolean;
  onDelete: (storyId: string) => Promise<void>;
  onAdd: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const story = stories[activeIndex];
  useEffect(() => {
    setIsPaused(false);
    void api.recordStoryView(story.id).catch(() => undefined);
  }, [story.id]);
  useEffect(() => {
    if (isPaused || story.mediaType === 'video') return;
    const timer = window.setTimeout(() => move(1), 7000);
    return () => window.clearTimeout(timer);
  }, [activeIndex, isPaused, story.mediaType, story.id]);
  const move = (direction: number) => {
    if (direction < 0 && activeIndex > 0) setActiveIndex(index => index - 1);
    else if (direction > 0 && activeIndex < stories.length - 1) setActiveIndex(index => index + 1);
    else direction < 0 ? onPrevious() : onNext();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-start justify-center bg-black/95 px-0 pt-[12dvh] sm:px-6 sm:pt-[14dvh]" role="dialog" aria-modal="true">
      <div className="relative aspect-[16/10] w-full max-h-[68dvh] overflow-hidden bg-neutral-950 shadow-[0_24px_80px_rgba(0,0,0,.65)] sm:max-w-[980px] sm:rounded-2xl">
        <div className="absolute left-3 right-3 top-3 z-20 flex gap-1">
          {stories.map((item, index) => <span key={item.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/35"><span className={`block h-full bg-gradient-to-r from-amber-300 via-orange-400 to-red-500 shadow-[0_0_8px_rgba(251,191,36,.8)] ${index < activeIndex ? 'w-full' : index === activeIndex ? 'animate-[story-progress_8s_linear_forwards]' : 'w-0'}`}></span></span>)}
        </div>
        {story.mediaType === 'video'
          ? <video key={story.id} src={story.mediaUrl} poster={story.thumbnailUrl} autoPlay playsInline controls={false} className="h-full w-full object-cover" onEnded={() => move(1)} />
          : <img key={story.id} src={story.mediaUrl} alt={`${tailor?.shopName || tailor?.name || 'Tailor'} story`} className="h-full w-full object-cover" />}
        <div className="absolute inset-x-0 top-7 z-20 flex items-center gap-3 px-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-amber-300 bg-neutral-900 text-xs font-bold text-amber-300">
            {tailor?.avatarUrl
              ? <img src={tailor.avatarUrl} alt="" className="h-full w-full object-cover" />
              : (tailor?.shopName || tailor?.name || '@').slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-white drop-shadow">@{tailor?.handle || tailor?.shopName || tailor?.name || 'merchant'}</span>
          <button type="button" aria-label="Close story" onClick={onClose} className="rounded-full border border-white/10 bg-black/45 p-2 text-amber-300 backdrop-blur-md"><X className="h-5 w-5" /></button>
        </div>
        {story.caption && <p className="absolute bottom-24 left-5 right-5 z-20 rounded-xl bg-black/55 px-3 py-2 text-center text-sm font-semibold text-white backdrop-blur">{story.caption}</p>}
        {owner && (
          <div className="absolute bottom-6 left-3 right-3 z-30 flex items-center gap-2 rounded-2xl border border-white/10 bg-neutral-950/95 p-2.5 text-white shadow-2xl backdrop-blur-md sm:left-4 sm:right-4 sm:p-3">
            <span className="flex items-center gap-1.5 text-xs"><Eye className="h-4 w-4 text-amber-400" />{story.viewCount} views</span>
            <span className="flex items-center gap-1.5 text-xs"><Heart className="h-4 w-4 text-rose-400" />{story.likeCount}</span>
            <button type="button" onClick={() => void onDelete(story.id)} className="ml-auto rounded-lg bg-red-500/15 p-2 text-red-300" aria-label="Delete story"><Trash2 className="h-4 w-4" /></button>
            <button type="button" onClick={onAdd} className="rounded-lg bg-gradient-to-r from-amber-300 to-orange-500 px-3 py-2 text-xs font-bold text-neutral-950">Add another</button>
          </div>
        )}
        {!owner && (
          <button type="button" onClick={() => {
            void api.toggleStoryLike(story.id).then(result => {
              story.likeCount = result.likeCount;
              story.likedByViewer = result.isLiked;
            }).catch(() => undefined);
          }} className={`absolute bottom-8 right-5 z-30 grid h-12 w-12 place-items-center rounded-full backdrop-blur ${story.likedByViewer ? 'bg-rose-500 text-white' : 'bg-black/50 text-white'}`} aria-label="Like story">
            <Heart className="h-5 w-5" fill={story.likedByViewer ? 'currentColor' : 'none'} />
          </button>
        )}
        <button type="button" aria-label="Previous story" onClick={() => move(-1)} className="absolute left-2 top-1/2 z-40 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur sm:left-4 sm:h-12 sm:w-12"><ChevronLeft className="h-5 w-5" /></button>
        <button type="button" aria-label="Next story" onClick={() => move(1)} className="absolute right-2 top-1/2 z-40 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur sm:right-4 sm:h-12 sm:w-12"><ChevronRight className="h-5 w-5" /></button>
        <button type="button" aria-label={isPaused ? 'Resume story' : 'Pause story'} onClick={() => setIsPaused(paused => !paused)} className="absolute bottom-3 left-1/2 z-40 -translate-x-1/2 rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-[10px] font-bold text-white backdrop-blur sm:bottom-4">{isPaused ? 'Play' : 'Pause'}</button>
      </div>
      <style>{`@keyframes story-progress { from { width: 0%; } to { width: 100%; } }`}</style>
    </motion.div>
  );
}
