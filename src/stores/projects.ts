import { create } from "zustand";
import { toast } from "sonner";
import { ipc } from "@/lib/ipc";
import type { ProjectSummary } from "@/lib/types";
import { useVault } from "@/stores/vault";

export type SidebarMode = "notes" | "projects";

/**
 * The project space: which folders are projects (the `.ornata-project` marker
 * on disk is the truth; this is a cached listing), which one is shown, and
 * whether the sidebar lists notes or projects. Mode and selection persist per
 * vault in localStorage, like the tab session.
 */
interface ProjectsState {
  root: string;
  projects: ProjectSummary[];
  selected: string | null;
  sidebar: SidebarMode;
  /** An issue waiting for the user to pick its project (captured from a note outside any). */
  picker: { line: string; at: { x: number; y: number } } | null;
  /** Switch to `root`'s saved mode/selection and reload the listing. */
  restore: (root: string) => void;
  load: () => Promise<void>;
  setSidebar: (mode: SidebarMode) => void;
  /** Show `rel` in the projects tab. */
  open: (rel: string) => void;
  mark: (rel: string, on: boolean) => Promise<void>;
}

const key = (root: string) => `ornata.projects:${root}`;

function persist(state: ProjectsState) {
  if (!state.root) return;
  try {
    localStorage.setItem(
      key(state.root),
      JSON.stringify({ sidebar: state.sidebar, selected: state.selected }),
    );
  } catch {
    // Storage full or unavailable: the layout just won't be remembered.
  }
}

export const useProjects = create<ProjectsState>((set, get) => ({
  root: "",
  projects: [],
  selected: null,
  sidebar: "notes",
  picker: null,

  restore: (root) => {
    if (root === get().root) return;
    let saved: { sidebar?: SidebarMode; selected?: string | null } = {};
    try {
      saved = JSON.parse(localStorage.getItem(key(root)) ?? "{}");
    } catch {
      saved = {};
    }
    set({
      root,
      projects: [],
      sidebar: saved.sidebar === "projects" ? "projects" : "notes",
      selected: typeof saved.selected === "string" ? saved.selected : null,
    });
    void get().load();
  },

  load: async () => {
    const root = get().root;
    try {
      const projects = await ipc.listProjects();
      if (get().root !== root) return;
      const { selected } = get();
      // A renamed or unmarked project falls back to the first one.
      const keep = projects.some((p) => p.rel === selected);
      set({ projects, selected: keep ? selected : (projects[0]?.rel ?? null) });
    } catch {
      if (get().root === root) set({ projects: [] });
    }
  },

  setSidebar: (sidebar) => {
    set({ sidebar });
    persist(get());
  },

  open: (rel) => {
    set({ selected: rel });
    persist(get());
    useVault.getState().setView({ type: "projects" });
  },

  mark: async (rel, on) => {
    try {
      await ipc.setProject(rel, on);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return;
    }
    await get().load();
    if (on) {
      set({ sidebar: "projects" });
      get().open(rel);
    }
  },
}));
