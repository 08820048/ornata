import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActionSwapIcon } from "@/components/motion/action-swap";
import { lowlight } from "@/lib/syntaxHighlighter";
import { useT } from "@/stores/locale";

function CodeBlockView({ node }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = useT();

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    await navigator.clipboard.writeText(node.textContent);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1400);
  };

  return (
    <NodeViewWrapper className="code-block-wrap">
      <pre>
        <NodeViewContent<"code"> as="code" />
      </pre>
      <button
        type="button"
        contentEditable={false}
        aria-label={copied ? t("common.copied") : t("editor.copyCode")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={copy}
        className="code-block-copy"
      >
        <ActionSwapIcon
          value={copied ? "copied" : "copy"}
          animation="roll"
          className="h-[13px] w-[13px]"
        >
          {copied ? (
            <Check size={13} strokeWidth={2} />
          ) : (
            <Copy size={13} strokeWidth={2} />
          )}
        </ActionSwapIcon>
        <span>{copied ? t("common.copied") : t("common.copy")}</span>
      </button>
    </NodeViewWrapper>
  );
}

export const CodeBlockWithCopy = CodeBlockLowlight.extend({
  // CodeBlockLowlight adds its plugin by calling its parent plugin factory.
  // Extending it for a React NodeView makes that factory appear twice in the
  // inherited chain, so retain a single lowlight decoration pass.
  addProseMirrorPlugins() {
    let hasLowlight = false;
    return (this.parent?.() ?? []).filter((plugin) => {
      const key = (plugin.spec.key as { key?: string } | undefined)?.key;
      if (!key?.startsWith("lowlight$")) return true;
      if (hasLowlight) return false;
      hasLowlight = true;
      return true;
    });
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
}).configure({ lowlight });
