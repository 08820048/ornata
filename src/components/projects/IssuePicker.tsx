import { IconLayoutKanban } from "@tabler/icons-react";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { addIssueTo } from "@/lib/captureIssue";
import { useProjects } from "@/stores/projects";

/** The project list shown when an issue is captured from a note outside every project. */
export function IssuePicker() {
  const picker = useProjects((s) => s.picker);
  const projects = useProjects((s) => s.projects);
  if (!picker) return null;
  return (
    <ContextMenu
      position={picker.at}
      onClose={() => useProjects.setState({ picker: null })}
      items={projects.map((project) => ({
        label: project.name,
        icon: IconLayoutKanban,
        onSelect: () => void addIssueTo(project, picker.line),
      }))}
    />
  );
}
