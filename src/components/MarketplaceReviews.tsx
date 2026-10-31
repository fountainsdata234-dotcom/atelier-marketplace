import React, { useCallback, useEffect, useState } from 'react';
import { Flag, Star, ThumbsUp } from 'lucide-react';
import type { MarketplaceReview, MarketplaceReviewType, MarketplaceReviewsPage, User } from '../types';
import { api } from '../services/api';
import { safeCustomerErrorMessage } from '../utils/customerMessages';

interface MarketplaceReviewsProps {
  type: MarketplaceReviewType;
  targetId: string;
  currentUser: User | null;
  onOpenAuth: () => void;
  contextListingId?: string;
  isDarkMode: boolean;
}

const emptySummary: MarketplaceReviewsPage['summary'] = {
  rawAverage: 0,
  eligibleReviewCount: 0,
  ratingDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
  confidenceAdjustedRating: null,
  priorMean: 3.5,
  priorStrength: 20,
  baselineScope: 'global_default',
  configVersion: 'bayes-v1',
};

export const MarketplaceReviews: React.FC<MarketplaceReviewsProps> = ({
  type,
  targetId,
  currentUser,
  onOpenAuth,
  contextListingId,
  isDarkMode,
}) => {
  const [page, setPage] = useState<MarketplaceReviewsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sellerResponses, setSellerResponses] = useState<Record<string, string>>({});
  const [reportingReviewId, setReportingReviewId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('spam');
  const [reportDetails, setReportDetails] = useState('');

  const load = useCallback(async (cursor?: string, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await api.getMarketplaceReviews(type, targetId, cursor);
      setPage(current => {
        if (!append || !current) return result;
        const seenIds = new Set(current.reviews.map(review => review.id));
        return { ...result, reviews: [...current.reviews, ...result.reviews.filter(review => !seenIds.has(review.id))] };
      });
      setRating(result.ownReview?.rating || 0);
      setReviewText(result.ownReview?.reviewText || '');
    } catch (loadError) {
      setError(safeCustomerErrorMessage(loadError, 'Reviews could not be loaded. Please try again.'));
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, [type, targetId]);

  useEffect(() => { void load(); }, [load]);

  const summary = page?.summary || emptySummary;
  const ownReview = page?.ownReview || null;
  const editable = !ownReview || (Date.now() - new Date(ownReview.createdAt).getTime() <= 14 * 24 * 60 * 60 * 1000);
  const surface = isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white';
  const muted = isDarkMode ? 'text-neutral-400' : 'text-neutral-600';

  const submitReview = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (!currentUser) {
      setMessage('Sign in to leave firsthand feedback.');
      return;
    }
    if (rating < 1 || !attested) {
      setMessage('Choose a star rating and confirm your firsthand experience.');
      return;
    }
    setBusy(true);
    try {
      await api.submitMarketplaceReview(type, targetId, {
        rating,
        reviewText,
        contextListingId,
        firsthandAttested: true,
      });
      setMessage('Your feedback was submitted for moderation. It will appear publicly after approval.');
      await load();
    } catch (submitError) {
      setMessage(safeCustomerErrorMessage(submitError, "Your review couldn't be submitted. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const toggleHelpful = async (review: MarketplaceReview) => {
    if (!currentUser) {
      setMessage('Sign in to mark a review helpful.');
      return;
    }
    try {
      await api.toggleReviewHelpful(type, review.id);
      await load();
    } catch (voteError) {
      setMessage(safeCustomerErrorMessage(voteError, "Your vote couldn't be saved. Please try again."));
    }
  };

  const reportReview = async (event: React.FormEvent, review: MarketplaceReview) => {
    event.preventDefault();
    if (!currentUser) {
      setMessage('Sign in to report a review.');
      return;
    }
    setBusy(true);
    try {
      await api.reportMarketplaceReview(type, review.id, reportReason, reportDetails);
      setMessage('Thank you. Your report was sent to the moderation team.');
      setReportingReviewId(null);
      setReportDetails('');
    } catch (reportError) {
      setMessage(safeCustomerErrorMessage(reportError, "Your report couldn't be submitted. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const respond = async (review: MarketplaceReview) => {
    setBusy(true);
    try {
      await api.respondToReview(type, review.id, sellerResponses[review.id] || '');
      setSellerResponses(current => ({ ...current, [review.id]: '' }));
      await load();
      setMessage('Your response has been posted.');
    } catch (responseError) {
      setMessage(safeCustomerErrorMessage(responseError, "Your response couldn't be posted. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const appeal = async () => {
    if (!ownReview || !currentUser) return;
    const reason = window.prompt('Explain why you are appealing this moderation decision (10-1000 characters):');
    if (!reason) return;
    setBusy(true);
    try {
      await api.appealMarketplaceReview(type, ownReview.id, reason.trim());
      setMessage('Your appeal was submitted for independent review.');
    } catch (appealError) {
      setMessage(safeCustomerErrorMessage(appealError, "Your appeal couldn't be submitted. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id={`${type}-reviews`} aria-labelledby={`${type}-reviews-heading`} className={`mt-8 rounded-2xl border p-4 sm:p-6 ${surface}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-500">Firsthand feedback</p>
          <h2 id={`${type}-reviews-heading`} className="mt-1 font-serif text-2xl font-bold">{type === 'listing' ? 'Listing reviews' : 'Seller reviews'}</h2>
          <p className={`mt-1 text-xs ${muted}`}>Feedback is moderated and is not purchase verified.</p>
        </div>
        <div className="text-right">
          <p className="flex items-center justify-end gap-0.5" aria-label={summary.eligibleReviewCount ? `${summary.rawAverage.toFixed(2)} out of 5 stars` : 'No ratings yet'}>
            {[1, 2, 3, 4, 5].map(star => <Star key={star} className={`h-4 w-4 ${summary.rawAverage >= star ? 'fill-amber-400 text-amber-400' : 'text-neutral-500'}`} />)}
          </p>
          <p className={`mt-1 text-xs ${muted}`}>{summary.eligibleReviewCount ? `${summary.rawAverage.toFixed(2)} · ${summary.eligibleReviewCount} review${summary.eligibleReviewCount === 1 ? '' : 's'}` : 'No ratings yet'}</p>
        </div>
      </div>

      {summary.eligibleReviewCount > 0 ? <div className="mt-5 space-y-1.5" aria-label="Rating distribution">
        {[5, 4, 3, 2, 1].map(stars => {
          const count = summary.ratingDistribution[String(stars) as keyof typeof summary.ratingDistribution] || 0;
          const percent = (count / summary.eligibleReviewCount) * 100;
          return <div key={stars} className="grid grid-cols-[2rem_1fr_2rem] items-center gap-2 text-xs">
            <span>{stars} <Star className="inline h-3 w-3 fill-amber-400 text-amber-400" /></span>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-700/30"><div className="h-full rounded-full bg-amber-400" style={{ width: `${percent}%` }} /></div>
            <span className="text-right">{count}</span>
          </div>;
        })}
      </div> : !loading && <p className={`mt-4 text-sm ${muted}`}>No reviews yet.</p>}

      {currentUser && editable && <form onSubmit={submitReview} className="mt-5 space-y-3 border-t border-neutral-700/30 pt-5">
        <h3 className="text-sm font-semibold">{ownReview ? 'Edit your feedback' : 'Share your firsthand experience'}</h3>
        <div role="group" aria-label="Rating from 1 to 5 stars" className="flex gap-1">
          {[1, 2, 3, 4, 5].map(stars => <button key={stars} type="button" aria-label={`${stars} star${stars === 1 ? '' : 's'}`} aria-pressed={rating === stars} onClick={() => setRating(stars)} className="rounded p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">
            <Star className={`h-6 w-6 ${rating >= stars ? 'fill-amber-400 text-amber-400' : 'text-neutral-500'}`} />
          </button>)}
        </div>
        <label className="block text-xs font-semibold">Written feedback <span className={muted}>(optional)</span>
          <textarea value={reviewText} onChange={event => setReviewText(event.target.value)} maxLength={4000} rows={4} className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${isDarkMode ? 'border-neutral-700 bg-neutral-950' : 'border-neutral-300 bg-white'}`} placeholder="Describe your firsthand experience." />
        </label>
        <label className="flex items-start gap-2 text-xs">
          <input type="checkbox" checked={attested} onChange={event => setAttested(event.target.checked)} className="mt-0.5 accent-amber-400" />
          <span>I confirm this rating is based on my firsthand experience. This platform does not verify purchases.</span>
        </label>
        <button type="submit" disabled={busy || !rating || !attested} className="rounded-lg bg-amber-400 px-4 py-2.5 text-xs font-bold text-neutral-950 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Submitting…' : ownReview ? 'Resubmit for moderation' : 'Submit review'}</button>
      </form>}
      {!currentUser && <button type="button" onClick={onOpenAuth} className="mt-5 rounded-lg bg-amber-400 px-4 py-2.5 text-xs font-bold text-neutral-950">Sign in to leave firsthand feedback</button>}
      {ownReview && !editable && <p className={`mt-4 text-xs ${muted}`}>Your review is outside the 14-day editing window.</p>}
      {ownReview?.moderationStatus === 'pending' && <p className="mt-3 text-xs text-amber-500">Your review is awaiting moderation and is not public yet.</p>}
      {ownReview && ['rejected', 'removed'].includes(ownReview.moderationStatus) && <div className="mt-3">
        <p className="text-xs text-red-400">Moderation note: {ownReview.moderationNote || 'No additional note was provided.'}</p>
        <button type="button" disabled={busy} onClick={() => void appeal()} className="mt-2 text-xs font-semibold text-amber-500 underline">Appeal moderation decision</button>
      </div>}

      {loading && <p role="status" className={`mt-5 text-sm ${muted}`}>Loading reviews…</p>}
      {error && <div role="alert" className="mt-5 text-sm text-red-500">{error}<button type="button" onClick={() => void load()} className="ml-3 font-semibold underline">Retry</button></div>}
      {page?.reviews.map(review => <article key={review.id} className="mt-5 border-t border-neutral-700/30 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-sm font-semibold">{review.reviewer?.name || 'Marketplace member'}</p><p className={`mt-0.5 text-[11px] ${muted}`}>{new Date(review.createdAt).toLocaleDateString()} · Firsthand feedback · Not purchase verified</p></div>
          <span className="inline-flex items-center gap-1 text-sm font-bold" aria-label={`${review.rating} out of 5 stars`}>{review.rating}<Star className="h-4 w-4 fill-amber-400 text-amber-400" /></span>
        </div>
        {review.reviewText && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{review.reviewText}</p>}
        {review.sellerResponse && <div className="mt-3 rounded-lg bg-amber-500/5 p-3"><p className="text-xs font-bold text-amber-500">Seller response</p><p className="mt-1 whitespace-pre-wrap text-sm">{review.sellerResponse}</p></div>}
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" disabled={busy || !currentUser || currentUser.id === review.reviewerId} onClick={() => void toggleHelpful(review)} aria-pressed={review.viewerFoundHelpful} className={`inline-flex items-center gap-1 text-xs ${review.viewerFoundHelpful ? 'text-amber-500' : muted}`}><ThumbsUp className="h-3.5 w-3.5" /> Helpful ({review.helpfulCount})</button>
          <button type="button" disabled={busy} aria-expanded={reportingReviewId === review.id} onClick={() => setReportingReviewId(current => current === review.id ? null : review.id)} className={`inline-flex items-center gap-1 text-xs ${muted}`}><Flag className="h-3.5 w-3.5" /> Report</button>
        </div>
        {reportingReviewId === review.id && <form onSubmit={event => void reportReview(event, review)} className="mt-3 space-y-2 rounded-lg border border-neutral-700/40 p-3">
          <label className="block text-xs font-semibold">Report reason
            <select value={reportReason} onChange={event => setReportReason(event.target.value)} className={`mt-1 w-full rounded-lg border px-3 py-2 text-xs ${isDarkMode ? 'border-neutral-700 bg-neutral-950' : 'border-neutral-300 bg-white'}`}>
              <option value="harassment">Harassment</option><option value="personal_information">Personal information</option><option value="spam">Spam</option><option value="conflict_of_interest">Conflict of interest</option><option value="policy_violation">Policy violation</option><option value="other">Other</option>
            </select>
          </label>
          <label className="block text-xs font-semibold">Details <span className={muted}>(optional)</span>
            <textarea value={reportDetails} onChange={event => setReportDetails(event.target.value)} maxLength={1000} rows={3} className={`mt-1 w-full rounded-lg border px-3 py-2 text-xs ${isDarkMode ? 'border-neutral-700 bg-neutral-950' : 'border-neutral-300 bg-white'}`} />
          </label>
          <button type="submit" disabled={busy} className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-neutral-950 disabled:opacity-50">{busy ? 'Sending…' : 'Send report'}</button>
        </form>}
        {currentUser?.id === review.sellerId && !review.sellerResponse && <div className="mt-3 flex gap-2">
          <input value={sellerResponses[review.id] || ''} onChange={event => setSellerResponses(current => ({ ...current, [review.id]: event.target.value }))} maxLength={2000} aria-label="Seller response" placeholder="Write a professional response" className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-xs ${isDarkMode ? 'border-neutral-700 bg-neutral-950' : 'border-neutral-300 bg-white'}`} />
          <button type="button" disabled={busy || (sellerResponses[review.id] || '').trim().length < 2} onClick={() => void respond(review)} className="rounded-lg border border-amber-500 px-3 text-xs font-semibold text-amber-500 disabled:opacity-50">Respond</button>
        </div>}
      </article>)}
      {page?.hasMore && page.nextCursor && <button type="button" disabled={loadingMore} onClick={() => void load(page.nextCursor, true)} className="mt-5 rounded-lg border border-amber-500/40 px-4 py-2 text-xs font-semibold text-amber-500 disabled:opacity-50">{loadingMore ? 'Loading…' : 'Load more reviews'}</button>}
      {message && <p role="status" className="mt-4 text-xs text-amber-500">{message}</p>}
    </section>
  );
};
