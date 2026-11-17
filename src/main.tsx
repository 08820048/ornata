import React from "react";
import ReactDOM from "react-dom/client";
import "katex/dist/katex.min.css";
import App from "./App";
import { SettingsWindow } from "@/components/settings/SettingsWindow";
import { PrintView } from "@/components/print/PrintView";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { applyPalettes, applyTheme, cachedPalettes, cachedTheme } from "@/lib/theme";
import { currentWindowKind } from "@/lib/settingsSync";
import { ipc } from "@/lib/ipc";
import { applyTypography, cachedTypography, normalizeTypography } from "@/lib/typography";
import "./styles.css";

// Paint the last-used theme before React mounts so neither window flashes the
// wrong background while its config read is in flight.
applyPalettes(cachedPalettes());
applyTheme(cachedTheme());

// Kill macOS autocorrect/autocapitalize/spellcheck in every text field.
document.addEventListener("focusin", (event) => {
  const el = event.target;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.setAttribute("autocorrect", "off");
    el.setAttribute("autocomplete", "off");
    el.autocapitalize = "off";
    el.spellcheck = false;
  }
});

const windowKind = currentWindowKind();

// The note page's size, width and line height. Printed and exported pages
// keep the stock typography, so the print window never applies it.
if (windowKind !== "print") {
  applyTypography(cachedTypography());
  void ipc
    .getTypography()
    .then((value) => applyTypography(normalizeTypography(value)))
    .catch(() => undefined);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {windowKind === "settings" ? (
        <SettingsWindow />
      ) : windowKind === "print" ? (
        <PrintView />
      ) : (
        <App />
      )}
    </ErrorBoundary>
  </React.StrictMode>,
);
