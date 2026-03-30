import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';
export type Language = 'en' | 'es' | 'zh' | 'pt' | 'ar';

export interface HslToken {
  h: number;
  s: number;
  l: number;
}

export interface BrandThemeTokens {
  primary: HslToken;
  secondary: HslToken;
  background: HslToken;
}

const DEFAULT_BRAND_THEME: BrandThemeTokens = {
  primary: { h: 225, s: 73, l: 62 },
  secondary: { h: 220, s: 16, l: 18 },
  background: { h: 220, s: 20, l: 10 },
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const toCssHsl = (token: HslToken) => `${token.h} ${token.s}% ${token.l}%`;

const textTone = (token: HslToken) => (token.l > 45 ? '220 20% 8%' : '210 20% 96%');

export function applyBrandThemeTokens(tokens: BrandThemeTokens) {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;

  const background = tokens.background;
  const primary = tokens.primary;
  const secondary = tokens.secondary;

  root.style.setProperty('--background', toCssHsl(background));
  root.style.setProperty('--foreground', textTone(background));

  root.style.setProperty('--primary', toCssHsl(primary));
  root.style.setProperty('--primary-foreground', textTone(primary));

  root.style.setProperty('--secondary', toCssHsl(secondary));
  root.style.setProperty('--secondary-foreground', textTone(secondary));

  root.style.setProperty('--card', toCssHsl({ ...background, l: clamp(background.l + 3, 5, 96) }));
  root.style.setProperty('--card-foreground', textTone(background));
  root.style.setProperty('--popover', toCssHsl({ ...background, l: clamp(background.l + 5, 5, 96) }));
  root.style.setProperty('--popover-foreground', textTone(background));
  root.style.setProperty('--muted', toCssHsl({ ...background, l: clamp(background.l + 6, 5, 96) }));
  root.style.setProperty('--muted-foreground', toCssHsl({ ...background, l: clamp(background.l + 46, 35, 92) }));
  root.style.setProperty('--border', toCssHsl({ ...background, l: clamp(background.l + 10, 8, 94) }));
  root.style.setProperty('--input', toCssHsl({ ...background, l: clamp(background.l + 10, 8, 94) }));
  root.style.setProperty('--ring', toCssHsl(primary));
  root.style.setProperty('--sidebar-background', toCssHsl({ ...background, l: clamp(background.l - 2, 4, 90) }));
  root.style.setProperty('--sidebar-border', toCssHsl({ ...background, l: clamp(background.l + 8, 8, 94) }));
}

interface UserSettingsState {
  theme: Theme;
  language: Language;
  brandTheme: BrandThemeTokens;
  fontSize: number;
  formatOnSave: boolean;
  experimentalLocalBuild: boolean;
  setTheme: (theme: Theme) => void;
  setLanguage: (language: Language) => void;
  setBrandTheme: (brandTheme: BrandThemeTokens) => void;
  setFontSize: (fontSize: number) => void;
  setFormatOnSave: (formatOnSave: boolean) => void;
  setExperimentalLocalBuild: (enabled: boolean) => void;
}

export const useUserSettingsStore = create<UserSettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      language: 'en',
      brandTheme: DEFAULT_BRAND_THEME,
      fontSize: 14,
      formatOnSave: true,
      experimentalLocalBuild: false,
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setBrandTheme: (brandTheme) => {
        applyBrandThemeTokens(brandTheme);
        set({ brandTheme });
      },
      setFontSize: (fontSize) => set({ fontSize }),
      setFormatOnSave: (formatOnSave) => set({ formatOnSave }),
      setExperimentalLocalBuild: (experimentalLocalBuild) => set({ experimentalLocalBuild }),
    }),
    {
      name: 'user-settings',
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? window.localStorage : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      })),
      onRehydrateStorage: () => (state) => {
        if (state?.brandTheme) {
          applyBrandThemeTokens(state.brandTheme);
        }
      },
    }
  )
);
