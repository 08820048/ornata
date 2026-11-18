# Writing and formatting

Ornata writes Markdown as you type and shows it formatted. The file on disk is plain Markdown that any other app can read.

## As you type

| Type this | to get |
| --- | --- |
| `#` `##` `###` and a space | a heading |
| `-` or `1.` and a space | a list |
| `- [ ]` and a space | a task |
| `>` and a space | a quote |
| three backticks (then Enter) | a code block |
| `---` (then Enter) | a divider |
| `**bold**` `*italic*` | **bold**, *italic* |

Or type `/` on an empty line and pick from the menu. To see the raw Markdown, use the source button in the note's header.

## Tasks

- [ ] A task to do
- [/] A task in progress: type `[/]` and a space at the start of a line
- [x] A finished task
- [-] A canceled task: type `[-]` and a space

Tasks from every note are collected in **⌘K** → "Open tasks", and on the board of a [project](note:Getting started/Projects and tasks.md).

## Callouts

> [!note]
> A quote that starts with `[!note]`, `[!tip]`, `[!important]`, `[!warning]` or `[!caution]` becomes a callout. The same syntax works on GitHub and in Obsidian.

## Tables

Right-click a cell to add or delete rows and columns, or to align a column. Point at a table and a "+" bar appears along its bottom and right edge.

| Fruit | Colour | Price |
| :--- | :---: | ---: |
| Apple | red | 1.20 |
| Lemon | yellow | 0.80 |

## Footnotes

Type `/footnote` to add one.[^1] Point at the number to read it; ⌘click jumps between the number and the note.

## Code and math

```js
function greet(name) {
  return `Hello, ${name}`;
}
```

Inline math goes between dollar signs, like $e^{i\pi} + 1 = 0$, and a block between two:

$$
\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}
$$

## Images

Paste or drag an image in; it's saved in the vault's `.ornata/assets` folder. Drag the grip on its right edge to resize it, and double-click it to see it larger.

Next: [Links, backlinks and the graph](note:Getting started/Links, backlinks and the graph.md)

[^1]: Like this one.
