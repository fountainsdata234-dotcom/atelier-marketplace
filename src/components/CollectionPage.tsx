import React, { useEffect, useMemo, useState } from 'react';
import { Bookmark, Download, Image as ImageIcon, Trash2, Sparkles, ShieldAlert } from 'lucide-react';
import { SavedPhoto, User } from '../types';
import { storageService } from '../services/storage';

interface CollectionPageProps {
  currentUser: User | null;
  isDarkMode: boolean;
}

export const CollectionPage: React.FC<CollectionPageProps> = ({ currentUser, isDarkMode }) => {
  const [savedPhotos, setSavedPhotos] = useState<SavedPhoto[]>([]);
  const [collectionState, setCollectionState] = useState({ freeSlots: 5, unlockedSlots: 5 });

  useEffect(() => {
    setSavedPhotos(storageService.getSavedPhotos());
    setCollectionState(storageService.getCollectionPackageState());

    const handleSavedPhotosUpdate = () => {
      setSavedPhotos(storageService.getSavedPhotos());
    };

    window.addEventListener('atelier_saved_photos_updated', handleSavedPhotosUpdate);
    return () => window.removeEventListener('atelier_saved_photos_updated', handleSavedPhotosUpdate);
  }, []);

  const canAddMore = savedPhotos.length < collectionState.unlockedSlots;

  const clearCollection = () => {
    storageService.saveSavedPhotos([]);
  };

  const unlockMoreSlots = () => {
    const nextUnlocked = Math.min(50, collectionState.unlockedSlots + 5);
    setCollectionState(storageService.updateCollectionPackageState(nextUnlocked));
  };

  useEffect(() => {
    if (currentUser && savedPhotos.length > collectionState.unlockedSlots) {
      setSavedPhotos(prev => prev.slice(0, collectionState.unlockedSlots));
    }
  }, [collectionState.unlockedSlots, currentUser, savedPhotos.length]);

  const details = useMemo(() => ({
    used: savedPhotos.length,
    remaining: Math.max(0, collectionState.unlockedSlots - savedPhotos.length),
    isGuest: !currentUser,
  }), [savedPhotos.length, collectionState.unlockedSlots, currentUser]);

  return (
    <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className={`rounded-3xl border p-5 sm:p-6 ${isDarkMode ? 'bg-[#121316] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-amber-500 font-semibold">
              <Bookmark className="w-3.5 h-3.5" />
              Saved Inspiration Hub
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold mt-2">Saved Images</h1>
            <p className={`mt-1 text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              Your personal saved-image archive. Keep inspiration references here, and use the collection slots to store the looks you want to revisit later.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className={`rounded-xl border px-3 py-2 ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-neutral-50 border-neutral-200'}`}>
              <span className="block text-[10px] uppercase tracking-wide text-neutral-400">Used</span>
              <span className="font-semibold text-amber-400">{details.used}</span>
            </div>
            <div className={`rounded-xl border px-3 py-2 ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-neutral-50 border-neutral-200'}`}>
              <span className="block text-[10px] uppercase tracking-wide text-neutral-400">Remaining</span>
              <span className="font-semibold text-emerald-400">{details.remaining}</span>
            </div>
            <button
              onClick={unlockMoreSlots}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-neutral-950 bg-gradient-to-r from-amber-400 to-amber-500"
            >
              Unlock +5 slots
            </button>
          </div>
        </div>
      </div>

      <div className={`rounded-3xl border p-4 sm:p-6 ${isDarkMode ? 'bg-[#121316] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Saved Images
          </div>

          {savedPhotos.length > 0 && (
            <button
              onClick={clearCollection}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {details.isGuest ? (
          <div className="rounded-2xl border border-dashed border-neutral-700 p-8 text-center text-xs text-neutral-400">
            Sign in to save garments and build your personal collection.
          </div>
        ) : savedPhotos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-700 p-8 text-center space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <ImageIcon className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-serif font-bold">No saved designs yet</h2>
            <p className={`text-xs max-w-md mx-auto ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              Save images from the marketplace and this collection page becomes your inspiration archive.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {savedPhotos.map((photo) => (
              <div key={photo.id} className={`overflow-hidden rounded-2xl border ${isDarkMode ? 'border-neutral-800 bg-neutral-950/40' : 'border-neutral-200 bg-neutral-50'}`}>
                <img src={photo.url} alt={photo.title} className="h-56 w-full object-cover" />
                <div className="p-3 space-y-3">
                  <div>
                    <p className="text-xs font-semibold truncate">{photo.title}</p>
                    <p className="text-[10px] text-neutral-400 mt-1">
                      Saved {new Date(photo.savedAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={photo.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center text-[10px] font-semibold text-amber-300"
                    >
                      <span className="inline-flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> Open</span>
                    </a>
                    <button
                      onClick={() => storageService.removeSavedPhoto(photo.id)}
                      className="rounded-xl border border-red-500/40 bg-red-500/10 p-2 text-red-400"
                      title="Remove saved photo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`rounded-3xl border p-4 sm:p-5 ${isDarkMode ? 'bg-[#121316] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          Monetization & Ads Flow
        </div>
        <p className={`mt-2 text-xs leading-relaxed ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
          For a real production setup, the cleanest path is to offer 5 free collection slots, then unlock extra storage through a low-friction paid plan or ad-supported booster. You can integrate Monetag, AdSense, or a custom rewarded-video offer wall later without changing the UI structure.
        </p>
      </div>
    </div>
  );
};
