/**
 * Stand-in for `@tiptap/extension-collaboration` and `@tiptap/y-tiptap`.
 *
 * Tiptap's drag-handle extension imports them to cope with multi-user
 * (yjs) editing, which Ornata doesn't have — and that drags the whole yjs
 * runtime (~160 kB) into the bundle. With no sync plugin installed the real
 * code returns the same "not collaborative" answers below, so aliasing them
 * (vite.config.ts) changes nothing but the bundle size. Remove the alias if
 * collaboration is ever added.
 */
import { PluginKey } from "@tiptap/pm/state";

export const isChangeOrigin = () => false;
export const ySyncPluginKey = new PluginKey("y-sync");
export const absolutePositionToRelativePosition = () => null;
export const relativePositionToAbsolutePosition = () => null;
