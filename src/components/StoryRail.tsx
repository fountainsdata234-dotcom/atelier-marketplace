import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, X, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react';
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
  const userById = useMemo(() => new Map(users.map(user => [user.id, user])), [users]);

  const loadStories = () => {
    api.getStories().then(setStories).catch(() => setStories([]));
  };

  useEffect(loadStories, []);

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
  const promotedTailors = users.filter(user =>
    user.role === 'tailor'
    && !user.isBlocked
    && user.isPromoted
    && (!user.promotionExpiresAt || new Date(user.promotionExpiresAt).getTime() > Date.now()),
  );

  const uploadStory = async (file: File) => {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return;
    setUploading(true);
    try {
      await api.createStory(file);
      loadStories();
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {promotedTailors.length > 0 && (
        <section aria-label="Promoted tailors" className={`rounded-2xl border px-3 py-3 ${isDarkMode ? 'border-amber-500/20 bg-[#121316]/90' : 'border-amber-200 bg-white shadow-sm'}`}>
          <div className="mb-3 flex items-center justify-between px-1">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-500">Featured ateliers</p>
              <h2 className="text-sm font-serif font-bold">Promoted Tailors</h2>
            </div>
            <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-amber-500">Discover</span>
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
      )}
      <section aria-label="Tailor stories" className={`overflow-hidden rounded-2xl border px-3 py-3 ${isDarkMode ? 'border-neutral-800 bg-[#121316]/90' : 'border-neutral-200 bg-white shadow-sm'}`}>
        <div className="flex gap-4 overflow-x-auto [scrollbar-width:none]">
          {currentUser?.role === 'tailor' && (
            <div className="flex min-w-[68px] flex-col items-center gap-1.5 text-center">
              <span className={`relative grid h-[62px] w-[62px] place-items-center rounded-full border-2 ${canAddStory ? 'border-amber-400' : 'border-neutral-500/60'} bg-neutral-900`}>
                {uploading ? <LoaderCircle className="h-5 w-5 animate-spin text-amber-400" /> : (
                  currentUser.avatarUrl
                    ? <img src={currentUser.avatarUrl} alt="" className="h-full w-full rounded-full object-cover opacity-90" />
                    : <span className="text-lg font-black text-amber-300">{(currentUser.shopName || currentUser.name || 'T').slice(0, 1).toUpperCase()}</span>
                )}
                {canAddStory && <input className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Add a story" type="file" accept="image/*,video/*" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadStory(file); event.target.value = ''; }} />}
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

      <AnimatePresence>
        {activeTailorId && activeStories.length > 0 && (
          <StoryViewer
            stories={activeStories}
            tailor={userById.get(activeTailorId)}
            onClose={() => setActiveTailorId(null)}
            onPrevious={() => setActiveTailorId(groupedStories[Math.max(0, activeIndex - 1)]?.[0] || null)}
            onNext={() => setActiveTailorId(groupedStories[Math.min(groupedStories.length - 1, activeIndex + 1)]?.[0] || null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function StoryViewer({ stories, tailor, onClose, onPrevious, onNext }: {
  stories: TailorStory[];
  tailor?: User;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const story = stories[activeIndex];
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
        <button type="button" aria-label="Previous story" onClick={() => move(-1)} className="absolute inset-y-20 left-0 w-[38%]"><ChevronLeft className="sr-only" /></button>
        <button type="button" aria-label="Next story" onClick={() => move(1)} className="absolute inset-y-20 right-0 w-[38%]"><ChevronRight className="sr-only" /></button>
      </div>
      <style>{`@keyframes story-progress { from { width: 0%; } to { width: 100%; } }`}</style>
    </motion.div>
  );
}
