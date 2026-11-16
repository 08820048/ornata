import { convertFileSrc } from "@tauri-apps/api/core";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import { TaskItemStatus, TaskListStatus, TaskStatusInput } from "./taskStatus";
import Typography from "@tiptap/extension-typography";
import StarterKit from "@tiptap/starter-kit";
import { BlockPlus } from "./blockPlus";
import { TableHandles } from "./tableHandles";
import { CalloutView } from "./callout";
import { FootnoteView } from "./footnotes";
import { CodeBlockWithCopy } from "./CodeBlock";
import { CodeFold } from "./codeFold";
import { MathBlock, MathInline } from "./Mathematics";
import { StarTask } from "./starTask";
import { BrokenLinks } from "./brokenLinks";
import { HeadingFold } from "./headingFold";
import { MoveBlock } from "./moveBlock";
import { FindReplace } from "./findReplace";
import { SlashHighlight } from "./slashHighlight";
import { WikiLink } from "./wikiLink";
import { NonInclusiveLink } from "./link";
import { t } from "@/stores/locale";

export function isRemoteSource(src: string) {
  return /^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(src);
}

/**
 * Absolute filesystem path of a relative image src under `assetRoot`.
 * Vaults created by Markd may still contain image links pointing at the
 * legacy data directory; those resolve through Ornata's migrated one.
 */
export function resolveAssetPath(assetRoot: string, src: string) {
  const resolved = src.replace(/^\.markd\//, ".ornata/");
  return `${assetRoot.replace(/\/$/, "")}/${resolved}`;
}

/**
 * Image node that keeps a relative path in Markdown while rendering it from
 * the note's asset root (vault root or an external file's parent folder).
 */
export const LocalImage = (assetRoot: string) =>
  Image.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        vaultSrc: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-vault-src"),
          renderHTML: (attributes) =>
            attributes.vaultSrc
              ? { "data-vault-src": attributes.vaultSrc }
              : {},
        },
        // Transient flag for background upload: the node shows its local
        // src with an "uploading" style until the hosted URL replaces it.
        // Never serialized into Markdown (renderMarkdown only uses alt/src).
        uploading: {
          default: false,
          parseHTML: (element) => element.hasAttribute("data-uploading"),
          renderHTML: (attributes) =>
            attributes.uploading ? { "data-uploading": "true" } : {},
        },
      };
    },

    renderHTML({ HTMLAttributes }) {
      const vaultSrc = HTMLAttributes.vaultSrc ?? HTMLAttributes.src;
      // Keep the Markdown untouched; resolve relative paths at render time.
      const src =
        assetRoot && vaultSrc && !isRemoteSource(vaultSrc)
          ? convertFileSrc(resolveAssetPath(assetRoot, vaultSrc))
          : HTMLAttributes.src;
      return ["img", { ...HTMLAttributes, src, "data-vault-src": vaultSrc }];
    },

    renderMarkdown: (node) => {
      const src = node.attrs?.vaultSrc ?? node.attrs?.src ?? "";
      const alt = node.attrs?.alt ?? "";
      return `![${alt}](${src})`;
    },
  });

export function createExtensions(assetRoot: string) {
  return [
    Markdown.configure({
      markedOptions: { breaks: true, gfm: true },
    }),
    StarterKit.configure({ link: false, codeBlock: false }),
    CodeBlockWithCopy,
    CodeFold,
    MathBlock,
    MathInline,
    Typography,
    NonInclusiveLink.configure({
      autolink: true,
      defaultProtocol: "https",
      openOnClick: false,
      // Keep relative hrefs (our internal page links, e.g. "projects/app.md").
      // Without this the default sanitizer resolves them against the app's
      // tauri:// origin and strips them. External URLs still get validated.
      isAllowedUri: (uri, ctx) => {
        if (!/^[a-z][a-z0-9+.-]*:/i.test(uri) && !uri.startsWith("//")) {
          return true;
        }
        return ctx.defaultValidate(uri);
      },
    }),
    LocalImage(assetRoot).configure({ allowBase64: true, inline: false }),
    TaskListStatus,
    TaskItemStatus.configure({ nested: true }),
    StarTask,
    TaskStatusInput,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({ placeholder: () => t("editor.placeholder") }),
    WikiLink,
    BrokenLinks,
    HeadingFold,
    BlockPlus,
    TableHandles,
    CalloutView,
    FootnoteView,
    MoveBlock,
    FindReplace,
    SlashHighlight,
  ];
}
