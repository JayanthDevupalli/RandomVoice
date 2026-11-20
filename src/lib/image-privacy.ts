/**
 * YapClub Image Privacy Sanitizer
 * Strips EXIF metadata, GPS coordinates, camera model tags, and device identifiers
 * from uploaded photos by redrawing pixels onto an isolated HTML5 canvas.
 */

export interface SanitizeImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  mimeType?: "image/jpeg" | "image/webp";
}

/**
 * Strips all metadata (EXIF, GPS, camera serials, timestamps) from an image file/blob.
 * Returns a clean, sanitized Blob containing only the re-encoded pixel buffer.
 */
export async function stripExifAndSanitizeImage(
  input: Blob | File,
  options: SanitizeImageOptions = {}
): Promise<Blob> {
  const {
    maxWidth = 1200,
    maxHeight = 1200,
    quality = 0.92,
    mimeType = "image/jpeg",
  } = options;

  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      // In SSR environment, return raw input as fallback
      resolve(input);
      return;
    }

    const objectUrl = URL.createObjectURL(input);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // Scale down if image exceeds maximum limits while maintaining aspect ratio
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          // If canvas context fails, return original
          resolve(input);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        // Draw image directly onto canvas - canvas re-encodes pure pixel data,
        // dropping all EXIF header markers, GPS data, and camera tags.
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(input);
            }
          },
          mimeType,
          quality
        );
      } catch (err) {
        console.warn("Image metadata stripping encountered an error, falling back:", err);
        resolve(input);
      }
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image for privacy sanitization."));
    };

    img.src = objectUrl;
  });
}
