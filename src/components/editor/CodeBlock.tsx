import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import markdown from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { Check, Copy } from "lucide-react";
import { createLowlight } from "lowlight";
import { useEffect, useRef, useState } from "react";
import { ActionSwapIcon } from "@/components/motion/action-swap";
import { useT } from "@/stores/locale";

// Register only the languages Ornata notes are most likely to contain. This
// keeps the editor bundle substantially smaller than lowlight's 190+ language
// `all` set while retaining aliases such as js/jsx, ts/tsx, html and sh/zsh.
const lowlight = createLowlight({
  bash,
  c,
  cpp,
  csharp,
  css,
  diff,
  go,
  java,
  javascript,
  json,
  kotlin,
  markdown,
  plaintext,
  python,
  rust,
  sql,
  swift,
  typescript,
  xml,
  yaml,
});

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
