export async function fetchShareableImageFile(imageUrl: string, fileName: string): Promise<File> {
  const response = await fetch(imageUrl, { mode: 'cors' });
  if (!response.ok) throw new Error(`Image request failed with status ${response.status}.`);
  const blob = await response.blob();
  const imageType = blob.type || response.headers.get('content-type')?.split(';')[0] || '';
  if (!imageType.startsWith('image/')) throw new Error('The reference is not a shareable image.');
  const extension = imageType.split('/')[1]?.replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg';
  return new File([blob], `${fileName}.${extension}`, { type: imageType });
}
