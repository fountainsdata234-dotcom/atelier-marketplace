import { describe, expect, it } from 'vitest';
import { getImageSizeError, getStoryUploadSizeError, MAX_IMAGE_UPLOAD_BYTES, MAX_STORY_IMAGE_UPLOAD_BYTES, MAX_STORY_VIDEO_UPLOAD_BYTES } from './mediaLimits';

function file(size: number, type: string, name: string) {
  const result = new File([], name, { type });
  Object.defineProperty(result, 'size', { value: size });
  return result;
}

describe('media upload limits', () => {
  it('accepts images at the limit and rejects larger images', () => {
    expect(getImageSizeError(file(MAX_IMAGE_UPLOAD_BYTES, 'image/jpeg', 'post.jpg'))).toBeNull();
    expect(getImageSizeError(file(MAX_IMAGE_UPLOAD_BYTES + 1, 'image/jpeg', 'post.jpg'))).toContain('8 MB');
  });

  it('applies separate image and video limits to stories', () => {
    expect(getStoryUploadSizeError(file(MAX_STORY_IMAGE_UPLOAD_BYTES, 'image/jpeg', 'story.jpg'))).toBeNull();
    expect(getStoryUploadSizeError(file(MAX_STORY_IMAGE_UPLOAD_BYTES + 1, 'image/jpeg', 'story.jpg'))).toContain('5 MB');
    expect(getStoryUploadSizeError(file(MAX_STORY_VIDEO_UPLOAD_BYTES, 'video/mp4', 'story.mp4'))).toBeNull();
    expect(getStoryUploadSizeError(file(MAX_STORY_VIDEO_UPLOAD_BYTES + 1, 'video/mp4', 'story.mp4'))).toContain('5 MB');
  });
});
