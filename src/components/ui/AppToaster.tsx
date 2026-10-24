import { Toaster } from "sonner";
import { useVault } from "@/stores/vault";

/** App-wide toast host, shared by the main and settings windows. Colours,
 *  border, radius and shadow come from the theme tokens in `styles.css`. */
export function AppToaster() {
  const theme = useVault((s) => s.theme);
  // Sonner tints its icons and close button from its own light/dark flag, so
  // hand it the app's mode rather than letting it read the OS.
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return (
    <Toaster
      theme={dark ? "dark" : "light"}
      position="top-right"
      gap={8}
      offset={16}
      toastOptions={{
        // Sonner colors actions from its own theme; use our inverted pill.
        actionButtonStyle: {
          background: "var(--invert)",
          color: "var(--invert-ink)",
          borderRadius: "4px",
        },
      }}
    />
  );
}
