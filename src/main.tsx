import React from "react";
import ReactDOM from "react-dom/client";
import "katex/dist/katex.min.css";
import App from "./App";
import { SettingsWindow } from "@/components/settings/SettingsWindow";
import { QuickCapture } from "@/components/quick/QuickCapture";
import { PrintView } from "@/components/print/PrintView";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { applyPalette, applyTheme, cachedPalette, cachedTheme } from "@/lib/theme";
import { currentWindowKind } from "@/lib/settingsSync";
import "./styles.css";

// Paint the last-used theme before React mounts so neither window flashes the
// wrong background while its config read is in flight.
applyTheme(cachedTheme());
applyPalette(cachedPalette());

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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {windowKind === "settings" ? (
        <SettingsWindow />
      ) : windowKind === "quick-capture" ? (
        <QuickCapture />
      ) : windowKind === "print" ? (
        <PrintView />
      ) : (
        <App />
      )}
    </ErrorBoundary>
  </React.StrictMode>,
);
