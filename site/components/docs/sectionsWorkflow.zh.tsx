import { Code, H3, Kbd, Li, Note, P, Pre, Table, Ul, type DocSection } from "./Prose";

const B = ({ children }: { children: React.ReactNode }) => (
  <strong className="font-medium text-foreground">{children}</strong>
);

export const WORKFLOW_ZH: DocSection[] = [
  {
    id: "panes",
    title: "标签页与分屏",
    lead: "同时打开多篇笔记，或并排阅读两篇。",
    body: (
      <>
        <P>
          每篇打开的笔记是一个标签页。<Kbd>⌘W</Kbd> 关闭当前标签；标签页的菜单里有批量关闭选项。重启后，你打开的标签会恢复。
        </P>
        <H3>分屏</H3>
        <Ul>
          <Li>
            从命令面板按 <Kbd>⌘↵</Kbd>、从标签页或文件的菜单，或 <Kbd>⌘</Kbd> 点击链接，都能把笔记 <B>在侧边打开</B>。窗格最多四个，取决于窗口宽度。
          </Li>
          <Li>
            每个窗格有自己的标题栏 —— 自己的前进后退箭头、面包屑和操作。窗格菜单（分栏图标）可以拆分、与下一个窗格交换，并列出已打开的窗格。
          </Li>
          <Li>拖动分隔条调整大小。新增或关闭窗格后，宽度会重新均分。</Li>
          <Li>
            <Kbd>⌘1</Kbd>–<Kbd>⌘4</Kbd> 跳到对应窗格，<Kbd>⌘.</Kbd> 切到下一个，<Kbd>⌘⇧\</Kbd> 拆分当前窗格。
          </Li>
          <Li>布局、各窗格宽度和每个窗格的浏览轨迹在重启后都会恢复。</Li>
        </Ul>
        <H3>后退与前进</H3>
        <P>
          <Kbd>⌘[</Kbd> 和 <Kbd>⌘]</Kbd> 沿着窗格显示过的笔记后退和前进。每个窗格都有自己的轨迹，所以箭头只移动它所在的窗格；如果某一步会落到已在另一个窗格里打开的笔记上，就会跳过。
        </P>
      </>
    ),
  },
  {
    id: "find",
    title: "查找",
    lead: "搜索、跳转，把常用的放在手边。",
    body: (
      <Ul>
        <Li>
          <Kbd>⌘K</Kbd> 同时搜索标题和内容。标题匹配排在前面，并且支持缩写：<Code>prjroad</Code> 能找到「project roadmap」。选择内容匹配会滚动到对应位置。没输入搜索词时，面板会列出最近的笔记和所有操作。
        </Li>
        <Li>边栏可以按名称或修改时间排序（「笔记」标题上的按钮）。在右键菜单里置顶一篇笔记，它就留在最上面。</Li>
        <Li>底部的栏会显示当前视图最相关的快捷键。可从命令面板隐藏（显示或隐藏快捷键栏）。</Li>
      </Ul>
    ),
  },
  {
    id: "daily",
    title: "日记、收件箱、待办、模板",
    lead: "先快速记下，稍后再回来。",
    body: (
      <Ul>
        <Li>
          <Kbd>⌘J</Kbd> 打开今天的笔记，例如 <Code>journal/2026-10-18.md</Code>，没有就创建。想让每天从模板开始，保存一个名为 <Code>daily</Code> 的模板（见下）。
        </Li>
        <Li>
          <B>快速记录：</B><Kbd>⌘⌥J</Kbd> 在任何应用里都可用。会弹出一个小框，输入一行并按回车，就带着时间追加到 <Code>Inbox.md</Code>。
        </Li>
        <Li>
          <B>待办：</B>任何 <Code>- [ ]</Code> 行（或 <Code>*</Code> 加空格）都是待办。边栏的「任务」行会按笔记分组列出整个笔记库里所有未完成的待办；在那里勾选，所在笔记里就同步完成。
        </Li>
        <Li>
          <B>模板：</B>在命令面板里可以把笔记存为模板、从模板新建笔记，或打开模板文件夹（<Code>.ornata/templates</Code>）。
        </Li>
      </Ul>
    ),
  },
  {
    id: "history",
    title: "历史与清理",
    lead: "比 ⌘Z 撤得更远。",
    body: (
      <Ul>
        <Li>
          Ornata 会在笔记变化时保留它的快照。右下角的时钟打开笔记历史：选一个快照与当前文本对比，需要时恢复它。
        </Li>
        <Li>
          时间久了，粘贴的图片可能不再被引用。<Kbd>⌘K</Kbd> → 清理图片会列出没有任何笔记引用的图片，并把它们移到废纸篓，你仍可以找回。
        </Li>
      </Ul>
    ),
  },
  {
    id: "export",
    title: "导出",
    lead: "你的笔记本来就是 Markdown。其他需求：",
    body: (
      <>
        <P>笔记右上角的 ··· 菜单里有：</P>
        <Ul>
          <Li>
            <B>PDF</B> —— 带由标题生成的书签目录。纸张大小（A4、Letter、A5）和页边距在「设置 → 导出」里选。完成后，「在 Finder 中显示」会带你到该文件。
          </Li>
          <Li>
            <B>HTML</B> —— 一个独立的页面。
          </Li>
          <Li>
            <B>Markdown</B>、<B>复制为富文本</B> 和 <B>复制 Markdown</B>。
          </Li>
        </Ul>
      </>
    ),
  },
  {
    id: "agents",
    title: "其他智能体：MCP 与命令行",
    lead: "让 Claude Code、Codex、Cursor 或一个脚本处理你的笔记。",
    body: (
      <>
        <P>
          Ornata 支持 <B>MCP</B> —— AI 智能体用来调用工具的开放标准。智能体可以搜索和读取你的笔记，查看反向链接和未完成待办，并且 —— 只有你允许时 —— 新建、编辑、追加、勾选待办、重命名、移动和删除。
        </P>
        <H3>连接智能体</H3>
        <Ul>
          <Li>
            点击状态栏的插头图标（或 <Kbd>⌘K</Kbd> → MCP 设置）。服务开启或有智能体连接时它是绿色的。
          </Li>
          <Li>
            点 <B>连接</B> 在你的 Mac 上启动服务。选择你的智能体对应的标签页并复制那一行，例如：
            <Pre>{`claude mcp add ornata --transport http http://127.0.0.1:13200/mcp \\
  --header "Authorization: Bearer <你的令牌>"`}</Pre>
          </Li>
          <Li>
            Claude Code、Gemini CLI、Cursor 和 VS Code 连接的是这个服务，所以 Ornata 必须开着。Codex 和 Claude Desktop 通过 stdio 自己启动 Ornata,Ornata 关着也能用。其他任何 MCP 客户端可以使用「其他」标签页里的 URL 和请求头。
          </Li>
        </Ul>
        <H3>智能体能做什么</H3>
        <P>你可以按笔记库在 MCP 设置（或「设置 → 智能体」）里选择：</P>
        <Table
          head={["级别", "智能体可以"]}
          rows={[
            ["关闭", "什么都不能做。"],
            ["只读（默认）", "列出、读取、搜索笔记；查看反向链接、未完成待办和日记。"],
            ["读写", "还可以新建、更新、追加笔记，写入日记和收件箱，勾选待办。每次编辑都会把旧文本保留在笔记的历史里。"],
            ["完全访问", "还可以重命名、移动和删除。被删除的笔记进入废纸篓。"],
          ]}
        />
        <P>
          这个级别只能在 Ornata 里设置，智能体自己的启动选项只能把它调低。智能体只能看到真正位于笔记库内的笔记 —— 指向别处的符号链接会被忽略。发给本地服务的每个请求都带访问令牌；如果泄露了，点「重新生成」换一个新的（用旧令牌配置的智能体需要换成新的那一行）。
        </P>
        <Note>
          同时能运行 shell 命令的智能体，可以编辑你能编辑的任何文件，包括 Ornata 的设置。访问级别只约束通过这些工具工作的智能体 —— 给能运行 shell 的智能体的信任，应与你给一个坐在你键盘前的人的信任相当。
        </Note>
        <H3>命令行</H3>
        <P>
          在 MCP 面板里安装 <Code>ornata</Code> 命令（它会链接到 <Code>~/.local/bin</Code>）。同样的级别同样适用。
        </P>
        <Pre>{`ornata search "roadmap"
ornata read projects/roadmap.md
ornata tasks
echo "ship it" | ornata journal add     # 追加到今天的笔记
ornata capture "buy milk"                # 在 Inbox.md 里记一行带时间的内容
ornata help`}</Pre>
      </>
    ),
  },
];
