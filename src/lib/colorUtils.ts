/**
 * Checks if a color is "light" based on its hex value.
 * Useful for determining whether to use dark or light text.
 * @param hex Hex color string (e.g., '#ffffff' or 'ffffff')
 * @returns boolean true if light, false if dark
 */
export function isLightColor(hex: string): boolean {
  if (!hex) return true;
  
  // Remove hash if present
  const cleanHex = hex.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  
  if (isNaN(r) || isNaN(g) || isNaN(b)) return true;

  // HSP (Highly Sensitive Poo) color model for luminance
  // http://alienryderflex.com/hsp.html
  const hsp = Math.sqrt(
    0.299 * (r * r) +
    0.587 * (g * g) +
    0.114 * (b * b)
  );

  // Consider it light if HSP is above 127.5
  return hsp > 127.5;
}

/**
 * Returns either black or white depending on the background color luminance.
 * @param bgColor Hex color string
 * @returns 'text-slate-900' | 'text-white'
 */
export function getContrastTextColor(bgColor: string): string {
  return isLightColor(bgColor) ? 'text-slate-900' : 'text-white';
}
