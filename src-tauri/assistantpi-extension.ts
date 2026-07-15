import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const BRIDGE_TITLE = "__ORNATA_BRIDGE__";

type BridgeResponse =
  | { ok: true; value: unknown }
  | { ok: false; error: { message: string } };

async function callOrnata(
  resource: "notes" | "todos" | "bookmarks" | "permission",
  params: Record<string, unknown>,
  ctx: Parameters<ReturnType<typeof defineTool>["execute"]>[4],
) {
  const request = JSON.stringify({ resource, action: params.action, args: params });
  const raw = await ctx.ui.input(BRIDGE_TITLE, request, { timeout: 30_000 });
  if (!raw) throw new Error("Ornata did not respond to the tool request");

  const response = JSON.parse(raw) as BridgeResponse;
  if (!response.ok) throw new Error(response.error.message);
  const text = JSON.stringify(response.value, null, 2);
  return {
    content: [{ type: "text" as const, text }],
    details: { resource, action: params.action },
  };
}

const notesTool = defineTool({
  name: "ornata_notes",
  label: "Ornata Notes",
  description:
    "Read, search, create, update, organize, or delete notes in the current Ornata vault. Mutating actions are enforced by the permission mode selected in Ornata.",
  promptSnippet: "Read and manage notes through Ornata's permission-controlled notes API",
  parameters: Type.Object({
    action: Type.Union([
      Type.Literal("list"),
      Type.Literal("search"),
      Type.Literal("read"),
      Type.Literal("create"),
      Type.Literal("update"),
      Type.Literal("createFolder"),
      Type.Literal("rename"),
      Type.Literal("move"),
      Type.Literal("delete"),
    ]),
    path: Type.Optional(Type.String({ description: "Note or folder path relative to notes/" })),
    query: Type.Optional(Type.String({ description: "Search query" })),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
    directory: Type.Optional(Type.String({ description: "Target directory relative to notes/; empty means root" })),
    title: Type.Optional(Type.String({ description: "Title for a new or renamed note" })),
    name: Type.Optional(Type.String({ description: "Folder name" })),
    content: Type.Optional(Type.String({ description: "Complete Markdown content for the note" })),
  }),
  async execute(_id, params, _signal, _update, ctx) {
    return callOrnata("notes", params, ctx);
  },
});

const todosTool = defineTool({
  name: "ornata_todos",
  label: "Ornata Todos",
  description:
    "List and manage Ornata todos and todo tags. Mutating actions are enforced by the permission mode selected in Ornata.",
  promptSnippet: "Read and manage Ornata todos through its permission-controlled API",
  parameters: Type.Object({
    action: Type.Union([
      Type.Literal("list"),
      Type.Literal("listTags"),
      Type.Literal("add"),
      Type.Literal("update"),
      Type.Literal("toggle"),
      Type.Literal("setTags"),
      Type.Literal("createTag"),
      Type.Literal("deleteTag"),
      Type.Literal("delete"),
      Type.Literal("clearCompleted"),
    ]),
    id: Type.Optional(Type.String({ description: "Todo ID returned by list" })),
    text: Type.Optional(Type.String({ description: "Todo text" })),
    tags: Type.Optional(Type.Array(Type.String())),
    name: Type.Optional(Type.String({ description: "Tag name" })),
  }),
  async execute(_id, params, _signal, _update, ctx) {
    return callOrnata("todos", params, ctx);
  },
});

const bookmarksTool = defineTool({
  name: "ornata_bookmarks",
  label: "Ornata Bookmarks",
  description:
    "List and manage Ornata bookmarks and bookmark tags. Mutating actions are enforced by the permission mode selected in Ornata.",
  promptSnippet: "Read and manage Ornata bookmarks through its permission-controlled API",
  parameters: Type.Object({
    action: Type.Union([
      Type.Literal("list"),
      Type.Literal("listTags"),
      Type.Literal("add"),
      Type.Literal("updateTitle"),
      Type.Literal("setTags"),
      Type.Literal("createTag"),
      Type.Literal("deleteTag"),
      Type.Literal("delete"),
    ]),
    id: Type.Optional(Type.String({ description: "Bookmark ID returned by list" })),
    url: Type.Optional(Type.String()),
    title: Type.Optional(Type.String()),
    tags: Type.Optional(Type.Array(Type.String())),
    name: Type.Optional(Type.String({ description: "Tag name" })),
  }),
  async execute(_id, params, _signal, _update, ctx) {
    return callOrnata("bookmarks", params, ctx);
  },
});

export default function (pi: ExtensionAPI) {
  pi.registerTool(notesTool);
  pi.registerTool(todosTool);
  pi.registerTool(bookmarksTool);

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName.startsWith("ornata_")) return undefined;
    const result = await callOrnata(
      "permission",
      { action: "authorizeTool", tool: event.toolName },
      ctx,
    );
    const response = JSON.parse(result.content[0].text) as { allowed?: boolean; reason?: string };
    return response.allowed
      ? undefined
      : { block: true, reason: response.reason ?? "Blocked by the selected Ornata permission mode" };
  });

  pi.on("tool_result", async (event, ctx) => {
    if (event.isError || event.toolName.startsWith("ornata_")) return undefined;
    if (!["edit", "write", "bash"].includes(event.toolName)) return undefined;
    await callOrnata(
      "permission",
      { action: "toolCompleted", tool: event.toolName },
      ctx,
    );
    return undefined;
  });
}
