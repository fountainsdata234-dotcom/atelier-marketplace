import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, X, ChevronLeft, ChevronRight, LoaderCircle, Trash2, Eye, Heart, Send } from 'lucide-react';
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
  const userById = useMemo(() => new Map(users.map(user => [user.id, user])), [users]);

  const loadStories = () => {
    api.getStories().then(setStories).catch(() => setStories([]));
  };

  useEffect(loadStories, []);

  useEffect(() => () => {
    if (draftUrl) URL.revokeObjectURL(draftUrl);
  }, [draftUrl]);

  const groupedStories = useMemo(() => {
    const groups = new Map<string, TailorStory[]>();
    stories.forEach(story => groups.set(story.tailorId, [...(groups.get(story.tailorId) || []), story]));
    return [...groups.entries()].filter(([tailorId]) => {
      const user = userById.get(tailorId);
      return user?.role === 'tailor' && user.isPromoted && (!user.promotionExpiresAt || new Date(user.promotionExpiresAt).getTime() > Date.now());
    });
  }, [stories, userById]);

  const canAddStory = currentUser?.role === 'tailor'
    && currentUser.isPromoted
    && (!currentUser.promotionExpiresAt || new Date(currentUser.promotionExpiresAt).getTime() > Date.now());
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
    try {
      await api.createStory(draftFile, draftCaption);
      setDraftFile(null);
      setDraftUrl('');
      loadStories();
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {(currentUser?.role === 'tailor' || groupedStories.length > 0) && (
      <section aria-label="Tailor stories" className={`overflow-hidden rounded-2xl px-3 py-2 ${groupedStories.length > 0 || currentUser ? 'border border-transparent' : ''}`}>
        <div className="flex gap-4 overflow-x-auto [scrollbar-width:none]">
          {currentUser?.role === 'tailor' && (
            <div className="flex min-w-[68px] flex-col items-center gap-1.5 text-center">
              <span className={`relative grid h-[62px] w-[62px] place-items-center rounded-full border-2 ${canAddStory ? 'border-amber-400' : 'border-neutral-500/60'} bg-neutral-900`}>
                {uploading ? <LoaderCircle className="h-5 w-5 animate-spin text-amber-400" /> : (
                  currentUser.avatarUrl
                    ? <img src={currentUser.avatarUrl} alt="" className="h-full w-full rounded-full object-cover opacity-90" />
                    : <span className="text-lg font-black text-amber-300">{(currentUser.shopName || currentUser.name || 'T').slice(0, 1).toUpperCase()}</span>
                )}
                {canAddStory && <input className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Add a story" type="file" accept="image/*,video/*" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; if (file) openComposer(file); event.target.value = ''; }} />}
                {!canAddStory && <button type="button" aria-label="Choose a promotion plan to add a story" className="absolute inset-0 rounded-full" onClick={onOpenPlans} />}
                <span className="absolute bottom-0 right-0 grid h-6 w-6 place-items-center rounded-full border-2 border-neutral-950 bg-amber-400 text-neutral-950"><Plus className="h-4 w-4" strokeWidth={3} /></span>
              </span>
              <span className="w-[68px] truncate text-[11px] font-semibold">Add story</span>
            </div>
          )}
          {groupedStories.map(([tailorId, tailorStories]) => {
            const tailor = userById.get(tailorId);
            return (
              <button key={tailorId} type="button" onClick={() => setActiveTailorId(tailorId)} className="flex min-w-[68px] flex-col items-center gap-1.5">
                <span className="rounded-full bg-gradient-to-tr from-amber-300 via-orange-500 to-fuchsia-500 p-[2px]">
                  <span className="block rounded-full border-2 border-neutral-950 bg-neutral-900 p-[2px]">
                    {tailor?.avatarUrl
                      ? <img src={tailor.avatarUrl} alt="" className="h-[54px] w-[54px] rounded-full object-cover" />
                      : <span className="grid h-[54px] w-[54px] place-items-center rounded-full bg-neutral-800 text-lg font-black text-amber-300">{(tailor?.shopName || tailor?.name || 'T').slice(0, 1).toUpperCase()}</span>}
                  </span>
                </span>
                <span className="w-[68px] truncate text-[11px] font-semibold">{tailor?.shopName || tailor?.name || 'Tailor'}</span>
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
            onAdd={() => document.querySelector<HTMLInputElement>('input[aria-label="Add a story"]')?.click()}
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
  const story = stories[activeIndex];
  useEffect(() => {
    void api.recordStoryView(story.id).catch(() => undefined);
  }, [story.id]);
  const move = (direction: number) => {
    if (direction < 0 && activeIndex > 0) setActiveIndex(index => index - 1);
    else if (direction > 0 && activeIndex < stories.length - 1) setActiveIndex(index => index + 1);
    else direction < 0 ? onPrevious() : onNext();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black" role="dialog" aria-modal="true">
      <div className="relative h-[100dvh] w-full max-w-[430px] overflow-hidden bg-neutral-950">
        <div className="absolute left-3 right-3 top-3 z-20 flex gap-1">
          {stories.map((item, index) => <span key={item.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/35"><span className={`block h-full bg-white ${index < activeIndex ? 'w-full' : index === activeIndex ? 'animate-[story-progress_8s_linear_forwards]' : 'w-0'}`} /></span>)}
        </div>
        {story.mediaType === 'video'
          ? <video key={story.id} src={story.mediaUrl} poster={story.thumbnailUrl} autoPlay playsInline controls={false} className="h-full w-full object-contain" onEnded={() => move(1)} />
          : <img key={story.id} src={story.mediaUrl} alt={`${tailor?.shopName || tailor?.name || 'Tailor'} story`} className="h-full w-full object-contain" />}
        <div className="absolute inset-x-0 top-7 z-20 flex items-center gap-3 px-4">
          <span className="h-9 w-9 overflow-hidden rounded-full bg-neutral-800">{tailor?.avatarUrl && <img src={tailor.avatarUrl} alt="" className="h-full w-full object-cover" />}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{tailor?.shopName || tailor?.name || 'Tailor'}</span>
          <button type="button" aria-label="Close story" onClick={onClose} className="rounded-full bg-black/40 p-2 text-white"><X className="h-5 w-5" /></button>
        </div>
        {story.caption && <p className="absolute bottom-24 left-5 right-5 z-20 rounded-xl bg-black/55 px-3 py-2 text-center text-sm font-semibold text-white backdrop-blur">{story.caption}</p>}
        {owner && (
          <div className="absolute bottom-6 left-4 right-4 z-30 flex items-center gap-2 rounded-2xl bg-neutral-950/90 p-3 text-white backdrop-blur">
            <span className="flex items-center gap-1.5 text-xs"><Eye className="h-4 w-4 text-amber-400" />{story.viewCount} views</span>
            <span className="flex items-center gap-1.5 text-xs"><Heart className="h-4 w-4 text-rose-400" />{story.likeCount}</span>
            <button type="button" onClick={() => void onDelete(story.id)} className="ml-auto rounded-lg bg-red-500/15 p-2 text-red-300" aria-label="Delete story"><Trash2 className="h-4 w-4" /></button>
            <button type="button" onClick={onAdd} className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-neutral-950">Add another</button>
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
        <button type="button" aria-label="Previous story" onClick={() => move(-1)} className="absolute inset-y-20 left-0 w-[38%]"><ChevronLeft className="sr-only" /></button>
        <button type="button" aria-label="Next story" onClick={() => move(1)} className="absolute inset-y-20 right-0 w-[38%]"><ChevronRight className="sr-only" /></button>
      </div>
      <style>{`@keyframes story-progress { from { width: 0%; } to { width: 100%; } }`}</style>
    </motion.div>
  );
}
