import { AlertCircle, ArrowUp, LoaderCircle, Sparkles, Square, X } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { AnimatePresence, motion } from "motion/react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/ui/CopyButton";
import { ChatControls } from "@/components/agent/ChatControls";
import { AgentChanges } from "@/components/agent/AgentChanges";
import { NoteActions, type NOTE_ACTIONS } from "@/components/agent/NoteActions";
import { LinkedToggle, MentionChip, MentionPicker, mentionAt, noteReference, useLinkedNotes, useNoteCandidates } from "@/components/agent/composerContext";
import { EASE_OUT } from "@/lib/ease";
import { noteKey, noteTitle } from "@/lib/noteRef";
import { cx } from "@/lib/utils";
import { useAgent, type AgentNoteReference } from "@/stores/agent";
import { useT } from "@/stores/locale";
import { useUi } from "@/stores/ui";
import { useVault } from "@/stores/vault";
import { AgentSetup } from "@/components/agent/AgentSetup";
import { ApprovalCard, NoteAttachment, SelectionAttachment } from "@/components/agent/AgentAttachments";
import { PermissionSelector } from "@/components/agent/PermissionSelector";
import { ResponseLoading, AgentWelcome, AgentTrace, orbStateForTool, CenteredState, toolLabel } from "@/components/agent/AgentViews";


const PANEL_WIDTH = "clamp(408px, 44vw, 640px)";
const AgentMarkdown = lazy(() =>
  import("@/components/agent/AgentMarkdown").then((module) => ({
    default: module.AgentMarkdown,
  })),
);

