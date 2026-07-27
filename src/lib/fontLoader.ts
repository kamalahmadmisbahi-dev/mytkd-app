const fontCache = new Map<string, string>();

export async function loadFontAsDataUrl(url: string): Promise<string | null> {
  if (fontCache.has(url)) return fontCache.get(url)!;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    fontCache.set(url, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}

export const FONT_PAYAMI = 'https://www.services.siraatpublications.com/fonts/Payami-Web.ttf';
export const FONT_KITAB = 'https://www.services.siraatpublications.com/fonts/Kitab-Bold.ttf';

let loadedFonts: { payami: string | null; kitab: string | null } | null = null;

export async function loadAllFonts(): Promise<{ payami: string | null; kitab: string | null }> {
  if (loadedFonts) return loadedFonts;
  const [payami, kitab] = await Promise.all([
    loadFontAsDataUrl(FONT_PAYAMI),
    loadFontAsDataUrl(FONT_KITAB),
  ]);
  loadedFonts = { payami, kitab };
  return loadedFonts;
}
