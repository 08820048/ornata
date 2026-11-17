"use client";

import {
  Check,
  ChevronRight,
  Code2,
  FileText,
  Folder,
  FolderOpen,
  Link2,
  Search,
} from "lucide-react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { EASE_OUT } from "@/lib/ease";
import { useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { BacklinksDemo } from "@/components/BacklinksDemo";
import { GraphDemo } from "@/components/GraphDemo";
import { LibraryDemo } from "@/components/LibraryDemo";
import { MachineryDemo } from "@/components/MachineryDemo";
import { ProjectsDemo } from "@/components/ProjectsDemo";
import { SplitDemo } from "@/components/SplitDemo";
import { TasksDemo } from "@/components/TasksDemo";
import { ThemesDemo } from "@/components/ThemesDemo";
import { Kicker } from "./ui/kicker";

const FILES = [
  { name: "Projects", kind: "folder", depth: 0 },
  { name: "Ornata", kind: "folder-open", depth: 1 },
  { name: "Product principles.md", kind: "file", depth: 2 },
  { name: "Release notes.md", kind: "file", depth: 2 },
  { name: "Journal", kind: "folder", depth: 0 },
] as const;

const SEARCH_RESULTS = [
  ["Product principles", "projects/ornata/principles.md"],
  ["Q3 Roadmap", "projects/ornata/roadmap.md"],
  ["Release notes", "projects/ornata/releases.md"],
] as const;

function useCycle(enabled: boolean, length: number, delay: number) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(
      () => setActive((current) => (current + 1) % length),
      delay,
    );
    return () => window.clearInterval(timer);
  }, [delay, enabled, length]);

  return active;
}

function Story({
  index,
  eyebrow,
  title,
  body,
  reverse = false,
  children,
}: {
  index: string;
  eyebrow: string;
  title: string;
  body: string;
  reverse?: boolean;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();

  return (
    <article className="border-b border-border">
      <div
        className={cn(
          "grid items-center gap-12 px-5 py-16 sm:px-10 sm:py-20 lg:px-16 xl:grid-cols-2 xl:gap-20",
          reverse && "xl:[&>*:first-child]:order-2",
        )}
      >
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 18, filter: "blur(5px)" }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, ease: EASE_OUT }}
          className="max-w-xl"
        >
          <Kicker index={index}>{eyebrow}</Kicker>
          <h2 className="mt-5 text-balance font-serif text-[42px] leading-[0.98] tracking-[-0.035em] text-foreground sm:text-[56px]">
            {title}
          </h2>
          <p className="mt-6 max-w-md text-pretty text-[15px] leading-7 text-muted-foreground">
            {body}
          </p>
        </motion.div>
        <div>{children}</div>
      </div>
    </article>
  );
}

function DemoShell({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="surface overflow-hidden rounded-[18px] bg-paper p-2">
      <div className="flex h-9 items-center justify-between px-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-faint">
          {label}
        </span>
        <span className="flex gap-1.5">
          <span className="size-1.5 rounded-full bg-foreground/18" />
          <span className="size-1.5 rounded-full bg-foreground/10" />
        </span>
      </div>
      <div className="overflow-hidden rounded-[10px] bg-card">{children}</div>
    </div>
  );
}

function FilesDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20% 0px" });
  const reduce = useReducedMotion();
  const active = useCycle(Boolean(inView && !reduce), 2, 1900) + 2;

  return (
    <div ref={ref}>
      <DemoShell label="On your disk">
        <div className="grid min-h-[320px] sm:grid-cols-[190px_minmax(0,1fr)]">
          <div className="border-b border-border p-3 sm:border-b-0 sm:border-r">
            <div className="mb-2 flex items-center gap-2 px-2 py-1 text-[11px] font-medium text-muted-foreground">
              <FolderOpen size={13} />
              My Notes
            </div>
            {FILES.map((file, index) => {
              const Icon =
                file.kind === "folder-open"
                  ? FolderOpen
                  : file.kind === "folder"
                    ? Folder
                    : FileText;
              const selected = index === active;
              return (
                <div
                  key={file.name}
                  className="relative flex h-8 items-center gap-2 rounded-md px-2 text-[11.5px]"
                  style={{ paddingLeft: 8 + file.depth * 12 }}
                >
                  {selected ? (
                    <motion.span
                      layoutId="file-selection"
                      className="absolute inset-0 rounded-md bg-foreground"
                      transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                    />
                  ) : null}
                  <Icon
                    size={13}
                    className={cn(
                      "relative z-10 shrink-0",
                      selected ? "text-primary-foreground" : "text-faint",
                    )}
                  />
                  <span
                    className={cn(
                      "relative z-10 truncate",
                      selected ? "text-primary-foreground" : "text-muted-foreground",
                    )}
                  >
                    {file.name}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="min-h-[220px] bg-paper px-6 py-7">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
              {active === 2 ? "Product principles.md" : "Release notes.md"}
            </p>
            <h3 className="mt-5 font-serif text-[26px] leading-tight text-foreground">
              {active === 2 ? "Software should get out of the way." : "A quieter release."}
            </h3>
            <div className="mt-5 space-y-2">
              <span className="block h-1.5 w-full rounded-full bg-foreground/12" />
              <span className="block h-1.5 w-[88%] rounded-full bg-foreground/10" />
              <span className="block h-1.5 w-[68%] rounded-full bg-foreground/8" />
            </div>
            <div className="mt-8 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.1em] text-faint">
              <Check size={11} />
              Finder-visible · no import
            </div>
          </div>
        </div>
      </DemoShell>
    </div>
  );
}

function WritingDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20% 0px" });
  const reduce = useReducedMotion();
  const active = useCycle(Boolean(inView && !reduce), 3, 1600);

  return (
    <div ref={ref}>
      <DemoShell label="Inside a long note">
        <div className="relative min-h-[340px] bg-paper px-6 py-8 sm:px-10">
          <div className="absolute right-4 top-10 hidden w-24 sm:block">
            {["Principle", "Plain files", "Links"].map((label, index) => (
              <div key={label} className="relative mb-3 flex items-center gap-2">
                <motion.span
                  animate={{ width: index === active ? 28 : 9 }}
                  transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                  className={cn(
                    "block h-px",
                    index === active ? "bg-foreground" : "bg-foreground/20",
                  )}
                />
                <span
                  className={cn(
                    "font-mono text-[8px] uppercase tracking-[0.08em]",
                    index === active ? "text-foreground" : "text-faint",
                  )}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>

          <div className="max-w-[360px]">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
              Product principles
            </p>
            <h3 className="mt-3 font-serif text-[30px] leading-tight text-foreground">
              Write first. Organize only when it helps.
            </h3>
            <p className="mt-4 text-[12.5px] leading-6 text-muted-foreground">
              Every note stays readable outside Ornata. Connect ideas with{" "}
              <span className="inline-flex items-center gap-1 border-b border-foreground pb-px text-foreground">
                <Link2 size={11} />
                standard Markdown links
              </span>
              , not private metadata.
            </p>

            <div className="mt-6 overflow-hidden rounded-lg bg-foreground px-4 py-3 font-mono text-[10.5px] leading-5 text-primary-foreground">
              <p>
                <span className="text-primary-foreground/45">const</span>{" "}
                note = <span className="text-primary-foreground/70">&quot;yours.md&quot;</span>;
              </p>
              <p>
                <span className="text-primary-foreground/45">await</span>{" "}
                write(note);
              </p>
            </div>
            <div className="mt-3 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.1em] text-faint">
              <Code2 size={11} />
              Language-aware code
            </div>
          </div>
        </div>
      </DemoShell>
    </div>
  );
}

function CommandDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20% 0px" });
  const reduce = useReducedMotion();
  const active = useCycle(Boolean(inView && !reduce), SEARCH_RESULTS.length, 1300);

  return (
    <div ref={ref}>
      <DemoShell label="Command palette">
        <div className="paper-grid grid min-h-[330px] place-items-center p-5">
          <div className="surface w-full max-w-[390px] overflow-hidden rounded-xl bg-paper p-2">
            <div className="flex h-11 items-center gap-3 border-b border-border px-3">
              <Search size={15} className="text-faint" />
              <span className="text-[13px] text-foreground">ornata</span>
              <motion.span
                animate={reduce ? undefined : { opacity: [1, 1, 0, 0] }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="h-4 w-px bg-foreground"
              />
              <kbd className="ml-auto font-mono text-[9px] text-faint">⌘K</kbd>
            </div>
            <div className="pt-2">
              {SEARCH_RESULTS.map(([title, path], index) => (
                <div
                  key={title}
                  className="relative flex min-h-12 items-center gap-3 rounded-lg px-3"
                >
                  {index === active ? (
                    <motion.span
                      layoutId="search-selection"
                      className="absolute inset-0 rounded-lg bg-foreground"
                      transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                    />
                  ) : null}
                  <FileText
                    size={14}
                    className={cn(
                      "relative z-10",
                      index === active ? "text-primary-foreground" : "text-faint",
                    )}
                  />
                  <span className="relative z-10 min-w-0">
                    <span
                      className={cn(
                        "block truncate text-[12px]",
                        index === active
                          ? "text-primary-foreground"
                          : "text-foreground",
                      )}
                    >
                      {title}
                    </span>
                    <span
                      className={cn(
                        "block truncate font-mono text-[8.5px]",
                        index === active
                          ? "text-primary-foreground/55"
                          : "text-faint",
                      )}
                    >
                      {path}
                    </span>
                  </span>
                  <ChevronRight
                    size={13}
                    className={cn(
                      "relative z-10 ml-auto",
                      index === active
                        ? "text-primary-foreground/70"
                        : "text-faint",
                    )}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </DemoShell>
    </div>
  );
}

/** Editorial chapter opener: groups the stories into a short narrative. */
function Chapter({ number, word, line }: { number: string; word: string; line: string }) {
  const reduce = useReducedMotion();
  const locale = useLocale();
  return (
    <div className="border-b border-border bg-paper">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="flex flex-wrap items-baseline gap-x-8 gap-y-2 px-5 py-9 sm:px-10 lg:px-16"
      >
        <Kicker className="w-full sm:w-auto sm:min-w-[92px]">
          {locale === "zh" ? `第 ${number} 章` : `Chapter ${number}`}
        </Kicker>
        <span className="font-serif text-[44px] leading-none tracking-[-0.04em] text-foreground sm:text-[56px]">
          {word}
        </span>
        <span className="text-[15px] text-muted-foreground">{line}</span>
      </motion.div>
    </div>
  );
}

/** Two lighter features side by side, to break the alternating rhythm. */
function Pair({
  items,
}: {
  items: { index: string; eyebrow: string; title: string; body: string; demo: ReactNode }[];
}) {
  const reduce = useReducedMotion();
  return (
    <article className="border-b border-border">
      <div className="grid gap-16 px-5 py-16 sm:px-10 sm:py-20 lg:px-16 xl:grid-cols-2 xl:gap-14">
        {items.map((item, i) => (
          <motion.div
            key={item.index}
            initial={reduce ? false : { opacity: 0, y: 18, filter: "blur(5px)" }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55, ease: EASE_OUT, delay: i * 0.08 }}
            className="flex flex-col"
          >
            <Kicker index={item.index}>{item.eyebrow}</Kicker>
            <h2 className="mt-4 text-balance font-serif text-[34px] leading-[1.02] tracking-[-0.03em] text-foreground sm:text-[40px]">
              {item.title}
            </h2>
            <p className="mt-4 max-w-md text-pretty text-[15px] leading-7 text-muted-foreground">
              {item.body}
            </p>
            <div className="mt-8">{item.demo}</div>
          </motion.div>
        ))}
      </div>
    </article>
  );
}

export function FeaturesBento() {
  const reduce = useReducedMotion();
  const f = useCopy().features;
  return (
    <section className="section-contain px-3 sm:px-6">
      <div className="mx-auto w-full max-w-[1440px] border-x border-border bg-background">
        {/* The position: one claim, and a demo that proves it. */}
        <div
          id="principles"
          className="scroll-mt-20 border-b border-border"
        >
          <div className="grid items-center gap-12 px-5 py-20 sm:px-10 lg:px-16 lg:py-24 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:gap-20">
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 18, filter: "blur(5px)" }}
              whileInView={reduce ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.55, ease: EASE_OUT }}
            >
              <Kicker>{f.position}</Kicker>
              <h2 className="mt-5 text-balance font-serif text-[44px] leading-[0.98] tracking-[-0.04em] text-foreground sm:text-[60px]">
                {f.positionTitle}
              </h2>
              <p className="mt-7 max-w-md text-pretty text-[16px] leading-7 text-muted-foreground">
                {f.positionBody}
              </p>
            </motion.div>
            <MachineryDemo />
          </div>
        </div>

        <div id="features" className="scroll-mt-16">
          <Chapter number="01" word={f.chapters.write[0]} line={f.chapters.write[1]} />
          <Story
            index="01 / 10"
            eyebrow={f.files.eyebrow}
            title={f.files.title}
            body={f.files.body}
          >
            <FilesDemo />
          </Story>
          <Story
            index="02 / 10"
            eyebrow={f.editor.eyebrow}
            title={f.editor.title}
            body={f.editor.body}
            reverse
          >
            <WritingDemo />
          </Story>
          <Story
            index="03 / 10"
            eyebrow={f.themes.eyebrow}
            title={f.themes.title}
            body={f.themes.body}
          >
            <ThemesDemo />
          </Story>

          <Chapter number="02" word={f.chapters.connect[0]} line={f.chapters.connect[1]} />
          <Story
            index="04 / 10"
            eyebrow={f.backlinks.eyebrow}
            title={f.backlinks.title}
            body={f.backlinks.body}
            reverse
          >
            <BacklinksDemo />
          </Story>
          <Story
            index="05 / 10"
            eyebrow={f.graph.eyebrow}
            title={f.graph.title}
            body={f.graph.body}
          >
            <GraphDemo />
          </Story>

          <Story
            index="06 / 10"
            eyebrow={f.split.eyebrow}
            title={f.split.title}
            body={f.split.body}
            reverse
          >
            <SplitDemo />
          </Story>

          <Chapter number="03" word={f.chapters.find[0]} line={f.chapters.find[1]} />
          <Story
            index="07 / 10"
            eyebrow={f.library.eyebrow}
            title={f.library.title}
            body={f.library.body}
          >
            <LibraryDemo />
          </Story>
          <Pair
            items={[
              {
                index: "08 / 10",
                eyebrow: f.palette.eyebrow,
                title: f.palette.title,
                body: f.palette.body,
                demo: <CommandDemo />,
              },
              {
                index: "09 / 10",
                eyebrow: f.tasks.eyebrow,
                title: f.tasks.title,
                body: f.tasks.body,
                demo: <TasksDemo />,
              },
            ]}
          />

          <Chapter number="04" word={f.chapters.plan[0]} line={f.chapters.plan[1]} />
          <Story
            index="10 / 10"
            eyebrow={f.projects.eyebrow}
            title={f.projects.title}
            body={f.projects.body}
            reverse
          >
            <ProjectsDemo />
          </Story>
        </div>
      </div>
    </section>
  );
}