export function AgentPanel() {
  const open = useUi((state) => state.agentOpen);
  const setOpen = useUi((state) => state.setAgentOpen);
  const root = useVault((state) => state.root);
  const view = useVault((state) => state.view);
  const connection = useAgent((state) => state.connection);
  const pi = useAgent((state) => state.pi);
  const modelConnection = useAgent((state) => state.modelConnection);
  const connections = useAgent((state) => state.connections);
  const activeConnectionSlug = useAgent((state) => state.activeConnectionSlug);
  const model = useAgent((state) => state.model);
  const messages = useAgent((state) => state.messages);
  const activities = useAgent((state) => state.activities);
  const approval = useAgent((state) => state.approval);
  const error = useAgent((state) => state.error);
  const initialize = useAgent((state) => state.initialize);
  const send = useAgent((state) => state.send);
  const abort = useAgent((state) => state.abort);
  const respondApproval = useAgent((state) => state.respondApproval);
  const saveConnection = useAgent((state) => state.saveConnection);
  const activateConnection = useAgent((state) => state.activateConnection);
  const deleteConnection = useAgent((state) => state.deleteConnection);
  const permission = useAgent((state) => state.permission);
  const setPermission = useAgent((state) => state.setPermission);
  const selection = useAgent((state) => state.selection);
  const setSelection = useAgent((state) => state.setSelection);
  const [draft, setDraft] = useState("");
  // @-mentions and linked-note context (see composerContext).
  const [mentions, setMentions] = useState<AgentNoteReference[]>([]);
  const [includeLinked, setIncludeLinked] = useState(false);
  const [caret, setCaret] = useState(0);
  const [pickerIndex, setPickerIndex] = useState(0);
  const [pickerDismissed, setPickerDismissed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showSetup, setShowSetup] = useState(false);
  // The auto-attached current note can be dismissed; it comes back only when
  // a different note is opened.
  const [noteDismissed, setNoteDismissed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const t = useT();
  const currentNote: AgentNoteReference | null =
    view?.type === "note" && !noteDismissed
      ? {
          sourceKey: noteKey(view.note),
          source:
            view.note.kind === "vault"
              ? `notes/${view.note.rel}`
              : view.note.path,
          title: noteTitle(view.note),
        }
      : null;

  // A newly opened note re-arms the attachment even if the previous one was
  // dismissed — the dismissal only covers the note it was made on.
  useEffect(() => {
    setNoteDismissed(false);
  }, [view?.type === "note" ? noteKey(view.note) : ""]);

  useEffect(() => {
    if (open && root && useAgent.getState().vaultRoot !== root) {
      void initialize(root);
    }
  }, [initialize, open, root]);

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [activities, messages, open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, setOpen]);

  const mention = pickerDismissed ? null : mentionAt(draft, caret);
  const mentionedRels = useMemo(
    () => new Set(mentions.map((note) => note.source.replace(/^notes\//, ""))),
    [mentions],
  );
  const candidates = useNoteCandidates(mention ? mention.query : null, mentionedRels);
  const linkedRel =
    open && currentNote && view?.type === "note" && view.note.kind === "vault" ? view.note.rel : null;
  const linked = useLinkedNotes(linkedRel);

  const pickMention = (rel: string) => {
    if (!mention) return;
    const after = draft.slice(caret);
    const next = draft.slice(0, mention.start) + after.replace(/^\S*/, "");
    setDraft(next);
    setMentions((list) => [...list, noteReference(rel)]);
    setPickerIndex(0);
    const at = mention.start;
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(at, at);
      setCaret(at);
    });
  };

  const runNoteAction = (action: (typeof NOTE_ACTIONS)[number]) => {
    if (!currentNote || connection === "running") return;
    // Suggest links always gets the existing links, so it proposes new ones.
    const withLinks = action.id === "suggestLinks" || includeLinked;
    void send(
      t(action.prompt),
      currentNote,
      { mentions, linked: withLinks && linked ? linked : [] },
      t(action.label),
    );
    setMentions([]);
  };

  const submit = () => {
    const message = draft.trim();
    if (!message || connection === "running") return;
    setDraft("");
    void send(message, currentNote, {
      mentions,
      linked: includeLinked && linked ? linked : [],
    });
    setMentions([]);
  };

  const prepare = () => {
    const agent = useAgent.getState();
    if (root && agent.vaultRoot !== root) void agent.initialize(root);
  };

  const unavailable = connection === "missing";
  const starting = connection === "starting";
  const running = connection === "running";
  // Newest tool call still in flight — drives the live status line above the
  // composer so the agent's current action stays visible while it works.
  const liveActivity =
    activities
      .slice()
      .reverse()
      .find((activity) => activity.status === "running") ?? null;
  const composerStatus = starting
    ? t("agent.status.connecting")
    : running
      ? t("agent.status.working")
      : t("agent.status.ready");
  const showComposerAction = running || Boolean(draft.trim());
  const lastAssistantId = [...messages]
    .reverse()
    .find((message) => message.role === "assistant")?.id;

  return (
    <div className="pointer-events-none absolute inset-0 z-50">
      <AnimatePresence initial={false}>
        {!open ? (
          <motion.button
            key="agent-launcher"
            type="button"
            aria-label={t("agent.launcher")}
            onClick={() => setOpen(true)}
            onMouseEnter={prepare}
            onFocus={prepare}
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.16, ease: EASE_OUT }}
            className="pointer-events-auto absolute bottom-8 right-5 inline-flex h-10 items-center gap-2 rounded-full bg-bg pl-2 pr-4 text-[12.5px] font-medium text-ink shadow-lg shadow-black/10 transition-[box-shadow,transform] duration-100 hover:shadow-xl hover:shadow-black/15 active:scale-[0.96] dark:shadow-black/40 dark:hover:shadow-black/50"
          >
            <span className="grid size-6 place-items-center rounded-full bg-invert text-invert-ink">
              <Sparkles size={12.5} strokeWidth={1.9} />
            </span>
            {t("agent.launcher")}
          </motion.button>
        ) : (
          <motion.aside
            key="agent-overlay"
            role="dialog"
            aria-label={t("agent.title")}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            style={{
              width: PANEL_WIDTH,
              maxWidth: "calc(100% - 24px)",
              height: "75%",
            }}
            className="pointer-events-auto absolute bottom-3 right-3 flex origin-bottom-right flex-col overflow-hidden rounded-[20px] bg-bg shadow-2xl shadow-black/20 will-change-[transform,opacity] dark:shadow-black/60"
          >
        <header className="relative grid h-14 shrink-0 place-items-center px-24">
          {!starting && !unavailable && !showSetup && <ChatControls disabled={running} />}
          <button
            type="button"
            disabled={running}
            onClick={() => setShowSetup(true)}
            className="max-w-full truncate rounded-lg px-2 py-1 text-center font-mono text-[11px] text-faint transition-[background-color,color] duration-100 hover:bg-hover hover:text-ink disabled:pointer-events-none"
          >
            {model ?? t("agent.modelUnknown")}
          </button>
          <button
            type="button"
            aria-label={t("agent.close")}
            onClick={() => setOpen(false)}
            className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-xl text-faint transition-[color,background-color,transform] duration-100 hover:bg-hover hover:text-ink active:scale-[0.96]"
          >
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
          {starting ? (
            <CenteredState
              icon={<LoaderCircle className="animate-spin" size={20} />}
              title={t("agent.starting")}
              detail={pi?.runtimeVersion ? t("agent.piVersion", { version: pi.runtimeVersion }) : undefined}
            />
          ) : unavailable || showSetup ? (
            <AgentSetup
              initial={modelConnection}
              connections={connections}
              activeSlug={activeConnectionSlug}
              onCancel={modelConnection?.credentialConfigured ? () => setShowSetup(false) : undefined}
              onActivate={activateConnection}
              onDelete={deleteConnection}
              onSave={async (connection, apiKey) => {
                const saved = await saveConnection(connection, apiKey);
                if (saved) setShowSetup(false);
                return saved;
              }}
            />
          ) : messages.length === 0 ? (
            <AgentWelcome onSuggestion={setDraft} />
          ) : (
            <div className="flex flex-col gap-6">
              {messages.map((message, index) => (
                <motion.section
                  key={message.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.16, ease: EASE_OUT }}
                  className={cx(index > 0 && "pt-2")}
                >
                  {message.role === "user" ? (
                    <>
                      <p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
                        {t("agent.you")}
                      </p>
                      {message.selection && (
                        <SelectionAttachment selection={message.selection} />
                      )}
                      <div className="text-pretty text-[13px] leading-6 text-ink">
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      {message.id === lastAssistantId && activities.length > 0 && (
                        <AgentTrace activities={activities} />
                      )}
                      <div className={cx("flex items-center gap-2", activities.length > 0 && message.id === lastAssistantId && "mt-5")}>
                        <Sparkles size={13} className="text-muted" />
                        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
                          {t("agent.answer")}
                        </p>
                      </div>
                      <div className="mt-2 text-ink">
                        {message.content ? (
                          <Suspense fallback={<ResponseLoading />}>
                            <AgentMarkdown>{message.content}</AgentMarkdown>
                          </Suspense>
                        ) : (
                          <ResponseLoading />
                        )}
                      </div>
                      {message.changes && message.changes.length > 0 && (
                        <AgentChanges changes={message.changes} />
                      )}
                      {message.content && (
                        <div className="-mb-2 -mr-2 mt-1 flex justify-end">
                          <CopyButton
                            value={message.content}
                            label={t("agent.copyResponse")}
                            className="size-10 rounded-xl"
                          />
                        </div>
                      )}
                    </>
                  )}
                </motion.section>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {!unavailable && !showSetup && (
          <footer className="shrink-0 px-5 pb-4 pt-2">
            <AnimatePresence initial={false}>
              {running && liveActivity && (
                <motion.div
                  key={liveActivity.id}
                  initial={{ opacity: 0, y: 4, filter: "blur(3px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -3, filter: "blur(3px)" }}
                  transition={{ duration: 0.16, ease: EASE_OUT }}
                  className="mb-2 flex items-center gap-2.5 px-1 text-[11px] text-muted"
                >
                  <ThinkingOrb
                    state={orbStateForTool(liveActivity.name)}
                    size={20}
                    className="shrink-0"
                    aria-label={toolLabel(liveActivity.name, t)}
                  />
                  <span className="shrink-0 font-medium text-ink">
                    {toolLabel(liveActivity.name, t)}
                  </span>
                  {liveActivity.detail && (
                    <span className="truncate font-mono text-[10.5px] text-faint" title={liveActivity.detail}>
                      {liveActivity.detail}
                    </span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {approval && (
              <ApprovalCard
                approval={approval}
                onRespond={(allow) => void respondApproval(allow)}
              />
            )}
            {error && (
              <div className="mb-2 flex items-start gap-2 rounded-xl bg-hover px-3 py-2 text-[11.5px] leading-5 text-muted">
                <AlertCircle className="mt-0.5 shrink-0" size={13} />
                <span className="line-clamp-2" title={error}>
                  {error || t("agent.error")}
                </span>
              </div>
            )}
            <div className="relative mt-2 rounded-2xl border border-line-soft bg-bg p-2 transition-[border-color] duration-100 focus-within:border-line">
              <span
                role="status"
                aria-live="polite"
                className="absolute -top-2.5 left-4 z-10 inline-flex h-5 items-center gap-1.5 bg-bg px-1.5 text-[10px] text-faint"
              >
                <span
                  aria-hidden="true"
                  className="relative size-[11px] shrink-0 overflow-hidden"
                >
                  <ThinkingOrb
                    state={starting ? "connecting" : running ? "working" : "breathing"}
                    size={20}
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scale-[0.55]"
                  />
                </span>
                {composerStatus}
              </span>
              <AnimatePresence initial={false}>
                {currentNote && (
                  <motion.div
                    key={currentNote.sourceKey}
                    initial={{ opacity: 0, y: 5, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{
                      opacity: 0,
                      y: -4,
                      filter: "blur(4px)",
                      transition: { duration: 0.14, ease: EASE_OUT },
                    }}
                    transition={{ duration: 0.16, ease: EASE_OUT }}
                  >
                    <NoteAttachment
                      note={currentNote}
                      onRemove={() => setNoteDismissed(true)}
                    />
                  </motion.div>
                )}
                {selection && (
                  <motion.div
                    key={`${selection.sourceKey}:${selection.text}`}
                    initial={{ opacity: 0, y: 5, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{
                      opacity: 0,
                      y: -4,
                      filter: "blur(4px)",
                      transition: { duration: 0.14, ease: EASE_OUT },
                    }}
                    transition={{ duration: 0.16, ease: EASE_OUT }}
                  >
                    <SelectionAttachment
                      compact
                      selection={selection}
                      onRemove={() => setSelection(null)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
              {currentNote && !running && !starting && !draft.trim() && (
                <NoteActions onRun={runNoteAction} />
              )}
              {/* Anchored to the composer box: floats above the whole composer. */}
              {mention && (
                <MentionPicker
                  notes={candidates}
                  active={Math.min(pickerIndex, Math.max(0, candidates.length - 1))}
                  onPick={(note) => pickMention(note.rel)}
                />
              )}
              {(mentions.length > 0 || (linked && linked.length > 0)) && (
                <div className="flex flex-wrap items-center gap-1 px-1 pb-1">
                  {linked && linked.length > 0 && (
                    <LinkedToggle
                      count={linked.length}
                      on={includeLinked}
                      onToggle={() => setIncludeLinked((v) => !v)}
                    />
                  )}
                  {mentions.map((note) => (
                    <MentionChip
                      key={note.sourceKey}
                      note={note}
                      onRemove={() => setMentions((list) => list.filter((m) => m.sourceKey !== note.sourceKey))}
                    />
                  ))}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setCaret(event.target.selectionStart);
                  setPickerDismissed(false);
                  setPickerIndex(0);
                }}
                onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
                onKeyDown={(event) => {
                  if (mention && candidates.length > 0) {
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                      event.preventDefault();
                      const step = event.key === "ArrowDown" ? 1 : -1;
                      setPickerIndex((i) => (i + step + candidates.length) % candidates.length);
                      return;
                    }
                    if (event.key === "Enter" || event.key === "Tab") {
                      event.preventDefault();
                      pickMention(candidates[Math.min(pickerIndex, candidates.length - 1)].rel);
                      return;
                    }
                  }
                  if (mention && event.key === "Escape") {
                    // Close the picker, not the panel.
                    event.preventDefault();
                    event.stopPropagation();
                    setPickerDismissed(true);
                    return;
                  }
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                rows={1}
                disabled={starting}
                placeholder={t("agent.placeholder")}
                className="max-h-32 min-h-10 w-full resize-none bg-transparent px-2.5 py-2 text-[13px] leading-5 text-ink outline-none placeholder:text-faint disabled:opacity-50"
              />
              <div className="flex items-center justify-between pl-2.5">
                <PermissionSelector
                  value={permission}
                  disabled={starting || running}
                  onChange={(next) => void setPermission(next)}
                />
                <AnimatePresence initial={false}>
                  {showComposerAction && (
                    <motion.button
                      key="composer-action"
                      type="button"
                      aria-label={running ? t("agent.stop") : t("agent.send")}
                      onClick={running ? () => void abort() : submit}
                      disabled={!running && starting}
                      initial={{ scale: 0.25, opacity: 0, filter: "blur(4px)" }}
                      animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                      exit={{ scale: 0.25, opacity: 0, filter: "blur(4px)" }}
                      transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                      className="grid size-10 shrink-0 place-items-center rounded-full transition-transform duration-100 active:scale-[0.96] disabled:opacity-25"
                    >
                      <span className="grid size-8 place-items-center rounded-full bg-invert text-invert-ink">
                        <AnimatePresence initial={false} mode="popLayout">
                          <motion.span
                            key={running ? "stop" : "send"}
                            initial={{ scale: 0.25, opacity: 0, filter: "blur(4px)" }}
                            animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                            exit={{ scale: 0.25, opacity: 0, filter: "blur(4px)" }}
                            transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                          >
                            {running ? (
                              <Square size={10} fill="currentColor" />
                            ) : (
                              <ArrowUp size={14} strokeWidth={2.2} />
                            )}
                          </motion.span>
                        </AnimatePresence>
                      </span>
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </footer>
        )}
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

