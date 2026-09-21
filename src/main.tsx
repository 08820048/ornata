import React from "react";
import ReactDOM from "react-dom/client";
import "katex/dist/katex.min.css";
import App from "./App";
import { SettingsWindow } from "@/components/settings/SettingsWindow";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { applyTheme, cachedTheme } from "@/lib/theme";
import { currentWindowKind } from "@/lib/settingsSync";
import "./styles.css";

// Paint the last-used theme before React mounts so neither window flashes the
// wrong background while its config read is in flight.
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

const isSettingsWindow = currentWindowKind() === "settings";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {isSettingsWindow ? <SettingsWindow /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>,
);
