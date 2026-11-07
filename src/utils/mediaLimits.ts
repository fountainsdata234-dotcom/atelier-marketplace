export const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_STORY_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_STORY_VIDEO_UPLOAD_BYTES = 5 * 1024 * 1024;

export function getImageSizeError(file: File): string | null {
  return file.size > MAX_IMAGE_UPLOAD_BYTES
    ? `${file.name} exceeds the 8 MB image limit.`
    : null;
}

export function getStoryUploadSizeError(file: File): string | null {
  const maxBytes = file.type.startsWith('video/') ? MAX_STORY_VIDEO_UPLOAD_BYTES : MAX_STORY_IMAGE_UPLOAD_BYTES;
  const maxMegabytes = maxBytes / (1024 * 1024);
  return file.size > maxBytes
    ? `${file.type.startsWith('video/') ? 'Story videos' : 'Story photos'} must be ${maxMegabytes} MB or smaller.`
    : null;
}