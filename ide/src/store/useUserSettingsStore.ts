import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';
export type Language = 'en' | 'es' | 'zh' | 'pt' | 'ar';

interface UserSettingsState {
  theme: Theme;
  language: Language;
  fontSize: number;
  formatOnSave: boolean;
  setTheme: (theme: Theme) => void;
  setLanguage: (language: Language) => void;
  setFontSize: (fontSize: number) => void;
  setFormatOnSave: (formatOnSave: boolean) => void;
}

export const useUserSettingsStore = create<UserSettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      language: 'en',
      fontSize: 14,
      formatOnSave: true,
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setFontSize: (fontSize) => set({ fontSize }),
      setFormatOnSave: (formatOnSave) => set({ formatOnSave }),
    }),
    {
      name: 'user-settings',
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? window.localStorage : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      })),
    }
  )
);
