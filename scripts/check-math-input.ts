import assert from "node:assert/strict";
import StarterKit from "@tiptap/starter-kit";
import { MarkdownManager } from "@tiptap/markdown";
import {
  MathBlock,
  MathInline,
  BLOCK_MATH_INPUT_RE,
  INLINE_MATH_INPUT_RE,
} from "../src/components/editor/Mathematics.ts";

assert.equal(
  "Euler: $e^{i\\pi}+1=0$".match(INLINE_MATH_INPUT_RE)?.[1],
  "e^{i\\pi}+1=0",
);
assert.equal("Escaped: \\$5".match(INLINE_MATH_INPUT_RE), null);
assert.equal("$$x^2$$".match(INLINE_MATH_INPUT_RE), null);
assert.equal(
  "$$\\int_0^1 x^2 dx$$".match(BLOCK_MATH_INPUT_RE)?.[1],
  "\\int_0^1 x^2 dx",
);
assert.equal("$x^2$".match(BLOCK_MATH_INPUT_RE), null);

const markdown = "Inline $E=mc^2$.\n\n$$\n\\int_0^1 x^2 dx\n$$";
const manager = new MarkdownManager({
  extensions: [StarterKit, MathBlock, MathInline],
});
assert.equal(manager.serialize(manager.parse(markdown)), markdown);

console.log("Math input syntax checks passed");
