export type Release = {
  version: string;
  date: string;
  dateTime: string;
  summary: string;
  changes: string[];
  /** Chinese text; versions without it show the English entry. */
  zh?: { summary: string; changes: string[] };
};

export const RELEASES: Release[] = [
  {
    version: "0.8.1",
    zh: {
      summary: "修复了打开含多个代码块的笔记时会崩溃的问题。",
      changes: [
        "含有多个代码块的笔记，可能在打开的瞬间让 Ornata 崩溃，并且因为这篇笔记会被恢复，每次启动都会再崩一次。现在它能正常打开。如果你卡在 0.8.0，请从下载页更新。",
      ],
    },
    date: "October 18, 2026",
    dateTime: "2026-10-18",
    summary: "Fixes a crash when opening notes with several code blocks.",
    changes: [
      "A note with several code blocks could crash Ornata as it opened, and again on every launch because the note was restored. It now opens normally. If you are stuck on 0.8.0, update from the download page.",
    ],
  },
  {
    version: "0.8.0",
    zh: {
      summary: "分屏，以及任何 AI 智能体都能通过 MCP 处理你的笔记 —— 还有更安静的编辑器。",
      changes: [
        "并排打开笔记，最多四个窗格，每个都有自己的标题栏和前进后退记录。⌘ 点击链接、在命令面板按 ⌘↵，或选择「在侧边打开」。拖动分隔条调整大小；重启后布局会恢复。",
        "带上你已经在用的智能体。Ornata 通过你在 MCP 设置里开关的本地端口提供 MCP;Ornata 关闭时也可走 stdio。Claude Code、Codex、Gemini CLI、Cursor、VS Code 和 Claude Desktop 一行命令即可连接。",
        "同样的工具也是命令行：ornata search、tasks、journal add、capture、create、append，文本可以通过管道传入。",
        "每个笔记库允许智能体做什么由你设定 —— 关闭、只读（默认）、读写或完全访问。每个请求都带访问令牌，拒绝来自网页的请求，编辑会把旧版本留在笔记的历史里，智能体也只能看到真正位于笔记库内的笔记。",
        "用边栏的箭头折叠标题下的内容，或代码块里的函数。代码块自己的箭头折叠到只剩第一行，语言标签会打开菜单：选中、复制、折叠或更改高亮。Lua、PHP、R、Dart、Ruby、TOML 和 Dockerfile 也有了高亮。",
        "输入 + 或 / 打开建议菜单：空行上会出现 +,/code 按语言列出代码块。行首输入 * 加空格得到待办，@ 插入今天、明天或昨天的日记链接，⌥↑ 或 ⌥↓ 移动块或列表项。",
        "搜索能从缩写找到标题，所以 prjroad 能匹配 project roadmap。后退/前进、专注模式，以及显示当前视图常用快捷键的状态栏，让键盘操作更完整。",
        "单一的青绿色强调色用于链接、已完成待办、光标、选区和引用条，其余保持黑白灰。笔记使用 Space Grotesk 字体。",
        "笔记打开期间，如果被其他程序在磁盘上改动，现在会自动重新加载 —— 除非你有尚未保存的输入。",
      ],
    },
    date: "October 18, 2026",
    dateTime: "2026-10-18",
    summary:
      "Split view, and any AI agent can work on your notes through MCP — plus a calmer editor.",
    changes: [
      "Open notes side by side, up to four panes, each with its own header and its own back and forward trail. ⌘-click a link, press ⌘↵ in the command palette, or choose Open to the side. Drag a divider to resize; the layout comes back after a restart.",
      "Bring the agent you already use. Ornata speaks MCP over a local port you switch on and off from MCP Settings, or over stdio when Ornata is closed. Claude Code, Codex, Gemini CLI, Cursor, VS Code, and Claude Desktop connect with one line.",
      "The same tools are a command line: ornata search, tasks, journal add, capture, create, append. Text can be piped in.",
      "You set what an agent may do per vault — off, read only (the default), read & write, or full access. Every request carries an access token, requests from web pages are refused, edits keep the previous version in the note's history, and agents only see notes that really live in the vault.",
      "Fold a heading's section, or a function in a code block, with the arrow in the margin. A block's own arrow collapses it to its first line, and the language label opens a menu to select, copy, collapse, or change the highlighting. Lua, PHP, R, Dart, Ruby, TOML, and Dockerfile are highlighted too.",
      "Type + or / for the suggestion menu: a + appears on an empty line, and /code lists code blocks by language. Type * and a space for a to-do, @ for today, tomorrow, or yesterday's daily note, and press ⌥↑ or ⌥↓ to move a block or list item.",
      "Search finds titles from shorthand, so prjroad matches project roadmap. Back and forward, focus mode, and a status bar with the keys that matter for the current view round out the keyboard.",
      "A single teal accent marks links, checked tasks, the caret, the selection, and the quote bar; everything else stays monochrome. Notes are set in Space Grotesk.",
      "A note that is open when something else changes it on disk now reloads, unless you have unsaved typing in it.",
    ],
  },
  {
    version: "0.7.0",
    zh: {
      summary: "AssistantPi 记得对话、能撤销自己的编辑，还能指向其他笔记。",
      changes: [
        "对话随笔记库保存。可以新开一个对话，或从面板里重新打开之前的。",
        "每条回复会列出 AssistantPi 编辑或新建的笔记，并支持一键撤销。如果之后你改过这篇笔记，撤销会停下并指向笔记的历史。",
        "输入 @ 附加任意笔记。关联笔记还能包含本笔记链出和链入的笔记 —— 只含路径和标题，最多 20 条，模型只读它需要的。",
        "附加了笔记且输入框为空时，「总结」「建议链接」「提取待办」一点即用。后两者只提出建议。",
        "审批卡片显示 shell 命令、编辑前后的差异、新笔记的正文，以及删除、重命名和移动的路径。",
        "read、grep、find、ls 都限制在笔记库内，包括顺着符号链接指向笔记库外的路径。",
        "编辑器的标签栏使用与侧边栏相同的面板色调。",
      ],
    },
    date: "September 28, 2026",
    dateTime: "2026-09-28",
    summary:
      "AssistantPi remembers the conversation, undoes its own edits, and can be pointed at other notes.",
    changes: [
      "Conversations stay with the vault. Start a new chat, or reopen an earlier one from the panel.",
      "Each reply lists the notes AssistantPi edited or created, with one-click undo. If you changed a note after that, undo stops and points you at the note's history.",
      "Type @ to attach any note. Linked notes can also include the notes this one links to and from — paths and titles only, up to 20, so the model reads what it needs.",
      "With a note attached and an empty composer, Summarize, Suggest links, and Extract tasks are one tap away. Suggest links and Extract tasks only propose changes.",
      "Approval cards show the shell command, a before/after diff for an edit, the body of a new note, and the path for delete, rename, and move.",
      "Read, grep, find, and ls stay inside the vault, including paths that follow a symlink out of it.",
      "The editor tab strip uses the same panel tone as the sidebar.",
    ],
  },
  {
    version: "0.6.0",
    zh: {
      summary: "关系图谱、笔记导出，以及更完善的查找和回顾方式。",
      changes: [
        "在单独的标签页里把笔记库作为关系图谱打开，或在页面底部查看当前笔记的邻域。图谱会为最大的几个文件夹着色，你可以拖动节点、搜索并查看链接方向。",
        "把笔记导出为 PDF、HTML 或富文本。PDF 含标题书签，可设置纸张大小和页边距，文件就绪后可「在 Finder 中显示」。",
        "保留每篇笔记的历史，把快照与当前文本对比，并可恢复。",
        "支持多个关键词搜索整个笔记库，以及在当前笔记里查找替换。",
        "新增标签、日记、模板和置顶笔记。",
        "随时随地把想法记进收件箱。标题链接使用 path.md#heading，重命名或移动笔记会改写指向它的链接。",
        "在一张清单里看到所有未完成的待办。笔记底部会列出提到它的笔记，包括未建立链接的提及。",
        "边栏可按修改时间排序。可以清理笔记库里未被引用的图片。",
        "移除了独立的待办和书签页面。下次启动时，已有清单会变成 Todos.md 和 Bookmarks.md，旧文件作为存档保留。",
      ],
    },
    date: "September 28, 2026",
    dateTime: "2026-09-28",
    summary:
      "A relationship graph, note export, and a fuller way to find and revisit what you wrote.",
    changes: [
      "Open the vault as a relationship graph in its own tab, or see the current note's neighborhood at the bottom of the page. The graph colors the largest folders, and you can drag nodes, search, and follow link direction.",
      "Export a note to PDF, HTML, or rich text. PDFs include heading bookmarks, paper size and margin settings, and a Show in Finder action when the file is ready.",
      "Keep a history of each note, compare a snapshot with the current text, and restore it.",
      "Search the vault with more than one term, and find and replace inside the open note.",
      "Added tags, daily notes, templates, and pinned notes.",
      "Capture a thought into Inbox from anywhere. Heading links use path.md#heading, and renaming or moving a note rewrites the links that point to it.",
      "See every open task in one list. The bottom of a note lists the notes that mention it, including unlinked mentions.",
      "Sort the sidebar by modified time. Unreferenced images in the vault can be cleaned up.",
      "Retired the standalone Todos and Bookmarks pages. On the next launch, existing lists become Todos.md and Bookmarks.md, and the old files are kept as archives.",
    ],
  },
  {
    version: "0.5.1",
    zh: {
      summary: "全新应用图标，以及可用滚轮滚动的标签栏。",
      changes: [
        "应用、Dock 和官网使用全新的应用图标。",
        "编辑器标签栏支持鼠标滚轮：竖向滚轮可左右平移已打开的标签，标签栏塞满时边缘的标签不再被遮住。",
        "切换标签时，当前标签会滚回可见位置，标签栏的滚动条也已隐藏。",
      ],
    },
    date: "September 21, 2026",
    dateTime: "2026-09-21",
    summary: "A new app icon, and a tab strip you can scroll with the wheel.",
    changes: [
      "A new app icon across the app, Dock, and website.",
      "Mouse-wheel scrolling for the editor tab strip: a vertical wheel pans the open tabs left and right, so a full strip no longer hides tabs at the edges.",
      "The active tab scrolls back into view when you switch tabs, and the strip's scrollbar is hidden.",
    ],
  },
  {
    version: "0.5.0",
    zh: {
      summary: "动画光标、独立的设置窗口，以及能自己托管的图片粘贴。",
      changes: [
        "新增 Zed 风格的动画光标：光标以阻尼弹簧在位置之间滑行，并带有细微的四角形变。可在「设置 → 编辑器」中开关。",
        "设置现在在独立的、可搜索的窗口里打开，左侧是分类栏 —— 通用、外观、编辑器、图片、仓库、快捷键和更新。",
        "新增自定义图片上传：粘贴的图片先落到你的笔记库里，再由你的上传工具（例如 PicGo）换成托管地址，失败时回退到本地副本。",
        "点击图片即可像 Typora 那样，在下方的源码栏里直接编辑它的 Markdown 替代文本和地址。",
        "为笔记正文新增衬线阅读字体。",
        "修复了 macOS webview 中的图片粘贴：现在读取剪贴板的 items，而不再只读 files。",
        "移除了会干扰选中文字的指针拖尾。",
      ],
    },
    date: "September 21, 2026",
    dateTime: "2026-09-21",
    summary: "An animated cursor, a standalone settings window, and image paste that hosts itself.",
    changes: [
      "Added a Zed-style animated cursor: the caret glides between positions with a damped spring and a subtle four-corner deformation. Toggle it in Settings → Editor.",
      "Settings now open in a standalone, searchable window with a category rail — General, Appearance, Editor, Image, Vault, Shortcuts, and Updates.",
      "Added custom image upload: a pasted image lands in your vault first, then your uploader (for example PicGo) swaps in the hosted URL, falling back to the local copy on failure.",
      "Click an image to edit its Markdown alt text and URL inline, Typora-style, with a source bar beneath it.",
      "Added a serif reading font for the note body.",
      "Fixed image paste in the macOS webview by reading the clipboard's items instead of only its files.",
      "Removed the pointer cursor trail that interfered with text selection.",
    ],
  },
  {
    version: "0.4.0",
    date: "August 29, 2026",
    dateTime: "2026-08-29",
    summary: "Cursor motion with spring physics and playful trails for short edits.",
    changes: [
      "Added a smooth editor cursor trail that follows the pointer with spring physics, honoring reduced-motion settings.",
      "Short insertions and deletions animate as they land, and the caret gains a tapered line look.",
    ],
  },
  {
    version: "0.3.0",
    date: "August 29, 2026",
    dateTime: "2026-08-29",
    summary: "Code blocks move to Shiki, with dual light and dark highlighting.",
    changes: [
      "Migrated fenced code blocks to Shiki with dual light/dark themes and syntax highlighting for 20 programming languages.",
      "Refined code-block and Mermaid surfaces so they blend more naturally with the editor in both color modes.",
      "Kept AssistantPi status visible above the composer, added compact Thinking Orbs for ready, connecting, and working states, and removed decorative gray icon circles.",
      "Enlarged the settings dialog for more comfortable configuration.",
    ],
  },
  {
    version: "0.2.0",
    date: "August 28, 2026",
    dateTime: "2026-08-28",
    summary: "Math, diagrams, and an assistant that can search the web and run commands.",
    changes: [
      "Added LaTeX math rendering: inline $…$ and block $$…$$ formulas via KaTeX, with click-to-edit LaTeX source.",
      "Added Mermaid diagram rendering in fenced code blocks, themed for light and dark.",
      "AssistantPi now ships read, grep, find, and ls tools over your vault, plus a host shell (permission-gated), web search, and web fetch.",
      "Added thinking-orb activity animations that mirror what AssistantPi is doing, and a dismissible current-note attachment.",
      "A file watcher now refreshes the sidebar in real time when notes change outside the app.",
      "Closed a gap where ask-to-edit mode could run shell commands without approval, and capped pasted images at 20 MB.",
      "Resolved Rust dependency security advisories, including the Tauri IPC origin-confusion fix (2.11.5).",
    ],
  },
  {
    version: "0.1.12",
    date: "August 1, 2026",
    dateTime: "2026-08-01",
    summary: "AssistantPi now brings its own runtime and connects to the models you choose.",
    changes: [
      "Rebuilt AssistantPi around a bundled Pi sidecar, removing the separate command-line installation requirement.",
      "Loaded providers and models dynamically from Pi, including OpenAI, Anthropic, DeepSeek, Kimi, Z.AI, GitHub Copilot, and local or custom endpoints.",
      "Added API key, OAuth, IAM, service-account, environment, and local authentication flows where supported by each provider.",
      "Added multiple named model connections with secure credential storage and explicit approval before AssistantPi edits your workspace.",
      "Added close-left and close-right tab actions, and fixed hyperlink formatting so text typed after a link remains plain.",
    ],
  },
  {
    version: "0.1.11",
    date: "July 26, 2026",
    dateTime: "2026-07-26",
    summary: "Faster note switching and a direct path back to Finder.",
    changes: [
      "Added Show in Finder to the context menu for notes and folders.",
      "Kept open editors laid out in memory so switching notes avoids rebuilding the document view.",
      "Removed redundant Linkify initialization and fixed title resize feedback loops.",
      "Limited disk refreshes to window-focus and AssistantPi change events instead of every tab switch.",
    ],
  },
  {
    version: "0.1.10",
    date: "July 16, 2026",
    dateTime: "2026-07-16",
    summary: "Todos and bookmarks are now useful without leaving your note.",
    changes: [
      "Added expandable Todo and Bookmark previews directly in the sidebar.",
      "Complete or reopen todos from the preview without leaving the current note.",
      "Bookmark indicators follow their first assigned tag color, and links open directly in your browser.",
      "Settings now shows the installed Ornata version in the update section.",
    ],
  },
  {
    version: "0.1.9",
    date: "July 15, 2026",
    dateTime: "2026-07-15",
    summary: "A faster way to move through long notes without leaving the editor.",
    changes: [
      "Added a magnetic article outline built from H1–H3 headings.",
      "The outline follows the active section and expands around the heading you point to.",
      "Click any section for a smooth jump; subtle interaction sounds can be disabled in Settings.",
    ],
  },
  {
    version: "0.1.8",
    date: "July 15, 2026",
    dateTime: "2026-07-15",
    summary: "AssistantPi now starts with the note you are already working in.",
    changes: [
      "The open note is attached to AssistantPi automatically as working context.",
      "Fixed Pi startup in production builds by resolving the user’s installed Node environment.",
      "Updated the editor empty state to use the current Ornata icon.",
    ],
  },
  {
    version: "0.1.7",
    date: "July 15, 2026",
    dateTime: "2026-07-15",
    summary: "AssistantPi arrives with explicit permissions and your choice of model.",
    changes: [
      "Connected Ornata to Pi installed and configured on your Mac.",
      "Added Read only, Read & write, and Full Access permission modes.",
      "Selected note text can be attached to a request, and responses render as Markdown.",
      "Introduced the lightweight, hand-drawn Ornata app icon.",
    ],
  },
  {
    version: "0.1.6",
    date: "July 14, 2026",
    dateTime: "2026-07-14",
    summary: "Ornata now speaks English and Simplified Chinese.",
    changes: [
      "Added complete English and Simplified Chinese interface localization.",
      "Added language switching directly in Settings.",
      "Refreshed the app with a lighter visual identity.",
    ],
  },
  {
    version: "0.1.5",
    date: "July 14, 2026",
    dateTime: "2026-07-14",
    summary: "The first fully signed, notarized, and privately distributed build.",
    changes: [
      "Moved signed application and update distribution to Cloudflare R2.",
      "Added Apple Developer ID signing, notarization, and secure in-app update signatures.",
      "Added external Markdown file editing and language-aware code block highlighting.",
      "Completed the product transition to Ornata.",
    ],
  },
  {
    version: "0.1.4",
    date: "July 12, 2026",
    dateTime: "2026-07-12",
    summary: "More control over Markdown and more reliable file operations.",
    changes: [
      "Added Markdown source editing and code block copy actions.",
      "Improved nested note moves and keyboard accessibility.",
      "Hardened app configuration and updater permissions.",
    ],
  },
  {
    version: "0.1.3",
    date: "July 9, 2026",
    dateTime: "2026-07-09",
    summary: "A smoother first run for a brand-new notes folder.",
    changes: [
      "Added a create-new-vault flow to the welcome screen.",
      "New notes now open directly in the editor.",
      "Improved toast readability in dark mode.",
    ],
  },
  {
    version: "0.1.2",
    date: "July 9, 2026",
    dateTime: "2026-07-09",
    summary: "Updates can now arrive without reinstalling the app manually.",
    changes: [
      "Added automatic update checks on launch.",
      "Added an update-available action and manual checks in Settings.",
    ],
  },
  {
    version: "0.1.1",
    date: "July 9, 2026",
    dateTime: "2026-07-09",
    summary: "Polish for setup, navigation, and recovery.",
    changes: [
      "Added a starter welcome note for new vaults.",
      "Added reveal-vault and Settings actions to the command palette.",
      "Added crash recovery alongside sidebar search, theme controls, and Settings refinements.",
    ],
  },
  {
    version: "0.1.0",
    date: "July 9, 2026",
    dateTime: "2026-07-09",
    summary: "The first public release of Ornata’s local-first Markdown workspace.",
    changes: [
      "Plain Markdown notes stored in a folder you own, with real folders and multiple tabs.",
      "Internal page links, preserved frontmatter properties, search, todos, and bookmarks.",
      "Per-vault session persistence for open tabs, active views, and tag filters.",
    ],
  },
];

