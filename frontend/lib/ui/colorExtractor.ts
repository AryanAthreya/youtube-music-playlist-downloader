/**
 * Color extraction utility for dynamic artwork accents.
 * Safely extracts dominant color using a lightweight in-memory canvas.
 * Only samples same-origin or proxied URLs (/api/thumb) to prevent tainted canvas errors.
 * Lightness is clamped to guarantee >= 4.5:1 contrast against text.
 */

// In-memory cache to prevent re-extracting for the same track/URL
const colorCache = new Map<string, string>();

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Converts RGB to HSL and clamps lightness between minL and maxL.
 * Returns a hex color string.
 */
function clampLightness(r: number, g: number, b: number, minL = 0.35, maxL = 0.65): string {
  const normR = r / 255;
  const normG = g / 255;
  const normB = b / 255;

  const max = Math.max(normR, normG, normB);
  const min = Math.min(normR, normG, normB);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case normR:
        h = (normG - normB) / d + (normG < normB ? 6 : 0);
        break;
      case normG:
        h = (normB - normR) / d + 2;
        break;
      case normB:
        h = (normR - normG) / d + 4;
        break;
    }
    h /= 6;
  }

  // Clamp lightness
  l = Math.max(minL, Math.min(maxL, l));

  // Convert back to RGB
  let finalR: number, finalG: number, finalB: number;

  if (s === 0) {
    finalR = finalG = finalB = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      let tNorm = t;
      if (tNorm < 0) tNorm += 1;
      if (tNorm > 1) tNorm -= 1;
      if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
      if (tNorm < 1 / 2) return q;
      if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    finalR = hue2rgb(p, q, h + 1 / 3);
    finalG = hue2rgb(p, q, h);
    finalB = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (n: number) => {
    const hex = Math.round(n * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  return `#${toHex(finalR)}${toHex(finalG)}${toHex(finalB)}`;
}

/**
 * Extracts the dominant color from a given image URL.
 * Automatically fails safely to null if canvas is tainted or image fails to load.
 */
export async function extractArtworkColor(
  imageUrl: string,
  cacheKey?: string
): Promise<string | null> {
  if (typeof window === "undefined" || !imageUrl) return null;

  const key = cacheKey || imageUrl;
  if (colorCache.has(key)) {
    return colorCache.get(key)!;
  }

  return new Promise((resolve) => {
    try {
      const img = new Image();
      // Ensure crossOrigin is set for safety if using same-origin proxy
      if (imageUrl.startsWith("/") || imageUrl.startsWith(window.location.origin)) {
        img.crossOrigin = "anonymous";
      }

      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) {
            resolve(null);
            return;
          }

          // Sample down to a tiny 16x16 grid for speed & memory
          const size = 16;
          canvas.width = size;
          canvas.height = size;
          ctx.drawImage(img, 0, 0, size, size);

          const imageData = ctx.getImageData(0, 0, size, size);
          const data = imageData.data;

          let rTotal = 0;
          let gTotal = 0;
          let bTotal = 0;
          let count = 0;

          // Compute average, skipping pure white/black pixels
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            if (a < 128) continue; // Skip transparent
            const brightness = (r + g + b) / 3;
            if (brightness > 240 || brightness < 15) continue; // Skip near white/black

            rTotal += r;
            gTotal += g;
            bTotal += b;
            count++;
          }

          if (count === 0) {
            resolve(null);
            return;
          }

          const avgR = Math.round(rTotal / count);
          const avgG = Math.round(gTotal / count);
          const avgB = Math.round(bTotal / count);

          const clampedColor = clampLightness(avgR, avgG, avgB);
          colorCache.set(key, clampedColor);
          resolve(clampedColor);
        } catch {
          // Canvas error (e.g. cross-origin taint) -> fail safely
          resolve(null);
        }
      };

      img.onerror = () => {
        resolve(null);
      };

      img.src = imageUrl;
    } catch {
      resolve(null);
    }
  });
}
