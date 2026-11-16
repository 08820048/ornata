import { IconDots, IconPlus } from "@tabler/icons-react";
import { motion, useReducedMotion, useSpring, useTransform, type MotionValue } from "motion/react";
import { useEffect, useId, useMemo, useState } from "react";
import type { MenuPosition } from "@/components/ui/ContextMenu";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  PAPER_SIZE,
  PAPER_SPRINGS,
  backPlatePath,
  glassPath,
  paperPose,
  sketchLines,
} from "@/lib/library";
import type { TreeNode } from "@/lib/types";
import { useT } from "@/stores/locale";
import { ThumbPage } from "./NotePreview";

/**
 * A folder with its newest notes tucked inside as paper. The geometry and the
 * motion follow quiet.md's home folders: hovering lifts the whole folder,
 * raises the papers one after another (each on its own, softer spring) and
 * fans the back ones out, while the frosted front leans back and widens.
 */
export function FolderCard({
  node,
  cover,
  coverText,
  width,
  height,
  seen,
  nameSlot,
  cardProps,
  onNewNote,
  onMenu,
}: {
  node: TreeNode;
  cover: TreeNode[];
  coverText: string | null;
  width: number;
  height: number;
  seen: boolean;
  /** Replaces the name (the inline rename field). */
  nameSlot?: React.ReactNode;
  cardProps: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> };
  onNewNote: () => void;
  onMenu: (position: MenuPosition) => void;
}) {
  const t = useT();
  const gradient = useId().replace(/[^a-zA-Z0-9]/g, "");
  const reduce = useReducedMotion();
  const [hot, setHot] = useState(false);
  const open = useSpring(0, { stiffness: 260, damping: 21 });
  const rise0 = useSpring(0, PAPER_SPRINGS[0]);
  const rise1 = useSpring(0, PAPER_SPRINGS[1]);
  const rise2 = useSpring(0, PAPER_SPRINGS[2]);
  const rises = [rise0, rise1, rise2];

  useEffect(() => {
    const to = hot ? 1 : 0;
    for (const value of [open, rise0, rise1, rise2]) {
      if (reduce) value.jump(to);
      else value.set(to);
    }
  }, [hot, reduce, open, rise0, rise1, rise2]);

  const lift = useTransform(open, (o) => -5 * o);
  const sheet = useTransform(open, (o) => glassPath(width, height, o).sheet);
  const edge = useTransform(open, (o) => glassPath(width, height, o).edge);
  const reveal = useTransform(open, (o) => Math.min(1, Math.max(0, o)));
  const iconScale = useTransform(reveal, (r) => 0.7 + 0.3 * r);
  const back = useMemo(() => backPlatePath(width, height), [width, height]);
  const closed = useMemo(() => glassPath(width, height, 0), [width, height]);
  const count = node.children?.length ?? 0;
  const paper = { w: PAPER_SIZE.w * width, h: PAPER_SIZE.h * height };

  return (
    <div
      {...cardProps}
      title={node.rel}
      style={{ height }}
      className="library-folder relative w-full min-w-0 cursor-pointer outline-none"
      onPointerEnter={() => setHot(true)}
      onPointerLeave={() => setHot(false)}
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) setHot(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHot(false);
      }}
    >
      <motion.div className="absolute inset-0" style={{ y: lift }}>
        <svg aria-hidden width={width} height={height} className="absolute left-0 top-0 overflow-visible">
          <defs>
            <linearGradient id={`${gradient}-back`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="library-folder-back-top" />
              <stop offset="1" className="library-folder-back-bottom" />
            </linearGradient>
          </defs>
          <path d={back} fill={`url(#${gradient}-back)`} />
        </svg>

        {cover
          .map((note, index) => ({ note, index }))
          .reverse()
          .map(({ note, index }) => (
            <Paper key={note.rel} index={index} rise={rises[index]} width={width} height={height} size={paper}>
              {index === 0 ? (
                <ThumbPage title={note.name} text={coverText} pad={12} ready={seen} />
              ) : (
                <Sketch rel={note.rel} width={paper.w} height={paper.h} />
              )}
            </Paper>
          ))}

        <div className="library-folder-shadow" style={{ top: 0.54 * height + 10 }} />
        <svg aria-hidden width={width} height={height} className="absolute left-0 top-0 overflow-visible">
          <defs>
            <linearGradient id={`${gradient}-glass`} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
              <stop offset="0" className="library-glass-top" />
              <stop offset="0.42" className="library-glass-solid" />
            </linearGradient>
            <linearGradient id={`${gradient}-tint`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="library-glass-tint-top" />
              <stop offset="1" className="library-glass-tint-bottom" />
            </linearGradient>
          </defs>
          <motion.path d={sheet} initial={{ d: closed.sheet }} fill={`url(#${gradient}-glass)`} />
          <motion.path
            d={sheet}
            initial={{ d: closed.sheet }}
            fill={`url(#${gradient}-tint)`}
            className="library-glass-hairline"
          />
          <motion.path d={edge} initial={{ d: closed.edge }} fill="none" className="library-glass-lit" />
        </svg>

        <div className="absolute bottom-[14px] left-4 right-[14px] flex items-end gap-2">
          <div className="flex min-w-0 flex-1 flex-col">
            {nameSlot ?? (
              <div className="truncate text-[15px] font-semibold leading-[22px] text-ink">{node.name}</div>
            )}
            <div className="text-[12px] leading-[18px] text-faint">
              {count === 1 ? t("library.item") : t("library.items", { count })}
            </div>
          </div>
          <motion.div className="flex shrink-0 gap-2" style={{ opacity: reveal }}>
            <FlapButton label={t("library.newNoteHere")} onClick={onNewNote}>
              <motion.span className="grid" style={{ scale: iconScale }}>
                <IconPlus size={15} stroke={1.75} />
              </motion.span>
            </FlapButton>
            <FlapButton
              label={t("library.more")}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                onMenu({ x: rect.left, y: rect.bottom + 4 });
              }}
            >
              <IconDots size={15} stroke={1.75} />
            </FlapButton>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

