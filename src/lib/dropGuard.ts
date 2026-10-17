/**
 * The main window lets the webview receive drags itself (`dragDropEnabled:
 * false` in tauri.conf.json) so blocks can be dragged inside the editor. The
 * catch: a file dropped where nothing handles it would make the webview
 * navigate to that file and replace the app. Cancel those drops here; the
 * editor's own image drop still runs first, because the editor sees the event
 * before it bubbles to the window.
 */
const carriesFiles = (event: DragEvent) => Boolean(event.dataTransfer?.types?.includes("Files"));

export function installDropGuard(target: Window = window) {
  const guard = (event: Event) => {
    if (carriesFiles(event as DragEvent)) event.preventDefault();
  };
  target.addEventListener("dragover", guard);
  target.addEventListener("drop", guard);
  return () => {
    target.removeEventListener("dragover", guard);
    target.removeEventListener("drop", guard);
  };
}
