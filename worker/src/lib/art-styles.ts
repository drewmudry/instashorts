/**
 * Helper functions for art style preview images
 * 
 * Note: If your GCS bucket name differs from "instashorts-content", 
 * set NEXT_PUBLIC_GCS_BUCKET_NAME in your .env.local
 */

const GCS_BUCKET_NAME = process.env.NEXT_PUBLIC_GCS_BUCKET_NAME || "instashorts-content";
const GCS_BASE_URL = `https://storage.googleapis.com/${GCS_BUCKET_NAME}`;

/**
 * Get the preview image URL for an art style
 * @param styleId - The art style ID (e.g., "collage", "cinematic")
 * @param character - Which character preview to use ("icarus" or "cleopatra")
 * @returns The full GCS URL for the preview image
 */
export function getArtStylePreviewUrl(
  styleId: string,
  character: "icarus" | "cleopatra" = "icarus"
): string {
  return `${GCS_BASE_URL}/art-styles/${styleId}-${character}.png`;
}

/**
 * Get both preview image URLs for an art style
 */
export function getArtStylePreviewUrls(styleId: string) {
  return {
    icarus: getArtStylePreviewUrl(styleId, "icarus"),
    cleopatra: getArtStylePreviewUrl(styleId, "cleopatra"),
  };
}

