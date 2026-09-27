import type { Editor } from "@tiptap/react";
import { useCallback, useEffect } from "react";
import type { NoteRef } from "@/lib/types";
import { noteKey, noteTitle } from "@/lib/noteRef";
import { useUi } from "@/stores/ui";
import { useAgent } from "@/stores/agent";

/**
 * The pane's bridge to the Agent store: keeps the agent's selection mirror in
 * sync with what this pane has highlighted, and hands over Ask-AI requests.
 */

export function useAgentBridge({
  noteRef,
  activeRef,
  vaultRoot,
}: {
  noteRef: React.RefObject<NoteRef>;
  activeRef: React.RefObject<boolean>;
  vaultRoot: string;
}) {
  const publishAgentSelection = useCallback(
    (text: string) => {
      if (!activeRef.current) return;
      const agent = useAgent.getState();
      if (!text.trim()) {
        agent.setSelection(null);
        return;
      }
      const current = noteRef.current;
      agent.setSelection({
        sourceKey: noteKey(current),
        source: current.kind === "vault" ? `notes/${current.rel}` : current.path,
        title: noteTitle(current),
        text,
      });
    },
    [activeRef, noteRef],
  );

  const askAIAboutSelection = useCallback(
    (request: string, selectedText: string) => {
      const current = noteRef.current;
      const selection = {
        sourceKey: noteKey(current),
        source: current.kind === "vault" ? `notes/${current.rel}` : current.path,
        title: noteTitle(current),
        text: selectedText,
      };
      const noteReference = {
        sourceKey: selection.sourceKey,
        source: selection.source,
        title: selection.title,
      };
      const agent = useAgent.getState();
      agent.setSelection(selection);
      useUi.getState().setAgentOpen(true);
      void (async () => {
        if (vaultRoot && agent.vaultRoot !== vaultRoot) {
          await agent.initialize(vaultRoot).catch(() => undefined);
        }
        const readyAgent = useAgent.getState();
        readyAgent.setSelection(selection);
        await readyAgent.send(request, noteReference);
      })();
    },
    [noteRef, vaultRoot],
  );

  return { publishAgentSelection, askAIAboutSelection };
}

/** Publish the live selection on every selection change while visible. */
export function useAgentSelectionSync({
  editor,
  note,
  active,
  markdownSource,
  publishAgentSelection,
}: {
  editor: Editor | null;
  note: NoteRef;
  active: boolean;
  markdownSource: boolean;
  publishAgentSelection: (text: string) => void;
}) {
  const currentKey = noteKey(note);

  useEffect(() => {
    if (!active || !editor) return;
    if (markdownSource) {
      const agent = useAgent.getState();
      if (agent.selection?.sourceKey === currentKey) agent.setSelection(null);
      return;
    }
    const { from, to, empty } = editor.state.selection;
    publishAgentSelection(
      empty ? "" : editor.state.doc.textBetween(from, to, "\n", "\n"),
    );
    return () => {
      const agent = useAgent.getState();
      if (agent.selection?.sourceKey === currentKey) agent.setSelection(null);
    };
  }, [active, currentKey, editor, markdownSource, publishAgentSelection]);
}
