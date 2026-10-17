import { describe, expect, it } from 'vitest';
import { customerMessageForHttpError, customerMessageForNetworkError, safeCustomerErrorMessage } from './customerMessages';

describe('customer-facing errors', () => {
  it('replaces service and infrastructure details with a safe message', () => {
    expect(customerMessageForHttpError(503, 'Supabase RPC returned SQLSTATE 42883', '/api/reviews'))
      .toBe('Something went wrong on our end. Please try again shortly.');
  });

  it('preserves safe validation guidance', () => {
    expect(customerMessageForHttpError(400, 'Choose a rating from 1 to 5.', '/api/reviews'))
      .toBe('Choose a rating from 1 to 5.');
  });

  it('gives listing-specific not-found guidance', () => {
    expect(customerMessageForHttpError(404, 'Internal error', '/api/marketplace/listings/123/image-download'))
      .toBe('This listing is no longer available.');
  });

  it('uses a safe download message for unavailable images', () => {
    expect(customerMessageForHttpError(503, 'Internal error', '/api/download', 'IMAGE_DOWNLOAD_UNAVAILABLE'))
      .toBe("We couldn't download this image. Please try again.");
  });

  it('distinguishes a missing image from a missing listing', () => {
    expect(customerMessageForHttpError(404, 'This image is no longer available.', '/api/marketplace/listings/123/image-download', 'IMAGE_NOT_FOUND'))
      .toBe('This image is no longer available.');
  });

  it('does not expose technical local exceptions in UI messages', () => {
    expect(safeCustomerErrorMessage(new Error('Supabase configuration not found.'), 'Please try again later.'))
      .toBe('Please try again later.');
  });

  it('describes network failures without implementation details', () => {
    expect(customerMessageForNetworkError(new TypeError('Failed to fetch')))
      .toBe("We couldn't connect. Please check your internet connection and try again.");
  });
});
