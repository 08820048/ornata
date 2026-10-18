"use client";

import { createContext, useContext, type ReactNode } from "react";
import { COPY, type Copy, type Locale } from "./copy";

const LocaleContext = createContext<Locale>("en");

/** Which language the page is in; each root layout sets it once. */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext);

/** The page's strings, in its language. */
export function useCopy(): Copy {
  return COPY[useLocale()];
}

/** Site-relative link to a page in the current language. */
export function useHref() {
  const locale = useLocale();
  return (path: string) => localePath(locale, path);
}

export function localePath(locale: Locale, path: string): string {
  if (locale === "en") return path;
  return path === "/" ? "/zh" : path.startsWith("/#") ? `/zh${path.slice(1)}` : `/zh${path}`;
}
