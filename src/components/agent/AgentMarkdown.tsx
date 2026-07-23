import { openUrl } from "@tauri-apps/plugin-opener";
import { createElement, memo, useMemo, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { lowlight } from "@/lib/syntaxHighlighter";

interface AgentMarkdownProps {
  children: string;
}

const CODE_LANGUAGE_RE = /(?:^|\s)language-([^\s]+)/;
type HighlightNode = ReturnType<typeof lowlight.highlight>["children"][number];
type HighlightElement = Extract<HighlightNode, { type: "element" }>;

export const AgentMarkdown = memo(function AgentMarkdown({
  children,
}: AgentMarkdownProps) {
  return (
    <div className="agent-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: linkChildren, title }) => (
            <a
              href={href}
              title={title}
              onClick={(event) => {
                event.preventDefault();
                if (href && /^(https?:|mailto:)/i.test(href)) {
                  void openUrl(href);
                }
              }}
            >
              {linkChildren}
            </a>
          ),
          table: ({ children: tableChildren }) => (
            <div className="agent-markdown-table">
              <table>{tableChildren}</table>
            </div>
          ),
          code: ({ className, children: codeChildren }) => {
            const language = CODE_LANGUAGE_RE.exec(className ?? "")?.[1];
            if (!language) {
              return <code className={className}>{codeChildren}</code>;
            }

            return (
              <HighlightedCode language={language}>
                {String(codeChildren).replace(/\n$/, "")}
              </HighlightedCode>
            );
          },
        }}
      >
        {children}
      </Markdown>
    </div>
  );
});

function HighlightedCode({
  language,
  children,
}: {
  language: string;
  children: string;
}) {
  const highlighted = useMemo(() => {
    try {
      return lowlight.highlight(language.toLowerCase(), children).children;
    } catch {
      return null;
    }
  }, [children, language]);

  if (!highlighted) {
    return <code className={`language-${language}`}>{children}</code>;
  }

  return (
    <code className={`hljs language-${language}`}>
      {highlighted.map(renderHighlightedNode)}
    </code>
  );
}

function renderHighlightedNode(node: HighlightNode, index: number): ReactNode {
  if (node.type === "text") return node.value;
  if (node.type !== "element") return null;

  const className = classNameOf(node);
  return createElement(
    node.tagName,
    { key: index, ...(className ? { className } : {}) },
    node.children.map(renderHighlightedNode),
  );
}

function classNameOf(node: HighlightElement) {
  const value = node.properties.className;
  return Array.isArray(value) ? value.join(" ") : undefined;
}
