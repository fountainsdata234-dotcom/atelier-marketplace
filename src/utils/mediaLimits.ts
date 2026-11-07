export const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_STORY_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_STORY_VIDEO_UPLOAD_BYTES = 5 * 1024 * 1024;

const STORY_MEDIA_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

const STORY_MEDIA_MIME_TYPES = new Set(Object.values(STORY_MEDIA_MIME_BY_EXTENSION));

export function getStoryUploadMimeType(file: File): string | null {
  const declaredType = file.type.toLowerCase();
  if (STORY_MEDIA_MIME_TYPES.has(declaredType)) return declaredType;
  const extension = file.name.split('.').pop()?.toLowerCase();
  return extension ? STORY_MEDIA_MIME_BY_EXTENSION[extension] || null : null;
}

export function getStoryUploadTypeError(file: File): string | null {
  return getStoryUploadMimeType(file)
    ? null
    : 'Choose a JPEG, PNG, WebP, or GIF photo, or an MP4, WebM, or MOV video.';
}

export function getImageSizeError(file: File): string | null {
  return file.size > MAX_IMAGE_UPLOAD_BYTES
    ? `${file.name} exceeds the 8 MB image limit.`
    : null;
}

export function getStoryUploadSizeError(file: File): string | null {
  const mediaType = getStoryUploadMimeType(file);
  const maxBytes = mediaType?.startsWith('video/') ? MAX_STORY_VIDEO_UPLOAD_BYTES : MAX_STORY_IMAGE_UPLOAD_BYTES;
  const maxMegabytes = maxBytes / (1024 * 1024);
  return file.size > maxBytes
    ? `${mediaType?.startsWith('video/') ? 'Story videos' : 'Story photos'} must be ${maxMegabytes} MB or smaller.`
    : null;
}