import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* Small typographic pieces for the docs: quiet, serif headings, mono keys. */

export function H3({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-10 text-[18px] font-medium leading-7 tracking-[-0.01em] text-foreground first:mt-0">
      {children}
    </h3>
  );
}

export function P({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("mt-3 text-pretty text-[15px] leading-7 text-muted-foreground", className)}>
      {children}
    </p>
  );
}

export function Ul({ children }: { children: ReactNode }) {
  return <ul className="mt-3 space-y-2">{children}</ul>;
}

export function Li({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-pretty text-[15px] leading-7 text-muted-foreground">
      <span aria-hidden="true" className="mt-[13px] size-1 shrink-0 rounded-full bg-faint" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-block rounded border border-border bg-card px-1.5 py-px font-mono text-[12px] leading-5 text-foreground">
      {children}
    </kbd>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-hover px-1.5 py-px font-mono text-[13px] text-foreground">{children}</code>
  );
}

export function Pre({ children }: { children: string }) {
  return (
    <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-card px-4 py-3.5 font-mono text-[12.5px] leading-6 text-foreground">
      {children}
    </pre>
  );
}

/** A plain boxed aside — neutral, no colored edge. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="mt-5 rounded-xl border border-border bg-card px-4 py-3 text-pretty text-[14px] leading-6 text-muted-foreground">
      {children}
    </p>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[420px] border-collapse text-left text-[14px]">
        <thead>
          <tr className="border-b border-border bg-card">
            {head.map((cell) => (
              <th key={cell} className="px-4 py-2.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-faint">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-b-0">
              {row.map((cell, j) => (
                <td key={j} className={cn("px-4 py-2.5 align-top leading-6", j === 0 ? "whitespace-nowrap text-foreground" : "text-muted-foreground")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface DocSection {
  id: string;
  title: string;
  lead: string;
  body: ReactNode;
}
