import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import {
  Command,
  Download,
  FileDown,
  FolderClosed,
  Image as ImageIcon,
  Palette,
  PencilLine,
  Plug,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import type { MessageKey } from "@/lib/i18n";
import { EASE_OUT } from "@/lib/ease";
import { cx } from "@/lib/utils";
import { useSettingsBridge } from "@/lib/useSettingsBridge";
import { McpSection } from "@/components/settings/McpSection";
import { AppToaster } from "@/components/ui/AppToaster";
import { useLocale, useT } from "@/stores/locale";
import { useVault } from "@/stores/vault";
import {
  AppearanceSection,
  EditorSection,
  ExportSection,
  GeneralSection,
  ImageSection,
  ShortcutsSection,
  UpdatesSection,
  VaultSection,
} from "@/components/settings/sections";

type SectionId =
  | "general"
  | "appearance"
  | "editor"
  | "image"
  | "export"
  | "vault"
  | "agents"
  | "shortcuts"
  | "updates";

interface Section {
  id: SectionId;
  icon: LucideIcon;
  labelKey: MessageKey;
  /** Extra search terms (both languages) beyond the translated label. */
  keywords: string[];
  render: () => React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: "general",
    icon: SlidersHorizontal,
    labelKey: "settings.section.general",
    keywords: ["language", "about", "version", "语言", "关于", "版本"],
    render: () => <GeneralSection />,
  },
  {
    id: "appearance",
    icon: Palette,
    labelKey: "settings.section.appearance",
    keywords: ["theme", "dark", "light", "system", "主题", "外观", "深色", "浅色"],
    render: () => <AppearanceSection />,
  },
  {
    id: "editor",
    icon: PencilLine,
    labelKey: "settings.section.editor",
    keywords: ["sound", "outline", "音效", "目录", "编辑器"],
    render: () => <EditorSection />,
  },
  {
    id: "image",
    icon: ImageIcon,
    labelKey: "settings.section.image",
    keywords: ["image", "upload", "picgo", "图片", "上传", "图床"],
    render: () => <ImageSection />,
  },
  {
    id: "export",
    icon: FileDown,
    labelKey: "settings.section.export",
    keywords: ["pdf", "export", "paper", "margin", "a4", "letter", "导出", "纸张", "页边距"],
    render: () => <ExportSection />,
  },
  {
    id: "vault",
    icon: FolderClosed,
    labelKey: "settings.section.vault",
    keywords: ["vault", "folder", "path", "仓库", "文件夹", "路径"],
    render: () => <VaultSection />,
  },
  {
    id: "agents",
    icon: Plug,
    labelKey: "settings.section.agents",
    keywords: ["mcp", "agent", "claude", "codex", "cli", "command line", "智能体", "命令行", "权限"],
    render: () => <McpSection />,
  },
  {
    id: "shortcuts",
    icon: Command,
    labelKey: "settings.section.shortcuts",
    keywords: ["keyboard", "keys", "快捷键", "按键"],
    render: () => <ShortcutsSection />,
  },
  {
    id: "updates",
    icon: Download,
    labelKey: "settings.section.updates",
    keywords: ["update", "upgrade", "更新", "升级"],
    render: () => <UpdatesSection />,
  },
];

/**
 * The standalone settings window. Rendered instead of the main workspace when
 * the current Tauri window's label is "settings" (see `main.tsx`). Two panes:
 * a category rail on the left, the active section on the right.
 */
export function SettingsWindow() {
  const t = useT();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<SectionId>("general");
  const scrollRef = useRef<HTMLDivElement>(null);

  useSettingsBridge();

  useEffect(() => {
    void useLocale.getState().startup();
    void useVault.getState().hydrateSettings();
  }, []);

  // A section switch starts at the top of its own content.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [active]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return SECTIONS;
    return SECTIONS.filter(
      (section) =>
        t(section.labelKey).toLowerCase().includes(needle) ||
        section.keywords.some((keyword) => keyword.includes(needle)),
    );
  }, [query, t]);

  // Keep the active section visible/selected as the filter narrows.
  useEffect(() => {
    if (!filtered.some((section) => section.id === active) && filtered[0]) {
      setActive(filtered[0].id);
    }
  }, [filtered, active]);

  const current = SECTIONS.find((section) => section.id === active) ?? SECTIONS[0];

  return (
    <div className="flex h-full bg-bg text-ink">
      <aside className="flex w-[212px] shrink-0 flex-col border-r border-line-soft bg-panel">
        {/* drag region + traffic-light clearance (overlay title bar) */}
        <div data-tauri-drag-region className="h-12 shrink-0" />

        <div className="px-3 pb-2">
          <label className="relative block">
            <Search
              size={13}
              strokeWidth={2}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("settings.search")}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="h-8 w-full rounded-md border border-line-soft bg-bg pl-7 pr-2 text-[12.5px] text-ink outline-none transition-colors placeholder:text-faint focus:border-line"
            />
          </label>
        </div>

        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-[11.5px] text-faint">
              {t("settings.noResults")}
            </p>
          ) : (
            filtered.map((section) => {
              const Icon = section.icon;
              const selected = section.id === active;
              return (
                <button
                  key={section.id}
                  type="button"
                  aria-current={selected ? "page" : undefined}
                  onClick={() => setActive(section.id)}
                  className={cx(
                    "flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors duration-100",
                    selected
                      ? "bg-invert text-invert-ink"
                      : "text-muted hover:bg-hover hover:text-ink",
                  )}
                >
                  <Icon size={15} strokeWidth={1.75} className="shrink-0" />
                  <span className="truncate">{t(section.labelKey)}</span>
                </button>
              );
            })
          )}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div data-tauri-drag-region className="h-12 shrink-0" />
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[560px] px-8 pb-14">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.14, ease: EASE_OUT }}
            >
              {current.render()}
            </motion.div>
            <p className="mt-10 text-center text-[11px] text-faint">
              {t("settings.footer")}
            </p>
          </div>
        </div>
      </main>

      <AppToaster />
    </div>
  );
}
