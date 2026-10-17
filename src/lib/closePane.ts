import { viewOfTab } from "@/lib/noteRef";
import { neighbourOf } from "@/lib/split";
import type { TabRef } from "@/lib/types";
import { useTabs } from "@/stores/tabs";
import { useVault } from "@/stores/vault";

/** Close the pane showing `tab` and hand focus to its neighbour — otherwise
 *  the closed note would stay the focused view with no pane to live in. */
export function closePaneAndRefocus(tab: TabRef) {
  const split = useTabs.getState().split;
  const next = split ? neighbourOf(split, tab) : null;
  useTabs.getState().closePane(tab);
  if (next) useVault.getState().setView(viewOfTab(next));
}
