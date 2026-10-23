import { FAQS_EN, FAQS_ZH, type Faq } from "./faq";

export type Locale = "en" | "zh";
export const LOCALES: Locale[] = ["en", "zh"];

export interface Story {
  eyebrow: string;
  title: string;
  body: string;
}

export interface Copy {
  htmlLang: string;
  nav: { why: string; inside: string; agents: string; docs: string; updates: string; download: string; langLabel: string; switchTo: string };
  downloadButton: string;
  downloadModal: { close: string; started: string; title: string; note: string; steps: [string, string, string]; done: string };
  hero: {
    aside: [string, string, string];
    readPosition: string;
    badge: string;
    headline: [string, string, string];
    body: string;
    windowsDownload: string;
    windowsLabel: string;
    platform: string;
    workbench: string;
    facts: [string, string][];
  };
  features: {
    position: string;
    positionTitle: string;
    positionBody: string;
    chapters: { write: [string, string]; connect: [string, string]; find: [string, string] };
    files: Story;
    editor: Story;
    themes: Story;
    backlinks: Story;
    graph: Story;
    split: Story;
    palette: Story;
    tasks: Story;
  };
  agents: { eyebrow: string; title: string; body: string; terminal: string };
  faq: { aside: string; title: string; lead: string; items: Faq[] };
  footer: {
    madeFor: string;
    start: string;
    title: string;
    body: string;
    updates: string;
    links: { why: string; inside: string; agents: string; docs: string; updates: string; faq: string; direct: string };
    more: string;
    version: (v: string) => string;
    tagline: string;
  };
  docs: { eyebrow: string; title: string; lead: string; onThisPage: string };
  updates: {
    archive: string;
    eyebrow: string;
    title: string;
    summary: (version: string, date: string, text: string) => string;
    download: string;
    latest: string;
    ariaLabel: string;
  };
  meta: { title: string; description: string; docsTitle: string; docsDescription: string; updatesTitle: string; updatesDescription: string };
}

