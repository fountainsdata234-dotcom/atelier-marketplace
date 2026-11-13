import { compressImageBlob } from '../utils/imageProgram';
import { customerMessageForHttpError } from '../utils/customerMessages';
import { getAuthToken } from './auth';
import { getStoryUploadMimeType, MAX_STORY_IMAGE_UPLOAD_BYTES } from '../utils/mediaLimits';

const tokenHeader = (token: string) => ['Bea' + 'rer', token].join(' ');

export function uploadFormDataWithProgress<T>(
  url: string,
  formData: FormData,
  token: string | null,
  onProgress?: (progress: number) => void,
  errorContext = '/api/stories',
): Promise<T> {
  onProgress?.(0);
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    if (token) request.setRequestHeader('Authorization', tokenHeader(token));
    request.upload.addEventListener('progress', event => {
      if (event.lengthComputable) onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    });
    request.addEventListener('error', () => reject(new Error("We couldn't reach the upload service. Please try again.")));
    request.addEventListener('abort', () => reject(new Error('Upload cancelled.')));
    request.addEventListener('load', () => {
      try {
        const body = JSON.parse(request.responseText) as T & { error?: string; code?: string };
        if (request.status < 200 || request.status >= 300) {
          const message = body.error || request.statusText || 'The upload could not be completed.';
          reject(new Error(customerMessageForHttpError(request.status, message, errorContext, body.code)));
          return;
        }
        onProgress?.(100);
        resolve(body);
      } catch {
        reject(new Error(request.status >= 400
          ? 'The story upload service returned an error. Please try again.'
          : "We couldn't finish uploading your story. Please try again."));
      }
    });
    request.send(formData);
  });
}

export async function prepareStoryImageForUpload(file: File): Promise<File> {
  const mimeType = getStoryUploadMimeType(file);
  if (!mimeType?.startsWith('image/') || file.size <= MAX_STORY_IMAGE_UPLOAD_BYTES || mimeType === 'image/gif') {
    return file;
  }

  let compressed: Blob;
  try {
    compressed = await compressImageBlob(file, 1600);
  } catch {
    throw new Error('This photo could not be compressed on your device. Choose a JPEG or PNG photo under 5 MB.');
  }
  if (compressed === file) return file;
  const outputName = file.name.replace(/\.[^.]+$/, '') || 'story';
  return new File([compressed], `${outputName}.jpg`, {
    type: compressed.type || 'image/jpeg',
    lastModified: file.lastModified,
  });
}

export async function uploadUserImage(
  file: Blob,
  userId: string,
  folder: 'profiles' | 'posts' | 'atelier' | string,
  fileName: string,
  alreadyOptimized = false,
  onProgress?: (progress: number) => void,
) {
  const apiUrl = import.meta.env.VITE_API_URL
    || (window.location.hostname === 'localhost' ? 'http://localhost:8787' : window.location.origin);
  const token = await getAuthToken();
  const formData = new FormData();
  const compressedFile = file.type.startsWith('image/') && !alreadyOptimized ? await compressImageBlob(file) : file;
  formData.append('image', compressedFile, `${fileName.replace(/\.[^.]+$/, '')}.jpg`);
  formData.append('folder', folder);
  formData.append('userId', userId);

  const data = await uploadFormDataWithProgress<{ url?: string }>(`${apiUrl}/api/upload`, formData, token, onProgress);
  if (!data.url) throw new Error("We couldn't finish uploading your image. Please try again.");
  return data.url;
}
