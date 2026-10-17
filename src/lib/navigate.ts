import { viewOfTab } from "@/lib/noteRef";
import { useNav } from "@/stores/nav";
import { useVault } from "@/stores/vault";

/** Step through the visited-tab trail without adding to it. */
export function goBack() {
  const tab = useNav.getState().back();
  if (tab) useVault.getState().setView(viewOfTab(tab), { record: false });
}

export function goForward() {
  const tab = useNav.getState().forward();
  if (tab) useVault.getState().setView(viewOfTab(tab), { record: false });
}