const en: Copy = {
  htmlLang: "en",
  nav: { why: "Why Ornata", inside: "Inside the app", agents: "Agents", docs: "Docs", updates: "Updates", download: "Download", langLabel: "中文", switchTo: "简体中文" },
  downloadButton: "Download for macOS",
  downloadModal: {
    close: "Close",
    started: "Download started",
    title: "Three small steps, then it is yours.",
    note: "Ornata releases are signed with a Developer ID and notarized by Apple before distribution.",
    steps: ["Open the downloaded Ornata .dmg", "Drag Ornata into Applications", "Open it and choose your notes folder"],
    done: "Got it",
  },
  hero: {
    aside: ["Local-first", "Markdown", "Mac & Windows"],
    readPosition: "Read the position",
    badge: "A focused writing instrument",
    headline: ["Markdown,", "without the", "machinery."],
    body: "Ornata is a local-first Markdown notes app for macOS and Windows. It keeps the editor fast, the interface quiet, and every note as a plain .md file in a folder you own. No proprietary database. No account required. Just a precise place to write.",
    windowsDownload: "Download for Windows",
    windowsLabel: "Download Ornata for Windows (64-bit)",
    platform: "macOS 12+ (Apple Silicon) · Windows 10+ (64-bit)",
    workbench: "The workbench / 01",
    facts: [["Format", "Plain .md"], ["Storage", "Your folder"], ["Account", "Not required"], ["Build", "Signed & notarized"]],
  },
  features: {
    position: "The position",
    positionTitle: "Notes should outlive the app.",
    positionBody: "Most notes apps grow into systems you have to maintain — plugins, sync layers, a private database. Ornata stays an instrument: quick to open, quiet while you write, and honest about where your files live.",
    chapters: { write: ["Write.", "Plain files underneath, a precise editor on top."], connect: ["Connect.", "Links become context, and the context becomes a map."], find: ["Find.", "Everything important is one keystroke away."] },
    files: { eyebrow: "Plain files, real folders", title: "Your notes are already exported.", body: "Pick any folder. Ornata writes ordinary Markdown into real directories, keeps frontmatter from other tools, and notices edits made elsewhere. When you need to share, export a PDF with a bookmark outline, or standalone HTML." },
    editor: { eyebrow: "A professional editor", title: "Rich where it helps. Plain underneath.", body: "Clean typography, language-aware code, pasted images, and a magnetic outline for long notes — while the file on disk stays readable anywhere." },
    themes: { eyebrow: "Themes", title: "One theme for the day, another for the night.", body: "Pick a colour scheme for light mode and another for dark — warm Paper with a hand-drawn touch, near-black Basalt, a neon-pink noir — and switch from the status bar without opening Settings." },
    backlinks: { eyebrow: "Linked mentions", title: "See what links here.", body: "Every note lists the notes that reference it, with the linking line as context — and surfaces plain mentions that should become links." },
    graph: { eyebrow: "The link graph", title: "See how your ideas connect.", body: "Folders gather into soft regions, hovering a note traces its links and which way they point, and search flies straight to the note you need. Any note can also show its own neighborhood beneath the text." },
    split: { eyebrow: "Side by side", title: "Read one note while you write another.", body: "⌘-click a link, or press ⌘↵ in the palette, and the note opens beside this one. Up to four panes, each with its own header and history arrows. Drag a divider to resize, or close a pane when you're done." },
    palette: { eyebrow: "Command palette", title: "One keystroke to anywhere.", body: "Search titles and content, jump between notes, or run any action from ⌘K." },
    tasks: { eyebrow: "Vault-wide tasks", title: "Every open task, in one list.", body: "Checkboxes from across the vault, with counts and folder context. Tick one here and it's done in its note." },
  },
  agents: {
    eyebrow: "Any agent, one vault",
    title: "Bring the agent you already use.",
    body: "Ornata speaks MCP, so Claude Code, Codex, Cursor, and the rest can search your notes, add to today’s page, and tick off tasks. You decide per vault what an agent may do — off, read only, or read & write — and every edit keeps the old version in the note’s history.",
    terminal: "Or from any terminal:",
  },
  faq: { aside: "Details", title: "The practical questions.", lead: "Storage, compatibility, updates, and exactly what an outside agent can do.", items: FAQS_EN },
  footer: {
    madeFor: "Made for Mac and Windows",
    start: "Start with a folder",
    title: "Give your notes less software.",
    body: "Download Ornata, choose a folder, and keep writing in files that never stop being yours.",
    updates: "Read the updates",
    links: { why: "Why Ornata", inside: "Inside the app", agents: "Agents", docs: "Docs", updates: "Updates", faq: "FAQ", direct: "Direct download" },
    more: "More products",
    version: (v) => `© Ornata · version ${v}`,
    tagline: "Plain Markdown · no required account",
  },
  docs: { eyebrow: "Documentation", title: "Using Ornata.", lead: "Everything the app does, in the order you are likely to need it.", onThisPage: "On this page" },
  updates: {
    archive: "Release archive",
    eyebrow: "Product updates",
    title: "What's new in Ornata.",
    summary: (version, date, text) => `Version ${version} (${date}): ${text} Earlier releases are listed below.`,
    download: "Download latest",
    latest: "Latest",
    ariaLabel: "Ornata release history",
  },
  meta: {
    title: "Ornata — local-first Markdown notes for Mac and Windows",
    description: "Ornata is a free, local-first Markdown notes app for macOS and Windows. Notes stay as plain .md files in a folder you own, with a link graph, backlinks, and an MCP server so the AI agents you already use can work on your notes only as far as you allow.",
    docsTitle: "Docs",
    docsDescription: "How to use Ornata: vaults, writing, links, split view, search, daily notes, export, MCP and the command line, shortcuts, and troubleshooting.",
    updatesTitle: "Updates",
    updatesDescription: "Release notes for every version of Ornata.",
  },
};

