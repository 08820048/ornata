import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

mock.module("@tauri-apps/api/core", () => ({ convertFileSrc: (p: string) => p, invoke: async () => null }));
mock.module("@tauri-apps/api/event", () => ({ listen: async () => () => undefined, emit: async () => undefined }));
mock.module("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: "main" }) }));
mock.module("@tauri-apps/plugin-opener", () => ({ openUrl: async () => undefined, openPath: async () => undefined }));

let Editor: typeof import("@tiptap/core").Editor;
let createExtensions: typeof import("../src/components/editor/extensions").createExtensions;
let extras: typeof import("../src/components/editor/imageExtras");

beforeAll(async () => {
  GlobalRegistrator.register();
  ({ Editor } = await import("@tiptap/core"));
  ({ createExtensions } = await import("../src/components/editor/extensions"));
  extras = await import("../src/components/editor/imageExtras");
});
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

const open = (markdown: string) =>
  new Editor({
    element: document.createElement("div"),
    extensions: createExtensions("/vault"),
    content: markdown,
    contentType: "markdown",
  } as never);
const roundTrip = (markdown: string) => {
  const editor = open(markdown);
  const out = (editor as unknown as { getMarkdown(): string }).getMarkdown().trim();
  editor.destroy();
  return out;
};

describe("images", () => {
  test("a plain image is written as before", () => {
    expect(roundTrip("![alt](.ornata/assets/a.png)")).toBe("![alt](.ornata/assets/a.png)");
  });

  test("a caption survives as the Markdown title", () => {
    expect(roundTrip('![alt](a.png "A caption")')).toBe('![alt](a.png "A caption")');
    expect(extras.imageMarkdown({ src: "a.png", title: 'say "hi"' })).toBe('![](a.png "say \\"hi\\"")');
  });

  test("a resized image is written as an img tag and read back", () => {
    const html = '<img src="a.png" alt="x" width="300">';
    expect(roundTrip(html)).toBe(html);
    expect(extras.imageMarkdown({ src: "a.png", alt: 'a "q"', title: "cap", width: 240.4 })).toBe(
      '<img src="a.png" alt="a &quot;q&quot;" title="cap" width="240">',
    );
  });

  test("a path with spaces keeps working", () => {
    expect(roundTrip("![alt](<my shots/a b.png>)")).toBe("![alt](<my shots/a b.png>)");
  });

  test("the source bar's target splits into path and caption", () => {
    expect(extras.parseImageTarget('a.png "My caption"')).toEqual({ src: "a.png", title: "My caption" });
    expect(extras.parseImageTarget("a.png")).toEqual({ src: "a.png", title: "" });
    expect(extras.parseImageTarget('<a b.png> "x \\"y\\""')).toEqual({ src: "a b.png", title: 'x "y"' });
  });

  test("a dragged width is whole pixels within the text column", () => {
    expect(extras.clampWidth(312.6, 800)).toBe(313);
    expect(extras.clampWidth(10, 800)).toBe(80);
    expect(extras.clampWidth(2000, 800)).toBe(800);
  });

  test("only images with a title get a caption", () => {
    const editor = open('![a](a.png "Cap")\n\n![b](b.png)');
    expect(extras.captionDecorations(editor.state).find()).toHaveLength(1);
    editor.destroy();
  });
});
