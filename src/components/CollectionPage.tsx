import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Download, Image as ImageIcon, Trash2, Sparkles, ShieldAlert, Plus, X, Layers, Upload, CheckCircle2 } from 'lucide-react';
import { SavedPhoto, SellerCollection, User } from '../types';
import { storageService } from '../services/storage';
import { uploadUserImage } from '../services/firebase';

interface CollectionUploadItem {
  id: string;
  name: string;
  preview: string;
  status: 'queued' | 'uploading' | 'done' | 'error';
  url?: string;
  error?: string;
}

interface CollectionPageProps {
  currentUser: User | null;
  isDarkMode: boolean;
}

export const CollectionPage: React.FC<CollectionPageProps> = ({ currentUser, isDarkMode }) => {
  const [savedPhotos, setSavedPhotos] = useState<SavedPhoto[]>([]);
  const [sellerCollections, setSellerCollections] = useState<SellerCollection[]>([]);
  const [collectionState, setCollectionState] = useState({ freeSlots: 5, unlockedSlots: 5 });
  const [collectionTitle, setCollectionTitle] = useState('');
  const [collectionDescription, setCollectionDescription] = useState('');
  const [collectionImages, setCollectionImages] = useState<string[]>(['']);
  const [collectionStatus, setCollectionStatus] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<CollectionUploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSavedPhotos(storageService.getSavedPhotos());
    setSellerCollections(storageService.getSellerCollections(currentUser?.id));
    setCollectionState(storageService.getCollectionPackageState());

    const handleSavedPhotosUpdate = () => {
      setSavedPhotos(storageService.getSavedPhotos());
    };
    const handleCollectionsUpdate = () => setSellerCollections(storageService.getSellerCollections(currentUser?.id));

    window.addEventListener('atelier_saved_photos_updated', handleSavedPhotosUpdate);
    window.addEventListener('atelier_collections_updated', handleCollectionsUpdate);
    return () => {
      window.removeEventListener('atelier_saved_photos_updated', handleSavedPhotosUpdate);
      window.removeEventListener('atelier_collections_updated', handleCollectionsUpdate);
    };
  }, [currentUser?.id]);

  const collectionLimit = currentUser?.isPromoted ? 50 : collectionState.unlockedSlots;
  const canAddMore = savedPhotos.length < collectionLimit;

  const clearCollection = () => {
    storageService.saveSavedPhotos([]);
  };

  const unlockMoreSlots = () => {
    const nextUnlocked = Math.min(50, collectionState.unlockedSlots + 5);
    setCollectionState(storageService.updateCollectionPackageState(nextUnlocked));
  };

  useEffect(() => {
    if (currentUser && !currentUser.isPromoted && savedPhotos.length > collectionLimit) {
      setSavedPhotos(prev => prev.slice(0, collectionLimit));
    }
  }, [collectionLimit, currentUser, savedPhotos.length]);

  const details = useMemo(() => ({
    used: savedPhotos.length,
    remaining: Math.max(0, collectionLimit - savedPhotos.length),
    isGuest: !currentUser,
  }), [savedPhotos.length, collectionLimit, currentUser]);

  const canCreateSellerCollection = currentUser?.role === 'tailor' || currentUser?.role === 'fabric_seller';
  const sellerCollectionLimit = currentUser?.isPromoted ? 50 : 3;
  const addCollectionImage = () => setCollectionImages(images => images.length >= 12 ? images : [...images, '']);
  const updateCollectionImage = (index: number, value: string) => setCollectionImages(images => images.map((image, imageIndex) => imageIndex === index ? value : image));
  const removeCollectionImage = (index: number) => setCollectionImages(images => images.filter((_, imageIndex) => imageIndex !== index));

  const handleQueuedUploads = async (incomingFiles: File[]) => {
    if (!currentUser) {
      setCollectionStatus('Sign in to upload collection photos.');
      return;
    }

    const validFiles = incomingFiles.filter((file) => file.type.startsWith('image/'));
    if (!validFiles.length) {
      setCollectionStatus('Choose valid image files for your collection.');
      return;
    }

    const activeImages = new Set(collectionImages.filter(Boolean));
    const existingUploads = uploadQueue.filter((item) => item.status === 'done' && item.url).map((item) => item.url as string);
    const totalUsed = activeImages.size + existingUploads.length;
    const remainingSlots = Math.max(0, 12 - totalUsed);
    if (remainingSlots <= 0) {
      setCollectionStatus('This collection is already full. Remove an image or start a new one.');
      return;
    }

    const selectedFiles = validFiles.slice(0, remainingSlots);
    const nextQueue: CollectionUploadItem[] = selectedFiles.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: file.name,
      preview: URL.createObjectURL(file),
      status: 'queued',
    }));

    setUploadQueue((previous) => [...previous, ...nextQueue]);
    setIsUploading(true);
    setCollectionStatus('Uploading your collection photos...');

    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index];
      const item = nextQueue[index];
      if (!file || !item) continue;

      setUploadQueue((previous) => previous.map((entry) => entry.id === item.id ? { ...entry, status: 'uploading' } : entry));

      try {
        const uploadedUrl = await uploadUserImage(file, currentUser.id, 'atelier', `collection-${Date.now()}-${item.name.replace(/\s+/g, '-').toLowerCase()}`);
        setCollectionImages((images) => {
          const nextImages = [...images.filter(Boolean), uploadedUrl];
          return Array.from(new Set(nextImages)).slice(0, 12);
        });
        setUploadQueue((previous) => previous.map((entry) => entry.id === item.id ? { ...entry, status: 'done', url: uploadedUrl } : entry));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed.';
        setUploadQueue((previous) => previous.map((entry) => entry.id === item.id ? { ...entry, status: 'error', error: message } : entry));
        setCollectionStatus(message);
      }
    }

    setIsUploading(false);
    setCollectionStatus((current) => current || 'Collection photos are ready to publish.');
  };

  const createSellerCollection = (event: React.FormEvent) => {
    event.preventDefault();
    const uploadedUrls = uploadQueue.filter((item) => item.status === 'done' && item.url).map((item) => item.url as string);
    const imageUrls = Array.from(new Set([...collectionImages.map((image) => image.trim()).filter(Boolean), ...uploadedUrls]));
    if (!currentUser || !collectionTitle.trim() || imageUrls.length === 0) {
      setCollectionStatus('Add a collection name and at least one image.');
      return;
    }
    if (sellerCollections.length >= sellerCollectionLimit) {
      setCollectionStatus(currentUser.isPromoted ? 'You have reached the 50-collection promoted limit.' : 'Promoted access unlocks up to 50 collections without the ad-supported limit.');
      return;
    }
    storageService.saveSellerCollection({ sellerId: currentUser.id, title: collectionTitle.trim(), description: collectionDescription.trim(), imageUrls });
    setSellerCollections(storageService.getSellerCollections(currentUser.id));
    setCollectionTitle('');
    setCollectionDescription('');
    setCollectionImages(['']);
    setUploadQueue([]);
    setCollectionStatus('Collection published to your storefront.');
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (event.dataTransfer.files?.length) {
      void handleQueuedUploads(Array.from(event.dataTransfer.files));
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      void handleQueuedUploads(Array.from(event.target.files));
      event.target.value = '';
    }
  };

  return (
    <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {canCreateSellerCollection && (
        <section className={`rounded-3xl border p-5 sm:p-6 ${isDarkMode ? 'bg-[#121316] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
          <div className="flex flex-col gap-2 border-b border-neutral-800/70 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-500"><Layers className="h-3.5 w-3.5" /> Seller collection studio</div>
              <h1 className="mt-2 text-2xl font-serif font-bold sm:text-3xl">Curate your storefront</h1>
              <p className="mt-1 max-w-2xl text-xs text-neutral-400">Group a complete edit by theme, season, or material. Each collection can carry up to 12 images.</p>
            </div>
            <span className="text-xs text-neutral-400">{sellerCollections.length}/{sellerCollectionLimit} collection{sellerCollections.length === 1 ? '' : 's'} published</span>
          </div>

          <form onSubmit={createSellerCollection} className="mt-5 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="space-y-3">
              <input value={collectionTitle} onChange={event => setCollectionTitle(event.target.value)} placeholder="Collection name, e.g. The Indigo Edit" className="w-full rounded-xl border border-neutral-700 bg-neutral-900/40 px-3.5 py-3 text-xs focus:border-amber-500 focus:outline-none" />
              <textarea value={collectionDescription} onChange={event => setCollectionDescription(event.target.value)} rows={4} placeholder="Describe the story, fabric, or occasion behind this edit." className="w-full rounded-xl border border-neutral-700 bg-neutral-900/40 p-3 text-xs focus:border-amber-500 focus:outline-none" />
              {collectionStatus && <p className="text-xs text-amber-400">{collectionStatus}</p>}
              <button type="submit" disabled={sellerCollections.length >= sellerCollectionLimit || isUploading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-xs font-bold text-neutral-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" /> {isUploading ? 'Uploading...' : 'Publish collection'}</button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between"><p className="text-xs font-semibold text-neutral-300">Collection gallery</p><span className="text-[10px] text-neutral-500">{Array.from(new Set([...collectionImages.filter(Boolean), ...uploadQueue.filter((item) => item.status === 'done' && item.url).map((item) => item.url as string)])).length}/12 images</span></div>

              <div
                onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`group relative overflow-hidden rounded-2xl border border-dashed p-4 transition ${dragActive ? 'border-amber-400 bg-amber-400/5' : 'border-neutral-700 bg-neutral-900/30'}`}>
                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleInputChange} className="hidden" />
                <div className="flex flex-col items-center justify-center gap-3 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-neutral-100">Drag & drop collection photos</p>
                    <p className="mt-1 text-[11px] text-neutral-400">PNG, JPG, WEBP, GIF — optimized automatically with Cloudinary.</p>
                  </div>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-300">
                    <ImageIcon className="h-3.5 w-3.5" /> Select files
                  </button>
                </div>
              </div>

              {uploadQueue.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {uploadQueue.map((item) => (
                    <div key={item.id} className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/30">
                      <img src={item.preview} alt={item.name} className="h-20 w-full object-cover" />
                      <div className="flex items-center justify-between gap-2 px-2.5 py-2 text-[10px]">
                        <span className="truncate text-neutral-300">{item.name}</span>
                        {item.status === 'done' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                        {item.status === 'uploading' && <span className="text-amber-400">Uploading</span>}
                        {item.status === 'error' && <span className="text-red-400">Failed</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-neutral-300">Optional direct image links</p>
                  <button type="button" onClick={addCollectionImage} className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-amber-400 hover:text-amber-300"><Plus className="h-3.5 w-3.5" /> Add URL slot</button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {collectionImages.map((image, index) => (
                    <div key={`${index}-${image || 'empty'}`} className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/30 p-2">
                      <input type="url" value={image} onChange={event => updateCollectionImage(index, event.target.value)} placeholder={`Image ${index + 1} URL`} className="min-w-0 flex-1 bg-transparent px-1 text-xs focus:outline-none" />
                      {collectionImages.length > 1 && <button type="button" onClick={() => removeCollectionImage(index)} aria-label={`Remove image ${index + 1}`} className="rounded-lg p-1.5 text-neutral-500 hover:bg-red-500/10 hover:text-red-400"><X className="h-3.5 w-3.5" /></button>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </form>
        </section>
      )}

      {canCreateSellerCollection && sellerCollections.length > 0 && (
        <section className={`rounded-3xl border p-4 sm:p-5 ${isDarkMode ? 'bg-[#121316] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold"><Layers className="h-4 w-4 text-amber-400" /> Published collections</div>
          <div className="grid gap-4 md:grid-cols-2">
            {sellerCollections.map(collection => <article key={collection.id} className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/30">
              <div className="flex h-36 gap-0.5 overflow-x-auto bg-neutral-900">{collection.imageUrls.map(image => <img key={image} src={image} alt="" className="h-full w-1/3 min-w-[33.333%] object-cover" />)}</div>
              <div className="p-3"><h2 className="text-sm font-semibold">{collection.title}</h2><p className="mt-1 line-clamp-2 text-xs text-neutral-400">{collection.description || 'A curated seller collection.'}</p><p className="mt-2 text-[10px] text-amber-400">{collection.imageUrls.length} gallery images</p></div>
            </article>)}
          </div>
        </section>
      )}

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
            {currentUser?.isPromoted ? (
              <span className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs font-semibold text-amber-300">Promoted access · 50 slots · ad-free</span>
            ) : (
              <button
                onClick={unlockMoreSlots}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-neutral-950 bg-gradient-to-r from-amber-400 to-amber-500"
              >
                Unlock +5 slots
              </button>
            )}
          </div>
        </div>
      </div>

      {!currentUser?.isPromoted && <div className={`rounded-3xl border p-4 sm:p-5 ${isDarkMode ? 'bg-[#121316] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {savedPhotos.map((photo) => (
              <div key={photo.id} className={`overflow-hidden rounded-2xl border ${isDarkMode ? 'border-neutral-800 bg-neutral-950/40' : 'border-neutral-200 bg-neutral-50'}`}>
                <img src={photo.url} alt={photo.title} className="h-48 w-full object-cover sm:h-52" />
                <div className="p-3 space-y-2.5">
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
      </div>}

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
