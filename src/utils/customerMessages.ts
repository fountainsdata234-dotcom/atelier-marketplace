const TECHNICAL_ERROR = /\b(?:api|cloudinary|configuration|database|environment|exception|failed to fetch|firebase|internal|postgres(?:ql)?|query|rpc|sql|stack trace|supabase|technical details)\b/i;

function isSafeCustomerMessage(message: string): boolean {
  return message.length > 0 && message.length <= 240 && !TECHNICAL_ERROR.test(message);
}

export function customerMessageForHttpError(status: number, rawMessage: unknown, path: string, code?: unknown): string {
  const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
  const safeMessage = isSafeCustomerMessage(message) ? message : '';

  if (code === 'REVIEW_SUBMISSIONS_UNAVAILABLE') return 'Review submissions are temporarily unavailable. Please check back later.';
  if (code === 'IMAGE_DOWNLOAD_UNAVAILABLE') return "We couldn't download this image. Please try again.";
  if (code === 'IMAGE_NOT_FOUND') return 'This image is no longer available.';
  if (status === 400 || status === 422) return safeMessage || 'Please check the information and try again.';
  if (status === 401) return 'Please sign in again to continue.';
  if (status === 403) return safeMessage || "You don't have permission to perform this action.";
  if (status === 404) {
    return /\/(?:posts|marketplace\/listings)\//i.test(path)
      ? 'This listing is no longer available.'
      : "We couldn't find what you were looking for.";
  }
  if (status === 409) return safeMessage || 'This change conflicts with information already saved. Refresh and try again.';
  if (status === 413) return safeMessage || 'This file is too large. Choose a smaller file and try again.';
  if (status === 429) return safeMessage || 'Too many attempts. Please wait a moment and try again.';
  if (status >= 500) return 'Something went wrong on our end. Please try again shortly.';
  return safeMessage || "We couldn't complete that request. Please try again.";
}

export function customerMessageForNetworkError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'This is taking longer than expected. Please try again.';
  }
  return "We couldn't connect. Please check your internet connection and try again.";
}

export function safeCustomerErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const message = error.message.trim();
  if (/failed to fetch|network|load failed/i.test(message)) return customerMessageForNetworkError(error);
  return isSafeCustomerMessage(message) ? message : fallback;
}
