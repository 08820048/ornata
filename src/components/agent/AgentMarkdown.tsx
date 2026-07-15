import { openUrl } from "@tauri-apps/plugin-opener";
import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface AgentMarkdownProps {
  children: string;
}

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
        }}
      >
        {children}
      </Markdown>
    </div>
  );
});
