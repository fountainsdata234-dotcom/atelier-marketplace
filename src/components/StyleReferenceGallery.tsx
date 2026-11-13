import React, { useEffect, useId, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, LoaderCircle, Send, X } from 'lucide-react';
import { MarketplaceStyleReference, User } from '../types';
import { buildWhatsAppUrl } from '../utils/whatsapp';
import { fetchShareableImageFile } from '../utils/imageSharing';

interface StyleReferenceGalleryProps {
  references: MarketplaceStyleReference[];
  users: User[];
  isDarkMode: boolean;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  isOpen: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  onOpen: () => void;
  onClose: () => void;
}

interface StyleReferenceCardProps {
  reference: MarketplaceStyleReference;
  merchants: User[];
  isDarkMode: boolean;
}

const merchantName = (merchant: User) => merchant.shopName || merchant.name || 'Merchant';

const StyleReferenceCard: React.FC<StyleReferenceCardProps> = ({ reference, merchants, isDarkMode }) => {
  const [query, setQuery] = useState('');
  const [selectedMerchant, setSelectedMerchant] = useState<User | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [isSharing, setIsSharing] = useState(false);
  const [status, setStatus] = useState('');
  const [fallbackUrl, setFallbackUrl] = useState('');
  const instanceId = useId();
  const suggestionListId = `style-reference-merchants-${instanceId}`;
  const suggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery || selectedMerchant) return [];
    return merchants.filter(merchant =>
      `${merchantName(merchant)} ${merchant.handle || ''} ${merchant.phone || ''} ${merchant.whatsappNumber || ''}`
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    ).slice(0, 5);
  }, [merchants, query, selectedMerchant]);

  const chooseMerchant = (merchant: User) => {
    setSelectedMerchant(merchant);
    setQuery(merchantName(merchant));
    setShowSuggestions(false);
    setActiveSuggestionIndex(-1);
    setStatus('');
    setFallbackUrl('');
  };

  const sendReference = async () => {
    if (!selectedMerchant || isSharing) return;
    const name = merchantName(selectedMerchant);
    const phone = selectedMerchant.whatsappNumber || selectedMerchant.phone;
    const message = `Hello ${name}, I found this style or material on FABSATTIRE and would love to discuss a similar look.\n\nReference image: ${reference.imageUrl}`;
    const whatsappUrl = buildWhatsAppUrl(phone, message);
    if (!whatsappUrl) {
      setStatus('This merchant has not added a valid WhatsApp number yet.');
      setFallbackUrl('');
      return;
    }

    if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      setStatus('WhatsApp opened to this merchant with your request and the image link. Review and send it there.');
      setFallbackUrl(whatsappUrl);
      return;
    }

    setIsSharing(true);
    setStatus('Preparing the image for sharing…');
    setFallbackUrl('');
    try {
      const imageFile = await fetchShareableImageFile(reference.imageUrl, `fabsattire-reference-${reference.id}`);
      if (!navigator.canShare({ files: [imageFile] })) {
        setFallbackUrl(whatsappUrl);
        setStatus('This browser cannot attach images directly. You can still send the image link to this merchant.');
        return;
      }

      await navigator.share({
        files: [imageFile],
        title: `Style reference for ${name}`,
        text: `Hello ${name}, I found this style or material on FABSATTIRE and would love to discuss a similar look.`,
      });
      setStatus('The image and request are ready to share. Choose WhatsApp, then choose this merchant.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setStatus('Sharing was canceled. You can try again whenever you are ready.');
        return;
      }
      console.warn('Style reference image could not be attached to the WhatsApp request.', error);
      setFallbackUrl(whatsappUrl);
      setStatus('Could not attach the image on this device. You can send its link to this merchant instead.');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <article className={`flex h-full flex-col overflow-hidden rounded-2xl border ${
      isDarkMode ? 'border-neutral-800 bg-[#141416]' : 'border-neutral-200 bg-white shadow-sm'
    }`}>
      <div className="aspect-[4/5] overflow-hidden bg-[#f3f0e9]">
        <img
          src={reference.imageUrl}
          alt="Fashion style or material inspiration"
          loading="lazy"
          className="h-full w-full object-contain"
        />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3 sm:p-4">
        <div className="relative">
          <label className="sr-only" htmlFor={`${suggestionListId}-input`}>Choose a merchant</label>
          <input
            id={`${suggestionListId}-input`}
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showSuggestions && suggestions.length > 0}
            aria-controls={suggestionListId}
            aria-activedescendant={activeSuggestionIndex >= 0 ? `${suggestionListId}-option-${activeSuggestionIndex}` : undefined}
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setSelectedMerchant(null);
              setShowSuggestions(true);
              setActiveSuggestionIndex(-1);
              setStatus('');
              setFallbackUrl('');
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => window.setTimeout(() => setShowSuggestions(false), 120)}
            onKeyDown={event => {
              if (!suggestions.length) {
                if (event.key === 'Escape') setShowSuggestions(false);
                return;
              }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const direction = event.key === 'ArrowDown' ? 1 : -1;
                setActiveSuggestionIndex(index => index < 0
                  ? (direction > 0 ? 0 : suggestions.length - 1)
                  : (index + direction + suggestions.length) % suggestions.length);
              } else if (event.key === 'Enter' && activeSuggestionIndex >= 0) {
                event.preventDefault();
                chooseMerchant(suggestions[activeSuggestionIndex]);
              } else if (event.key === 'Escape') {
                setShowSuggestions(false);
                setActiveSuggestionIndex(-1);
              }
            }}
            placeholder="Search for a merchant"
            className={`min-h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 ${
              isDarkMode ? 'border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-500' : 'border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-500'
            }`}
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul id={suggestionListId} role="listbox" className={`absolute inset-x-0 top-full z-30 mt-1 max-h-52 overflow-y-auto rounded-xl border p-1 shadow-xl ${
              isDarkMode ? 'border-neutral-700 bg-neutral-900' : 'border-neutral-200 bg-white'
            }`}>
              {suggestions.map((merchant, index) => (
                <li key={merchant.id} role="presentation">
                  <button
                    type="button"
                    id={`${suggestionListId}-option-${index}`}
                    role="option"
                    aria-selected={index === activeSuggestionIndex}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => chooseMerchant(merchant)}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm ${
                      index === activeSuggestionIndex
                        ? 'bg-amber-400/15'
                        : isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-amber-50'
                    }`}
                  >
                    {merchant.avatarUrl ? (
                      <img src={merchant.avatarUrl} alt="" loading="lazy" className="h-7 w-7 rounded-full object-cover" />
                    ) : (
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-amber-400/15 text-xs font-bold text-amber-500">{merchantName(merchant).slice(0, 1).toUpperCase()}</span>
                    )}
                    <span className="min-w-0 flex-1 truncate font-medium">{merchantName(merchant)}</span>
                    {merchant.handle && <span className="max-w-[35%] truncate text-xs text-neutral-500">@{merchant.handle.replace(/^@/, '')}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {showSuggestions && query.trim() && !selectedMerchant && suggestions.length === 0 && (
            <p className={`absolute inset-x-0 top-full z-30 mt-1 rounded-xl border px-3 py-2 text-xs shadow-lg ${
              isDarkMode ? 'border-neutral-700 bg-neutral-900 text-neutral-400' : 'border-neutral-200 bg-white text-neutral-600'
            }`}>No tailor or fabric merchant found.</p>
          )}
        </div>
        <button
          type="button"
          disabled={!selectedMerchant || isSharing}
          onClick={() => void sendReference()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-400 px-3 text-sm font-bold text-neutral-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSharing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {isSharing ? 'Preparing image' : 'Send to merchant'}
        </button>
        {status && (
          <p role="status" className={`text-xs leading-relaxed ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
            {status}
            {fallbackUrl && <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" className="ml-1 font-semibold text-amber-500 underline underline-offset-2">Open WhatsApp</a>}
          </p>
        )}
      </div>
    </article>
  );
};

