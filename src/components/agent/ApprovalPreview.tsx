import { useEffect, useMemo, useState } from "react";
import { type DiffRow, diffLines } from "@/lib/diff";
import { ipc } from "@/lib/ipc";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";

export interface ApprovalRequest {
  resource: string;
  action: string;
  args: Record<string, unknown>;
}

const str = (value: unknown) => (typeof value === "string" ? value : "");
/** Unchanged lines kept around each change in the diff. */
const CONTEXT = 2;
const PREVIEW_LINES = 40;

/**
 * What an approval would actually do — the exact command, the diff of an
 * edit, the note a create would write, the path a delete removes — so the
 * user never approves blind.
 */
export function ApprovalPreview({ approval }: { approval: ApprovalRequest }) {
  const t = useT();
  const { resource, action, args } = approval;

  if (resource === "bash") {
    return (
      <Section title={t("agent.approval.runCommand")}>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-sunken px-2.5 py-2 font-mono text-[11px] leading-[1.55] text-ink">
          {str(args.command)}
        </pre>
      </Section>
    );
  }

  if (resource === "notes") {
    const path = str(args.path);
    switch (action) {
      case "update":
        return (
          <Section title={t("agent.approval.edit")} target={path}>
            <EditDiff path={path} after={str(args.content)} />
          </Section>
        );
      case "create": {
        const target = [str(args.directory), str(args.title)].filter(Boolean).join("/");
        const content = str(args.content);
        return (
          <Section title={t("agent.approval.create")} target={target}>
            {content && <Excerpt text={content} />}
          </Section>
        );
      }
      case "delete":
        return <Section title={t("agent.approval.delete")} target={path} danger />;
      case "rename":
        return <Section title={t("agent.approval.rename")} target={`${path} → ${str(args.name)}`} />;
      case "move":
        return <Section title={t("agent.approval.move")} target={`${path} → ${str(args.directory) || "/"}`} />;
      case "createFolder": {
        const target = [str(args.directory), str(args.name)].filter(Boolean).join("/");
        return <Section title={t("agent.approval.createFolder")} target={target} />;
      }
    }
  }

  return <Section title={`${resource} · ${action}`} />;
}

function Section({
  title,
  target,
  danger,
  children,
}: {
  title: string;
  target?: string;
  danger?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className={cx("text-[12px] font-medium", danger ? "text-danger" : "text-ink")}>{title}</p>
      {target && (
        <p className="mt-0.5 break-all font-mono text-[10.5px] text-muted" title={target}>
          {target}
        </p>
      )}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

function Excerpt({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-sunken px-2.5 py-2 font-mono text-[11px] leading-[1.55] text-muted">
      {lines.slice(0, PREVIEW_LINES).join("\n")}
      {lines.length > PREVIEW_LINES ? "\n…" : ""}
    </pre>
  );
}

/** Line diff of the note as it is now against what the edit would write. */
function EditDiff({ path, after }: { path: string; after: string }) {
  const t = useT();
  const [before, setBefore] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ipc
      .readNote(path)
      .then((text) => {
        if (!cancelled) setBefore(text);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const rows = useMemo(() => (before === null ? null : compact(diffLines(before, after))), [before, after]);

  if (failed) return <Excerpt text={after} />;
  if (!rows) return <p className="text-[11px] text-faint">{t("agent.approval.loadingDiff")}</p>;
  const added = rows.filter((row) => row.kind === "add").length;
  const removed = rows.filter((row) => row.kind === "del").length;
  if (added === 0 && removed === 0) {
    return <p className="text-[11px] text-faint">{t("agent.approval.noChanges")}</p>;
  }
  return (
    <div>
      <p className="mb-1 font-mono text-[10px] tabular-nums text-faint">
        +{added} −{removed}
      </p>
      <div className="max-h-48 overflow-auto rounded-lg bg-sunken py-1.5 font-mono text-[11px] leading-[1.55]">
        {rows.map((row, index) =>
          row.kind === "gap" ? (
            <div key={index} className="px-2.5 text-faint">
              ⋯
            </div>
          ) : (
            <div
              key={index}
              className={cx(
                "whitespace-pre-wrap break-words px-2.5",
                row.kind === "add" && "bg-active text-ink",
                row.kind === "del" && "text-faint line-through",
                row.kind === "same" && "text-muted",
              )}
            >
              <span className="mr-1.5 select-none text-faint">
                {row.kind === "add" ? "+" : row.kind === "del" ? "−" : " "}
              </span>
              {row.text || " "}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

type ShownRow = DiffRow | { kind: "gap"; text: "" };

/** Keep changes plus a little context; fold unchanged runs (including any
 *  before the first change or after the last) to ⋯. */
function compact(rows: DiffRow[]): ShownRow[] {
  const keep = rows.map(() => false);
  rows.forEach((row, index) => {
    if (row.kind === "same") return;
    for (let k = Math.max(0, index - CONTEXT); k <= Math.min(rows.length - 1, index + CONTEXT); k += 1) {
      keep[k] = true;
    }
  });
  const out: ShownRow[] = [];
  rows.forEach((row, index) => {
    if (keep[index]) out.push(row);
    else if (out[out.length - 1]?.kind !== "gap") out.push({ kind: "gap", text: "" });
  });
  return out;
}
