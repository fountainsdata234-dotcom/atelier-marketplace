import { compressImageBlob } from '../utils/imageProgram';
import { customerMessageForHttpError } from '../utils/customerMessages';
import { getAuthToken } from './auth';

export async function uploadUserImage(
  file: Blob,
  userId: string,
  folder: 'profiles' | 'posts' | 'atelier' | string,
  fileName: string,
  alreadyOptimized = false,
) {
  const apiUrl = import.meta.env.VITE_API_URL
    || (window.location.hostname === 'localhost' ? 'http://localhost:8787' : window.location.origin);
  const token = await getAuthToken();
  const formData = new FormData();
  const compressedFile = file.type.startsWith('image/') && !alreadyOptimized ? await compressImageBlob(file) : file;
  formData.append('image', compressedFile, `${fileName.replace(/\.[^.]+$/, '')}.jpg`);
  formData.append('folder', folder);
  formData.append('userId', userId);

  const response = await fetch(`${apiUrl}/api/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(customerMessageForHttpError(response.status, body.error, '/api/upload', body.code));
  }

  const data = await response.json() as { url?: string };
  if (!data.url) throw new Error("We couldn't finish uploading your image. Please try again.");
  return data.url;
}
