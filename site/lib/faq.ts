export type Faq = { q: string; a: string };

export const FAQS_EN: Faq[] = [
  {
    q: "How much does Ornata cost?",
    a: "Ornata is free to download and use — no account, no subscription. Production builds are signed with an Apple Developer ID certificate and notarized by Apple.",
  },
  {
    q: "Where are my notes stored?",
    a: "On your Mac, as plain Markdown files in a folder you choose. The core editor needs no account or proprietary database, and you can open the folder in Finder at any time.",
  },
  {
    q: "Is there sync?",
    a: "Not built in yet. Because notes are just files in a folder, you can sync them today with iCloud Drive, Dropbox, or git. Native sync is on the roadmap.",
  },
  {
    q: "Does it work with Obsidian?",
    a: "Yes. Ornata uses the same plain-Markdown vault with real folders, and preserves frontmatter from other tools. Point Ornata and Obsidian at the same folder and both just work.",
  },
  {
    q: "Is there a graph view?",
    a: "Yes. The link graph opens as a tab beside your notes: folders form soft colored regions, hovering a note traces its links and their direction, and you can search, drag, and zoom. Any note can also show its own local graph beneath the text.",
  },
  {
    q: "Can I view two notes side by side?",
    a: "Yes. ⌘-click a link, press ⌘↵ on a result in the command palette, or choose Open to the side from a tab or a file's menu. You can have up to four panes, each with its own header and history arrows. Drag a divider to resize, or close a pane when you're done.",
  },
  {
    q: "Can I export my notes?",
    a: "They're already Markdown files, so there's nothing to export to keep them. To share, export a note as a PDF — with a bookmark outline built from its headings, plus your choice of paper size and margins — or as standalone HTML. Each export offers Show in Finder when it's done.",
  },
  {
    q: "Is the macOS download signed?",
    a: "Yes. Production downloads are signed with an Apple Developer ID certificate, notarized by Apple, and distributed through Ornata’s signed update feed.",
  },
  {
    q: "Is there a Windows version?",
    a: "Yes — a 64-bit installer for Windows 10 and later, with the same plain-Markdown vaults and the same update feed. It is newer than the Mac app, so expect rougher edges, and the installer is not yet code-signed: Windows SmartScreen may warn on first run (choose More info, then Run anyway). On Windows, Ctrl takes the place of ⌘, and PDF export goes through the system print dialog. Linux is not available yet.",
  },
  {
    q: "Can I use Claude Code, Codex, or Cursor with my notes?",
    a: "Yes. Ornata speaks MCP. Open MCP Settings from the plug in the status bar, press Connect, and add it to your agent with the one line shown there — it includes the access token the server requires. Agents that only run commands can start ornata mcp instead, which works even when Ornata is closed. The same tools are available in a terminal as ornata search, ornata journal add, ornata tasks, and more.",
  },
  {
    q: "What can an outside agent do to my notes?",
    a: "Only what you allow, per vault, in Settings: off, read only (the default), read & write, or full access. Read only lists, reads, and searches. Read & write can also create, edit, append, and tick tasks, and every edit keeps the previous version in the note's history. Full access adds rename, move, and delete, and deleted notes go to the Trash. It is set only in Ornata — an agent's own configuration can only lower it — and the server only listens on your Mac's localhost and requires an access token. An agent that can also run shell commands has your file access anyway, so give those the level you'd trust them with.",
  },
  {
    q: "How do updates work?",
    a: "Ornata automatically checks its signed update feed. When a release is available, you can download it with visible progress and restart to install it. Production builds are Developer ID signed and notarized by Apple.",
  },
  {
    q: "Which interface languages are supported?",
    a: "English and Simplified Chinese are built in. You can switch languages from Settings without changing the language of your notes.",
  },
];

/** Kept for callers that only need the English list (llms.txt). */
export const FAQS = FAQS_EN;

