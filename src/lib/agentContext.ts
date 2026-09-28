import type { AgentExtraContext, AgentNoteReference, AgentSelection } from "@/stores/agent";

/* The context preamble in front of a user's request to AssistantPi. Pure,
   so it can be tested without the stores. */

/** Linked notes sent per message, at most. */
const MAX_LINKED = 20;

export function messageWithContext(
  message: string,
  note: AgentNoteReference | null,
  selection: AgentSelection | null,
  extra: AgentExtraContext = {},
) {
  const mentions = extra.mentions ?? [];
  const linked = (extra.linked ?? []).slice(0, MAX_LINKED);
  if (!note && !selection && mentions.length === 0 && linked.length === 0) return message;

  const context: string[] = [];
  if (note) {
    context.push(
      "The user attached the current Ornata note.",
      JSON.stringify({ source: note.source, title: note.title }),
    );
  }
  if (selection) {
    const available = Math.max(0, 28_000 - message.length);
    const selectedText = selection.text.slice(0, available);
    const truncated = selectedText.length < selection.text.length;
    context.push(
      "The user attached a text selection from an Ornata note.",
      JSON.stringify({
        source: selection.source,
        title: selection.title,
        selectedText,
        truncated,
      }),
    );
  }

  const refs = (notes: AgentNoteReference[]) =>
    JSON.stringify(notes.map(({ source, title }) => ({ source, title })));
  if (mentions.length > 0) {
    context.push("The user mentioned these Ornata notes by name. Read them for this request.", refs(mentions));
  }
  if (linked.length > 0) {
    context.push(
      "Notes linked to or from the current note. Read any that are relevant; skip the rest.",
      refs(linked),
    );
  }

  return [...context, "User request:", message].join("\n\n");
}