const zh: Copy = {
  htmlLang: "zh-CN",
  nav: { why: "为什么是 Ornata", inside: "应用一览", agents: "智能体", docs: "文档", updates: "更新日志", download: "下载", langLabel: "EN", switchTo: "English" },
  downloadButton: "下载 macOS 版",
  downloadModal: {
    close: "关闭",
    started: "已开始下载",
    title: "三个小步骤，然后它就属于你。",
    note: "Ornata 的每个版本在分发前都经过 Developer ID 签名和 Apple 公证。",
    steps: ["打开下载好的 Ornata .dmg", "把 Ornata 拖进「应用程序」", "打开它，选择你的笔记文件夹"],
    done: "知道了",
  },
  hero: {
    aside: ["本地优先", "Markdown", "Mac · Windows"],
    readPosition: "了解我们的主张",
    badge: "一件专注的写作工具",
    headline: ["Markdown，", "没有多余的", "机关。"],
    body: "Ornata 是一款支持 macOS 和 Windows 的本地优先 Markdown 笔记应用。编辑器够快，界面够安静，每篇笔记都是你自己文件夹里的一个普通 .md 文件。没有私有数据库，不需要账号，只有一个精准的写作之处。",
    windowsDownload: "下载 Windows 版",
    windowsLabel: "下载 Ornata Windows 版（64 位）",
    platform: "macOS 12+（Apple 芯片）· Windows 10+（64 位）",
    workbench: "工作台 / 01",
    facts: [["格式", "纯 .md"], ["存储", "你的文件夹"], ["账号", "无需账号"], ["构建", "已签名并公证"]],
  },
  features: {
    position: "我们的主张",
    positionTitle: "笔记应该比应用活得更久。",
    positionBody: "大多数笔记应用会长成一套你得维护的系统：插件、同步层、私有数据库。Ornata 只做一件趁手的工具：打开快，写作时安静，并且坦率地告诉你文件放在哪里。",
    chapters: { write: ["写。", "底层是纯文件，上层是精准的编辑器。"], connect: ["连。", "链接成为上下文，上下文连成地图。"], find: ["找。", "重要的东西，一个快捷键就到。"] },
    files: { eyebrow: "纯文件，真文件夹", title: "你的笔记，本来就已经导出了。", body: "选任意一个文件夹。Ornata 把普通 Markdown 写进真实的目录，保留其他工具写的 frontmatter，并能发现别处所做的修改。要分享时，导出带书签目录的 PDF，或独立的 HTML。" },
    editor: { eyebrow: "专业的编辑器", title: "该丰富时丰富，底层始终朴素。", body: "清爽的排版、识别语言的代码块、粘贴图片，以及长笔记的磁吸大纲 —— 而磁盘上的文件在任何地方都能读。" },
    themes: { eyebrow: "主题", title: "白天一套，夜里另一套。", body: "分别为浅色和深色模式选配色 —— 带手绘笔触的暖色纸张、近乎纯黑的玄武岩、霓虹粉的黑色电影 —— 在状态栏里就能切换，不用打开设置。" },
    backlinks: { eyebrow: "链接提及", title: "看看谁链接到这里。", body: "每篇笔记都会列出引用它的笔记，并附上链接所在的那一行作为上下文，还会找出本该变成链接的普通提及。" },
    graph: { eyebrow: "链接图谱", title: "看见想法如何相连。", body: "文件夹聚成柔和的区域，悬停一篇笔记会描出它的链接和方向，搜索可直接飞到你要找的笔记。任何一篇笔记也能在正文下方显示它自己的邻域。" },
    split: { eyebrow: "并排查看", title: "写这一篇时，读另一篇。", body: "⌘ 点击链接，或在命令面板里按 ⌘↵，笔记就在旁边打开。最多四个窗格，每个都有自己的标题栏和前进后退箭头。拖动分隔条调整大小，用完关掉即可。" },
    palette: { eyebrow: "命令面板", title: "一个快捷键，去哪都行。", body: "搜索标题与内容，在笔记间跳转，或用 ⌘K 执行任何操作。" },
    tasks: { eyebrow: "全库待办", title: "所有未完成的事，一张清单。", body: "汇总整个笔记库的复选框，带数量和所在文件夹。在这里勾掉一项，它所在的笔记里就同步完成。" },
  },
  agents: {
    eyebrow: "任何智能体，同一个笔记库",
    title: "带上你已经在用的智能体。",
    body: "Ornata 支持 MCP，所以 Claude Code、Codex、Cursor 等都能搜索你的笔记、往今天的日记里追加内容、勾选待办。每个笔记库允许智能体做什么由你决定 —— 关闭、只读，或读写 —— 每次编辑都会把旧版本留在笔记的历史里。",
    terminal: "也可以在任意终端里：",
  },
  faq: { aside: "细节", title: "实际会问的问题。", lead: "存储、兼容、更新，以及外部智能体到底能做什么。", items: FAQS_ZH },
  footer: {
    madeFor: "为 Mac 和 Windows 而做",
    start: "从一个文件夹开始",
    title: "让笔记少一点软件。",
    body: "下载 Ornata，选一个文件夹，继续在永远属于你的文件里写作。",
    updates: "查看更新日志",
    links: { why: "为什么是 Ornata", inside: "应用一览", agents: "智能体", docs: "文档", updates: "更新日志", faq: "常见问题", direct: "直接下载" },
    more: "更多产品",
    version: (v) => `© Ornata · 版本 ${v}`,
    tagline: "纯 Markdown · 无需账号",
  },
  docs: { eyebrow: "文档", title: "使用 Ornata。", lead: "应用的全部功能，按你最可能用到的顺序排列。", onThisPage: "本页内容" },
  updates: {
    archive: "版本存档",
    eyebrow: "产品更新",
    title: "Ornata 有什么新变化。",
    summary: (version, date, text) => `版本 ${version}（${date}）：${text} 更早的版本列在下方。`,
    download: "下载最新版",
    latest: "最新",
    ariaLabel: "Ornata 版本历史",
  },
  meta: {
    title: "Ornata — Mac 与 Windows 本地优先的 Markdown 笔记",
    description: "Ornata 是一款免费的、本地优先的 Markdown 笔记应用，支持 macOS 和 Windows。笔记就是你自己文件夹里的普通 .md 文件，带链接图谱、反向链接，以及一个 MCP 服务，让你已经在用的 AI 智能体在你允许的范围内处理笔记。",
    docsTitle: "文档",
    docsDescription: "如何使用 Ornata：笔记库、写作、链接、分屏、搜索、日记、导出、MCP 与命令行、快捷键和故障排查。",
    updatesTitle: "更新日志",
    updatesDescription: "Ornata 每个版本的更新说明。",
  },
};

export const COPY: Record<Locale, Copy> = { en, zh };
