import { tabOfView, viewOfTab } from "@/lib/noteRef";
import type { StepDirection } from "@/lib/split";
import { useTabs } from "@/stores/tabs";
import { useVault } from "@/stores/vault";

/** Step the focused pane back or forward through its own history, without
 *  adding to it. A note that is open in another pane is skipped over. */
function step(direction: StepDirection) {
  const view = useVault.getState().view;
  if (!view) return;
  const tab = useTabs.getState().step(direction, tabOfView(view));
  if (tab) useVault.getState().setView(viewOfTab(tab), { record: false });
}

export const goBack = () => step("back");
export const goForward = () => step("forward");