function Paper({
  index,
  rise,
  width,
  height,
  size,
  children,
}: {
  index: number;
  rise: MotionValue<number>;
  width: number;
  height: number;
  size: { w: number; h: number };
  children: React.ReactNode;
}) {
  const x = useTransform(rise, (r) => paperPose(index, r, width, height).x);
  const y = useTransform(rise, (r) => paperPose(index, r, width, height).y);
  const rotate = useTransform(rise, (r) => paperPose(index, r, width, height).rotate);
  return (
    <motion.div
      className="library-paper absolute top-0 overflow-hidden"
      style={{ left: (width - size.w) / 2, width: size.w, height: size.h, x, y, rotate }}
    >
      {children}
    </motion.div>
  );
}

/** A paper behind the front one: a heading bar and rows of "text". */
function Sketch({ rel, width, height }: { rel: string; width: number; height: number }) {
  const lines = useMemo(() => sketchLines(rel, width, height), [rel, width, height]);
  return (
    <svg aria-hidden width={width} height={height} className="block">
      <rect x={lines.pad} y={14} width={lines.heading} height={4} rx={2} className="library-sketch-heading" />
      {lines.rows.map((row) => (
        <rect
          key={row.y}
          x={lines.pad}
          y={row.y - 1.5}
          width={row.width}
          height={3}
          rx={1.5}
          className="library-sketch-line"
        />
      ))}
    </svg>
  );
}

function FlapButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation();
          onClick(event);
        }}
        className="library-pill grid size-7 place-items-center rounded-full text-muted transition-colors duration-100 hover:text-ink"
      >
        {children}
      </button>
    </Tooltip>
  );
}
