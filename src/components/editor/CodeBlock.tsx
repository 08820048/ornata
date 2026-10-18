import CodeBlock from "@tiptap/extension-code-block";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { Check, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Copy, Languages, TextSelect } from "lucide-react";
import {
  createHighlightPlugin,
  type Parser,
} from "prosemirror-highlight";
import { createParser } from "prosemirror-highlight/shiki";
import { useEffect, useId, useReducer, useRef, useState } from "react";
import { ActionSwapIcon } from "@/components/motion/action-swap";
import { ContextMenu, type MenuItem } from "@/components/ui/ContextMenu";
import { codeFoldKey, type FoldMeta } from "./codeFold";
import {
  SUPPORTED_LANGUAGES,
  isSyntaxLanguageLoaded,
  loadSyntaxLanguage,
  normalizeSyntaxLanguage,
  SHIKI_THEMES,
} from "@/lib/syntaxHighlighter";
import { nodePos } from "@/lib/nodePos";
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
        const codeSurface = color("--code-surface");
        const diagramSurface = color("--diagram-surface");
        const diagramNode = color("--diagram-node");

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          logLevel: "fatal",
          theme: "base",
          fontFamily: styles.getPropertyValue("--font-sans").trim(),
          themeVariables: {
            background: diagramSurface,
            primaryColor: diagramNode,
            primaryTextColor: ink,
            primaryBorderColor: muted,
            lineColor: muted,
            secondaryColor: codeSurface,
            tertiaryColor: diagramSurface,
            textColor: ink,
            mainBkg: diagramNode,
            nodeBorder: muted,
            clusterBkg: codeSurface,
            clusterBorder: color("--line"),
            edgeLabelBackground: diagramSurface,
            noteBkgColor: diagramNode,
            noteBorderColor: muted,
            noteTextColor: ink,
            actorBkg: diagramNode,
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

function CodeBlockView({ node, editor, getPos, updateAttributes }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; languages: boolean } | null>(null);
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

  const position = () => nodePos(getPos);
  const multiLine = node.textContent.includes("\n");
  const isCollapsed = () => codeFoldKey.getState(editor.state)?.collapsed.has(position() ?? -1) ?? false;
  const collapsed = isCollapsed();

  // A fold change alone doesn't touch this node, so React wouldn't redraw the
  // toolbar: redraw when this block's collapsed state flips.
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const lastCollapsed = useRef(collapsed);
  lastCollapsed.current = collapsed;
  useEffect(() => {
    const onTransaction = () => {
      if (isCollapsed() !== lastCollapsed.current) redraw();
    };
    editor.on("transaction", onTransaction);
    return () => {
      editor.off("transaction", onTransaction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const toggleCollapsed = () => {
    const pos = position();
    if (pos === null) return;
    editor.view.dispatch(editor.state.tr.setMeta(codeFoldKey, { collapse: pos } satisfies FoldMeta));
  };

  const selectBlock = () => {
    const pos = position();
    if (pos === null) return;
    editor.chain().focus().setTextSelection({ from: pos + 1, to: pos + node.nodeSize - 1 }).run();
  };

  const menuItems = (): MenuItem[] => {
    if (menu?.languages) {
      return SUPPORTED_LANGUAGES.map((name) => ({
        label: name,
        icon: name === language ? Check : undefined,
        onSelect: () => updateAttributes({ language: name === "plaintext" ? null : name }),
      }));
    }
    return [
      { label: t("code.selectBlock"), icon: TextSelect, onSelect: selectBlock },
      { label: t("editor.copyCode"), icon: Copy, onSelect: () => void copy() },
      ...(multiLine
        ? [
            {
              label: collapsed ? t("code.expand") : t("code.collapse"),
              icon: collapsed ? ChevronsUpDown : ChevronsDownUp,
              onSelect: toggleCollapsed,
            },
          ]
        : []),
      { label: t("code.setLanguage"), icon: Languages, onSelect: () => openLanguages() },
    ];
  };

  // Reopen as the language list: the first menu closes on select, so defer.
  const anchor = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const openLanguages = () => {
    window.setTimeout(() => setMenu({ ...anchor.current, languages: true }), 0);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(node.textContent);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1400);
  };

  return (
    <NodeViewWrapper className="code-block-wrap">
      <div className="code-block-toolbar" contentEditable={false}>
        <div className="code-block-lead">
          {multiLine && !isMermaid && (
            <button
              type="button"
              aria-label={collapsed ? t("code.expand") : t("code.collapse")}
              aria-expanded={!collapsed}
              onMouseDown={(event) => event.preventDefault()}
              onClick={toggleCollapsed}
              className="code-block-toggle press"
            >
              {collapsed ? <ChevronRight size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
            </button>
          )}
          <button
            type="button"
            aria-haspopup="menu"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              anchor.current = { x: rect.left, y: rect.bottom + 4 };
              setMenu({ ...anchor.current, languages: false });
            }}
            className="code-block-language code-block-chip"
          >
            {language}
          </button>
        </div>
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
      {menu && (
        <ContextMenu
          position={{ x: menu.x, y: menu.y }}
          items={menuItems()}
          onClose={() => setMenu(null)}
        />
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
