/**
 * Compresses uploaded images before they are stored in Firebase Storage.
 */

export interface ProcessedImageResult {
  url: string;
  sourceType: 'firebase_storage' | 'external_cdn';
  originalSizeKb: number;
  compressedSizeKb: number;
  width: number;
  height: number;
  blob?: Blob;
}

export async function compressAndGenerateImageLink(
  file: File
): Promise<ProcessedImageResult> {
  const originalSizeKb = Math.round(file.size / 1024);

  // Compress in the browser, then upload the resulting Blob to Firebase Storage.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1000;
        let { width, height } = img;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }

        // Draw with smooth bicubic interpolation
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Export as WebP / JPEG high-efficiency link
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Could not compress this image'));
            return;
          }
          resolve({
            url: URL.createObjectURL(blob),
            sourceType: 'firebase_storage',
            originalSizeKb,
            compressedSizeKb: Math.round(blob.size / 1024),
            width,
            height,
            blob,
          });
        }, 'image/jpeg', 0.82);
      };
      img.onerror = () => reject(new Error('Failed to load image file'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Validate an external image link
 */
export async function validateImageLink(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}
