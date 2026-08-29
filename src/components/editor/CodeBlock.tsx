import CodeBlock from "@tiptap/extension-code-block";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { Check, Copy } from "lucide-react";
import {
  createHighlightPlugin,
  type Parser,
} from "prosemirror-highlight";
import { createParser } from "prosemirror-highlight/shiki";
import { useEffect, useId, useRef, useState } from "react";
import { ActionSwapIcon } from "@/components/motion/action-swap";
import {
  isSyntaxLanguageLoaded,
  loadSyntaxLanguage,
  normalizeSyntaxLanguage,
  SHIKI_THEMES,
} from "@/lib/syntaxHighlighter";
import { useT } from "@/stores/locale";
import { useVault } from "@/stores/vault";

function MermaidPreview({ source }: { source: string }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [systemThemeVersion, setSystemThemeVersion] = useState(0);
  const id = useId().replace(/:/g, "");
  const theme = useVault((state) => state.theme);
  const t = useT();

  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const refresh = () => setSystemThemeVersion((version) => version + 1);
    media.addEventListener("change", refresh);
    return () => media.removeEventListener("change", refresh);
  }, [theme]);

  useEffect(() => {
    if (!source.trim()) {
      setSvg("");
      setError("");
      return;
    }

    let cancelled = false;
    setError("");
    const timer = window.setTimeout(async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        const styles = getComputedStyle(document.documentElement);
        const color = (token: string) => styles.getPropertyValue(token).trim();
        const ink = color("--ink");
        const muted = color("--muted");
        const panel = color("--panel");
        const sunken = color("--sunken");
        const background = color("--bg");

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          logLevel: "fatal",
          theme: "base",
          fontFamily: styles.getPropertyValue("--font-sans").trim(),
          themeVariables: {
            background,
            primaryColor: panel,
            primaryTextColor: ink,
            primaryBorderColor: muted,
            lineColor: muted,
            secondaryColor: sunken,
            tertiaryColor: background,
            textColor: ink,
            mainBkg: panel,
            nodeBorder: muted,
            clusterBkg: sunken,
            clusterBorder: color("--line"),
            edgeLabelBackground: background,
            noteBkgColor: sunken,
            noteBorderColor: muted,
            noteTextColor: ink,
            actorBkg: panel,
            actorBorder: muted,
            actorTextColor: ink,
            signalColor: ink,
            signalTextColor: ink,
          },
        });
        const result = await mermaid.render(`ornata-mermaid-${id}`, source);
        if (!cancelled) setSvg(result.svg);
      } catch (renderError) {
        if (cancelled) return;
        setSvg("");
        setError(
          renderError instanceof Error
            ? renderError.message
            : String(renderError),
        );
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [id, source, systemThemeVersion, theme]);

  return (
    <div className="mermaid-preview" contentEditable={false}>
      {!source.trim() ? (
        <div className="mermaid-rendering">{t("editor.mermaidEmpty")}</div>
      ) : error ? (
        <div className="mermaid-error" role="status">
          {t("editor.mermaidError")}: {error}
        </div>
      ) : svg ? (
        <div
          className="mermaid-diagram"
          // Mermaid's strict security mode sanitizes the generated SVG and
          // disables links before it reaches this HTML boundary.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="mermaid-rendering">
          {t("editor.mermaidRendering")}
        </div>
      )}
    </div>
  );
}

function CodeBlockView({ node }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = useT();
  const language = node.attrs.language || "plaintext";
  const isMermaid = language.toLowerCase() === "mermaid";

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
      <div className="code-block-toolbar" contentEditable={false}>
        <span className="code-block-language">{language}</span>
        <button
          type="button"
          aria-label={copied ? t("common.copied") : t("editor.copyCode")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={copy}
          className="code-block-copy press"
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
      </div>
      {isMermaid ? (
        <details className="mermaid-details">
          <summary className="mermaid-summary" contentEditable={false}>
            <MermaidPreview source={node.textContent} />
          </summary>
          <pre>
            <NodeViewContent<"code"> as="code" />
          </pre>
        </details>
      ) : (
        <pre>
          <NodeViewContent<"code"> as="code" />
        </pre>
      )}
    </NodeViewWrapper>
  );
}

let shikiParser: Parser | undefined;

const lazyShikiParser: Parser = (options) => {
  const language = normalizeSyntaxLanguage(options.language);
  if (!language || language === "plaintext") return [];
  if (shikiParser && isSyntaxLanguageLoaded(language)) {
    return shikiParser({ ...options, language });
  }

  return loadSyntaxLanguage(language).then((highlighter) => {
    shikiParser ??= createParser(highlighter, {
      themes: SHIKI_THEMES,
      defaultColor: false,
    });
  });
};

export const CodeBlockWithCopy = CodeBlock.extend({
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      createHighlightPlugin({ parser: lazyShikiParser }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});
