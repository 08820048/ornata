import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { transcript, userRequest } from "../agent-sidecar/transcript";

test("user turns lose the permission block and attached context", () => {
  expect(userRequest("<ornata-permission>READ ONLY. …</ornata-permission>\n\nHello there")).toBe("Hello there");
  expect(
    userRequest(
      "<ornata-permission>AUTO.</ornata-permission>\n\nThe user attached the current Ornata note.\n\n{\"title\":\"Q3\"}\n\nUser request:\n\nSummarize this",
    ),
  ).toBe("Summarize this");
});

test("a saved conversation survives a restart and replays as the panel shows it", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "ornata-chat-"));
  const dir = path.join(vault, ".ornata", "agent", "sessions");
  const first = SessionManager.create(vault, dir);
  first.appendMessage({
    role: "user",
    content: "<ornata-permission>READ ONLY.</ornata-permission>\n\nUser request:\n\nWhat did I plan for Q3?",
    timestamp: Date.now(),
  } as never);
  first.appendMessage({
    role: "assistant",
    content: [
      { type: "toolCall", id: "t1", name: "read", arguments: { path: "Q3.md" } },
      { type: "text", text: "You planned instant note switching." },
    ],
    api: "openai-completions", provider: "test", model: "m",
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop", timestamp: Date.now(),
  } as never);

  // "Restart": resume the most recent conversation from disk.
  const resumed = SessionManager.continueRecent(vault, dir);
  expect(resumed.getSessionId()).toBe(first.getSessionId());
  expect(transcript({ messages: resumed.buildSessionContext().messages })).toEqual([
    { role: "user", content: "What did I plan for Q3?" },
    { role: "assistant", content: "You planned instant note switching." },
  ]);

  const listed = await SessionManager.list(vault, dir);
  expect(listed.map((chat) => chat.id)).toEqual([first.getSessionId()]);
  expect(userRequest(listed[0].firstMessage)).toBe("What did I plan for Q3?");
});
