import Link from "@tiptap/extension-link";

// Tiptap makes Link inclusive whenever autolink is enabled, which causes text
// typed at the end of a pasted/auto-detected URL to inherit the link mark.
// Keep automatic URL detection, but make the right edge a hard mark boundary.
export const NonInclusiveLink = Link.extend({
  inclusive: false,
}).configure({
  HTMLAttributes: { class: "ornata-link" },
});
