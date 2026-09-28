/* How a saved Pi conversation is shown in the panel. Pure, so it's testable
   without starting the sidecar. */

/** The conversation as the panel shows it: user requests without the
 *  attached-context preamble, and the assistant's text replies. */
export function transcript(current: { messages: unknown[] }) {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const message of current.messages as { role?: string; content?: unknown }[]) {
    const text = messageText(message.content);
    if (!text) continue;
    if (message.role === "user") {
      out.push({ role: "user", content: userRequest(text) });
    } else if (message.role === "assistant") {
      out.push({ role: "assistant", content: text });
    }
  }
  return out;
}

/** A user turn as the user typed it: without the host's permission block
 *  and the note/selection context the panel prepends. */
export function userRequest(text: string) {
  const unwrapped = text.replace(/^\s*<ornata-permission>[\s\S]*?<\/ornata-permission>\s*/, "");
  const marker = "User request:";
  const at = unwrapped.lastIndexOf(marker);
  return (at >= 0 ? unwrapped.slice(at + marker.length) : unwrapped).trim();
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part && typeof part === "object" && (part as { type?: string }).type === "text" ? String((part as { text?: unknown }).text ?? "") : ""))
    .join("")
    .trim();
}
