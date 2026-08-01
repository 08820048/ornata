import { convertFileSrc } from "@tauri-apps/api/core";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Typography from "@tiptap/extension-typography";
import StarterKit from "@tiptap/starter-kit";
import { CodeBlockWithCopy } from "./CodeBlock";
import { WikiLink } from "./wikiLink";
import { NonInclusiveLink } from "./link";
import { t } from "@/stores/locale";

function isRemoteSource(src: string) {
  return /^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(src);
}

/**
 * Image node that keeps a relative path in Markdown while rendering it from
 * the note's asset root (vault root or an external file's parent folder).
 */
const LocalImage = (assetRoot: string) =>
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
      };
    },

    renderHTML({ HTMLAttributes }) {
      const vaultSrc = HTMLAttributes.vaultSrc ?? HTMLAttributes.src;
      // Vaults created by Markd may still contain image links pointing at the
      // legacy data directory. Keep the Markdown untouched while resolving
      // those links through Ornata's migrated asset directory at render time.
      const resolvedVaultSrc = vaultSrc?.replace(/^\.markd\//, ".ornata/");
      const src =
        assetRoot && resolvedVaultSrc && !isRemoteSource(resolvedVaultSrc)
          ? convertFileSrc(`${assetRoot.replace(/\/$/, "")}/${resolvedVaultSrc}`)
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
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({ placeholder: () => t("editor.placeholder") }),
    WikiLink,
  ];
}
