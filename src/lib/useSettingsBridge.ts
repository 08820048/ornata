import { useEffect } from "react";
import { listenSettings } from "@/lib/settingsSync";
import { useLocale } from "@/stores/locale";
import { useVault } from "@/stores/vault";

/**
 * Mirror settings changes made in the other window into this window's stores.
 * Mounted once per window; local (same-window) emits are filtered out upstream
 * so updates never ping-pong.
 */
export function useSettingsBridge() {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void listenSettings((patch) => {
      const vault = useVault.getState();
      if (patch.theme) vault.applyRemoteTheme(patch.theme);
      if (patch.language) {
        useLocale.getState().applyRemoteLanguage(patch.language);
      }
      if (patch.outlineSound !== undefined) {
        vault.applyRemoteOutlineSound(patch.outlineSound);
      }
      if (patch.cursorAnimation !== undefined) {
        vault.applyRemoteCursorAnimation(patch.cursorAnimation);
      }
      if (patch.imageUpload) vault.applyRemoteImageUpload(patch.imageUpload);
      if (patch.vault) vault.adoptVaultSnapshot(patch.vault);
    })
      .then((un) => {
        if (cancelled) un();
        else unlisten = un;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
