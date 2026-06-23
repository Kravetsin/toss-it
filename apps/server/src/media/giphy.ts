/**
 * Giphy GIF id validation. Not downloaded/stored: keep the id only; the overlay renders
 * straight from Giphy's CDN. Content is gated by Giphy's own platform moderation, so we
 * only sanity-check the id format here (prevents URL injection into the CDN path).
 */

// Giphy ids are alphanumeric (letters + digits); reject anything else.
const GIPHY_ID_RE = /^[A-Za-z0-9]{1,64}$/;

export function isGiphyId(id: string): boolean {
  return GIPHY_ID_RE.test(id);
}