export const FAQS_ZH: Faq[] = [
  {
    q: "Ornata 要花多少钱？",
    a: "Ornata 可免费下载和使用 —— 无需账号，没有订阅。正式版使用 Apple Developer ID 证书签名，并经过 Apple 公证。",
  },
  {
    q: "我的笔记存在哪里？",
    a: "存在你的 Mac 上，是你所选文件夹里的普通 Markdown 文件。核心编辑器不需要账号，也没有私有数据库，你随时可以在 Finder 里打开这个文件夹。",
  },
  {
    q: "有同步功能吗？",
    a: "目前还没有内置同步。因为笔记就是文件夹里的文件，今天就可以用 iCloud 云盘、Dropbox 或 git 来同步。原生同步在计划中。",
  },
  {
    q: "能和 Obsidian 一起用吗？",
    a: "可以。Ornata 使用同样的纯 Markdown 笔记库和真实文件夹，并保留其他工具写入的 frontmatter。让 Ornata 和 Obsidian 指向同一个文件夹，两边都能正常工作。",
  },
  {
    q: "有图谱视图吗？",
    a: "有。链接图谱作为标签页在笔记旁边打开：文件夹形成柔和的彩色区域，悬停一篇笔记会描出它的链接和方向，还能搜索、拖动和缩放。任何一篇笔记也可以在正文下方显示它自己的局部图谱。",
  },
  {
    q: "可以并排查看两篇笔记吗？",
    a: "可以。⌘ 点击链接，在命令面板的结果上按 ⌘↵，或在标签页或文件的菜单里选择「在侧边打开」。最多可以有四个窗格，每个都有自己的标题栏和前进后退箭头。拖动分隔条调整大小，用完关掉即可。",
  },
  {
    q: "可以导出笔记吗？",
    a: "它们本来就是 Markdown 文件，想留住它们无需导出。要分享时，可以把笔记导出为 PDF —— 带有由标题生成的书签目录，纸张大小和页边距可选 —— 或导出为独立的 HTML。每次导出完成后都可以「在 Finder 中显示」。",
  },
  {
    q: "macOS 版下载包有签名吗？",
    a: "有。正式下载包使用 Apple Developer ID 证书签名，经 Apple 公证，并通过 Ornata 的签名更新源分发。",
  },
  {
    q: "有 Windows 版吗？",
    a: "有。提供适用于 Windows 10 及以上的 64 位安装包，使用同样的纯 Markdown 笔记库和同一个更新源。它比 Mac 版更新，细节上会更粗糙一些，而且安装包暂时还没有代码签名：首次运行时 Windows SmartScreen 可能会提示（选择「更多信息」，再点「仍要运行」）。在 Windows 上用 Ctrl 代替 ⌘，PDF 导出走系统打印对话框。Linux 版暂时没有。",
  },
  {
    q: "能用 Claude Code、Codex 或 Cursor 处理我的笔记吗？",
    a: "能。Ornata 支持 MCP。点击状态栏的插头图标打开 MCP 设置，点「连接」，再把那里给出的一行命令加到你的智能体里 —— 其中带有服务所需的访问令牌。只会运行命令的智能体可以改用 ornata mcp，这样即使 Ornata 没打开也能工作。同样的工具在终端里也可用，如 ornata search、ornata journal add、ornata tasks 等。",
  },
  {
    q: "外部智能体能对我的笔记做什么？",
    a: "只有你允许的事，并且按笔记库在设置里分别设定：关闭、只读（默认）、读写或完全访问。只读只能列出、读取和搜索。读写还能新建、编辑、追加和勾选待办，每次编辑都会把旧版本留在笔记的历史里。完全访问再加上重命名、移动和删除，被删除的笔记会进入废纸篓。这个级别只能在 Ornata 里设置 —— 智能体自己的配置只能把它调低 —— 并且服务只监听你 Mac 的本机地址，每个请求都要带访问令牌。能运行 shell 命令的智能体本来就拥有你的文件访问权限，所以请按你信任它的程度来授权。",
  },
  {
    q: "更新是怎么进行的？",
    a: "Ornata 会自动检查它的签名更新源。有新版本时，你可以在看得见进度的情况下下载，然后重启安装。正式版经过 Developer ID 签名，并由 Apple 公证。",
  },
  {
    q: "支持哪些界面语言？",
    a: "内置英文和简体中文。你可以在设置里切换语言，这不会改变你笔记本身的语言。",
  },
];
