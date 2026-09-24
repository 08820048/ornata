import Link from "@tiptap/extension-link";
import { hrefToRel } from "@/lib/noteLinks";

// Tiptap makes Link inclusive whenever autolink is enabled, which causes text
// typed at the end of a pasted/auto-detected URL to inherit the link mark.
// Keep automatic URL detection, but make the right edge a hard mark boundary.
export const NonInclusiveLink = Link.extend({
  inclusive: false,
  addAttributes() {
    return {
      ...this.parent?.(),
      decodedHref: {
        default: null,
        parseHTML: (element) => {
          const href = element.getAttribute("href");
          if (!href) return null;
          const decoded = hrefToRel(href);
          return decoded; // Store decoded path for display
        },
        renderHTML: () => {
          // Don't render decodedHref to HTML, it's only for internal use
          return {};
        },
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    // For internal links, show decoded path in title attribute for better UX
    const decoded = hrefToRel(HTMLAttributes.href);
    if (decoded) {
      HTMLAttributes.title = decoded;
    }
    return ["a", HTMLAttributes, 0];
  },
}).configure({
  HTMLAttributes: { class: "ornata-link" },
});
