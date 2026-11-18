import { useCallback } from "react";
import { create } from "zustand";
import { ipc } from "@/lib/ipc";
import { broadcastSettings } from "@/lib/settingsSync";
import {
  translate,
  type MessageKey,
  type MessageParams,
} from "@/lib/i18n";
import type { Language } from "@/lib/types";

const STORAGE_KEY = "ornata:language";

function storedLanguage(): Language {
  const value = localStorage.getItem(STORAGE_KEY);
  return value === "zh-CN" ? "zh-CN" : "en";
}

function applyLanguage(language: Language) {
  document.documentElement.lang = language;
  localStorage.setItem(STORAGE_KEY, language);
}

interface LocaleState {
  language: Language;
  startup: () => Promise<void>;
  setLanguage: (language: Language) => Promise<void>;
  applyRemoteLanguage: (language: Language) => void;
}

// No cached choice means Ornata has never run on this machine: the config
// still holds its default, so the system language is the better guess (it also
// decides the language of the getting-started notes in a new vault).
export const firstLaunch = localStorage.getItem(STORAGE_KEY) === null;
const initialLanguage = storedLanguage();
applyLanguage(initialLanguage);

export const useLocale = create<LocaleState>((set, get) => ({
  language: initialLanguage,

  startup: async () => {
    try {
      const language = await ipc.getLanguage();
      if (firstLaunch && language === "en" && /^zh\b/i.test(navigator.language)) {
        await get().setLanguage("zh-CN");
        return;
      }
      applyLanguage(language);
      set({ language });
    } catch {
      // The locally cached preference avoids a language flash if IPC is
      // temporarily unavailable (for example, in a browser preview).
    }
  },

  setLanguage: async (language) => {
    applyLanguage(language);
    set({ language });
    broadcastSettings({ language });
    try {
      await ipc.setLanguage(language);
    } catch {
      // Keep the local preference; the next successful change will persist it.
    }
  },

  applyRemoteLanguage: (language) => {
    applyLanguage(language);
    set({ language });
  },
}));

export function t(key: MessageKey, params?: MessageParams) {
  return translate(useLocale.getState().language, key, params);
}

export function useT() {
  const language = useLocale((state) => state.language);
  return useCallback(
    (key: MessageKey, params?: MessageParams) =>
      translate(language, key, params),
    [language],
  );
}
