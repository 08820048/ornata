import { Toaster } from "sonner";

/** App-wide toast host, shared by the main and settings windows. */
export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      gap={8}
      offset={16}
      toastOptions={{
        style: {
          background: "var(--panel)",
          color: "var(--ink)",
          border: "1px solid var(--line)",
          fontSize: "13px",
          borderRadius: "10px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        },
        // Sonner colors actions from its own theme; use our inverted pill.
        actionButtonStyle: {
          background: "var(--invert)",
          color: "var(--invert-ink)",
          borderRadius: "6px",
        },
      }}
    />
  );
}