export const StyleReferenceGallery: React.FC<StyleReferenceGalleryProps> = ({
  references,
  users,
  isDarkMode,
  hasMore,
  isLoading,
  isLoadingMore,
  error,
  isOpen,
  onLoadMore,
  onRetry,
  onOpen,
  onClose,
}) => {
  const merchants = useMemo(
    () => users.filter(user => !user.isBlocked && (user.role === 'tailor' || user.role === 'fabric_seller')),
    [users],
  );
  const panelClass = isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white shadow-sm';

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen, onClose]);

  if (!references.length) {
    return (
      <section aria-labelledby="style-reference-heading" className={`rounded-[1.75rem] border p-4 sm:p-6 ${panelClass}`}>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-500">A little inspiration goes a long way</p>
        <h2 id="style-reference-heading" className="mt-1 font-serif text-xl font-bold sm:text-2xl">Find a look. Make it yours.</h2>
        {isLoading ? (
          <p role="status" className={`mt-3 flex items-center gap-2 text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
            <LoaderCircle className="h-4 w-4 animate-spin" /> Loading style inspiration…
          </p>
        ) : error ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p role="alert" className="text-xs text-red-500">{error}</p>
            <button type="button" onClick={onRetry} className="min-h-9 rounded-lg border border-amber-500/40 px-3 text-xs font-semibold text-amber-500">Try again</button>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <>
      <section aria-labelledby="style-reference-heading" className={`overflow-hidden rounded-[1.75rem] border ${panelClass}`}>
        <div className="flex items-end justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-500">A little inspiration goes a long way</p>
            <h2 id="style-reference-heading" className="mt-1 font-serif text-xl font-bold sm:text-2xl">Find a look. Make it yours.</h2>
            <p className={`mt-1 max-w-2xl text-xs leading-relaxed ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              Choose a reference, find a tailor or fabric seller, and share the image with your request on WhatsApp.
            </p>
          </div>
          {hasMore && (
            <button type="button" onClick={onOpen} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full border border-amber-500/40 px-3 text-xs font-semibold text-amber-500 transition hover:bg-amber-400/10">
              View all <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 [scrollbar-width:thin] sm:px-6">
          {references.map(reference => (
            <div key={reference.id} className="w-[82vw] max-w-[280px] shrink-0 snap-start sm:w-[260px]">
              <StyleReferenceCard reference={reference} merchants={merchants} isDarkMode={isDarkMode} />
            </div>
          ))}
        </div>
      </section>

      {isOpen && (
        <div className="fixed inset-0 z-[90] overflow-y-auto bg-black/75 p-2 backdrop-blur-sm sm:p-5" role="dialog" aria-modal="true" aria-labelledby="all-style-references-heading" onClick={onClose}>
          <div className={`mx-auto min-h-full max-w-7xl rounded-2xl border p-4 sm:p-6 ${panelClass}`} onClick={event => event.stopPropagation()}>
            <div className={`sticky top-0 z-20 -mx-4 -mt-4 mb-5 flex items-center justify-between gap-3 border-b px-4 py-3 backdrop-blur sm:-mx-6 sm:-mt-6 sm:px-6 ${
              isDarkMode ? 'border-neutral-800 bg-[#121316]/95' : 'border-neutral-200 bg-white/95'
            }`}>
              <div className="flex min-w-0 items-center gap-3">
                <button type="button" aria-label="Close style references" onClick={onClose} className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border ${isDarkMode ? 'border-neutral-700 hover:bg-neutral-800' : 'border-neutral-200 hover:bg-neutral-100'}`}>
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0">
                  <h2 id="all-style-references-heading" className="truncate font-serif text-lg font-bold sm:text-xl">All style references</h2>
                  <p className={`truncate text-[11px] ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>Choose a look and send it to a merchant.</p>
                </div>
              </div>
              <button type="button" aria-label="Close gallery" onClick={onClose} className={`hidden h-10 w-10 place-items-center rounded-full border sm:grid ${isDarkMode ? 'border-neutral-700 hover:bg-neutral-800' : 'border-neutral-200 hover:bg-neutral-100'}`}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {references.map(reference => (
                <StyleReferenceCard key={reference.id} reference={reference} merchants={merchants} isDarkMode={isDarkMode} />
              ))}
            </div>
            {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>}
            {hasMore && (
              <div className="mt-6 flex justify-center">
                <button type="button" onClick={onLoadMore} disabled={isLoadingMore} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-bold text-neutral-950 disabled:opacity-60">
                  {isLoadingMore && <LoaderCircle className="h-4 w-4 animate-spin" />}
                  {isLoadingMore ? 'Loading references' : 'Load 15 more'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
