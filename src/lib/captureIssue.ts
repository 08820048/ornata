import { toast } from "sonner";
import { ipc } from "@/lib/ipc";
import { relToHref } from "@/lib/noteLinks";
import { noteTitle, relIsUnder, vaultNote } from "@/lib/noteRef";
import type { ProjectSummary } from "@/lib/types";
import { notifyNotesChanged } from "@/lib/vaultEvents";
import { t } from "@/stores/locale";
import { useProjects } from "@/stores/projects";

/** The task text for `selection` taken from the note at `noteRel`: one line, ending in a link back. */
export function issueLine(selection: string, noteRel: string): string | null {
  const text = selection
    .replace(/\s+/g, " ")
    .replace(/^([-*+]\s+(\[[ xX/-]\]\s+)?|\d+[.)]\s+)/, "")
    .trim();
  if (!text) return null;
  const label = noteTitle(vaultNote(noteRel)).replace(/[[\]]/g, " ");
  return `${text} [${label}](${relToHref(noteRel)})`;
}

/** The innermost project containing the note, if any. */
export function owningProject(projects: ProjectSummary[], noteRel: string): ProjectSummary | null {
  return (
    projects
      .filter((p) => relIsUnder(noteRel, p.rel))
      .sort((a, b) => b.rel.length - a.rel.length)[0] ?? null
  );
}

export async function addIssueTo(project: ProjectSummary, line: string) {
  try {
    await ipc.addIssue(project.rel, line);
    notifyNotesChanged();
    void useProjects.getState().load();
    toast.success(t("projects.captured", { project: project.name }));
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Turn selected text into an issue in the note's own project, or — for a note
 * outside any project — in the one the user picks at `at`.
 */
export function captureIssue(selection: string, noteRel: string, at: { x: number; y: number }) {
  const line = issueLine(selection, noteRel);
  if (!line) return;
  const { projects } = useProjects.getState();
  if (projects.length === 0) {
    toast.error(t("projects.captureNone"));
    return;
  }
  const owner = owningProject(projects, noteRel);
  if (owner) void addIssueTo(owner, line);
  else useProjects.setState({ picker: { line, at } });
}
