import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Fragment,
  memo,
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { highlightCode } from "@/lib/syntaxHighlighter";

interface AgentMarkdownProps {
  children: string;
}

const CODE_LANGUAGE_RE = /(?:^|\s)language-([^\s]+)/;
type HighlightResult = NonNullable<
  Awaited<ReturnType<typeof highlightCode>>
>;

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
  const [highlighted, setHighlighted] = useState<HighlightResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHighlighted(null);
    void highlightCode(children, language)
      .then((result) => {
        if (!cancelled) setHighlighted(result);
      })
      .catch(() => {
        if (!cancelled) setHighlighted(null);
      });
    return () => {
      cancelled = true;
    };
  }, [children, language]);

  if (!highlighted) {
    return <code className={`language-${language}`}>{children}</code>;
  }

  return (
    <code className={`language-${language}`}>
      {highlighted.tokens.map((line, lineIndex) => (
        <Fragment key={lineIndex}>
          {line.map((token, tokenIndex) => (
            <span
              key={tokenIndex}
              className="shiki"
              style={token.htmlStyle as CSSProperties}
            >
              {token.content}
            </span>
          ))}
          {lineIndex < highlighted.tokens.length - 1 ? "\n" : null}
        </Fragment>
      ))}
    </code>
  );
}
