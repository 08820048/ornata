import { Code, H3, Kbd, Li, P, Table, Ul, type DocSection } from "./Prose";

const B = ({ children }: { children: React.ReactNode }) => (
  <strong className="font-medium text-foreground">{children}</strong>
);

const SHORTCUTS: Array<[string, string]> = [
  ["⌘K", "命令面板：搜索笔记、执行任何操作"],
  ["⌘N", "新建笔记"],
  ["⌘J", "今天的笔记"],
  ["⌘O", "打开任意位置的 Markdown 文件"],
  ["⌘W", "关闭当前标签页"],
  ["⌘F  /  ⌘⌥F", "笔记内查找  /  查找并替换"],
  ["⌘\\", "显示或隐藏边栏"],
  ["⌘,", "设置"],
  ["⌘⇧D", "切换主题：跟随系统、浅色、深色"],
  ["⌘⇧F", "专注模式"],
  ["⌘[  /  ⌘]", "当前窗格后退  /  前进"],
  ["⌘⇧\\", "拆分当前窗格"],
  ["⌘1 – ⌘4", "跳到某个窗格"],
  ["⌘.", "下一个窗格"],
  ["⌘↵", "在命令面板里：把结果在侧边打开"],
  ["⌘ 点击", "在笔记链接上：在侧边打开"],
  ["⌥↑  /  ⌥↓", "上移或下移块或列表项"],
  ["⌘⌥J", "在任何应用里快速记录到收件箱"],
];

export const REFERENCE_ZH: DocSection[] = [
  {
    id: "shortcuts",
    title: "键盘快捷键",
    lead: "所有能用键盘完成的操作。",
    body: (
      <>
        <Table head={["按键", "作用"]} rows={SHORTCUTS.map(([keys, does]) => [<Kbd key={keys}>{keys}</Kbd>, does])} />
        <P>同样的列表也在「设置 → 快捷键」里。</P>
      </>
    ),
  },
  {
    id: "settings",
    title: "设置",
    lead: "用 ⌘, 打开 —— 找不到某项时可以搜索设置。",
    body: (
      <Ul>
        <Li><B>通用</B> —— 界面语言（English 或简体中文）和应用版本。</Li>
        <Li><B>外观</B> —— 浅色、深色，或跟随系统。</Li>
        <Li><B>编辑器</B> —— 大纲提示音和动画光标。</Li>
        <Li><B>图像</B> —— 把粘贴的图片保存在笔记库里，或运行你自己的上传命令。</Li>
        <Li><B>导出</B> —— PDF 纸张大小和页边距。</Li>
        <Li><B>仓库</B> —— 当前打开的是哪个文件夹，以及更换它。</Li>
        <Li><B>智能体 (MCP)</B> —— 外部智能体可以做什么，以及如何连接它们。</Li>
        <Li><B>快捷键</B> 和 <B>更新</B> —— 快捷键列表，以及检查新版本。Ornata 通过签名的更新源自行更新；有新版本就绪时，边栏会提示「重启以更新」。</Li>
      </Ul>
    ),
  },
  {
    id: "help",
    title: "故障排查",
    lead: "当某些地方看起来不对劲。",
    body: (
      <>
        <H3>在别处所做的修改没有显示</H3>
        <P>
          Ornata 会监视笔记库，并在笔记在磁盘上改变时重新加载它 —— 除非你在其中有尚未保存的输入，那种情况下总是以你的输入为准。切到别的窗口再切回来，可以强制检查一次。
        </P>
        <H3>智能体连不上，或返回 401</H3>
        <Ul>
          <Li>检查插头是否为绿色：服务必须已连接，并且访问级别不能是「关闭」。</Li>
          <Li>
            401 表示令牌缺失或已过期。请重新从 MCP 设置里复制那一行（先把智能体里旧的服务移除）—— 每次点「重新生成」，令牌都会变。
          </Li>
          <Li>如果 13200 端口被占用，Ornata 会改用下一个空闲端口；设置命令里总会显示正在使用的端口。</Li>
          <Li>智能体说某个工具不存在：访问级别太低。在 MCP 设置里调高，下一次调用就会生效。</Li>
        </Ul>
        <H3>某个链接是灰色虚线</H3>
        <P>
          它指向的笔记不存在。点击它会创建这篇笔记，或者修正链接。在 Ornata 内重命名笔记会替你改写链接；在 Finder 里重命名文件则不会。
        </P>
        <H3>重启后一切似乎都不在原来的位置</H3>
        <P>
          Ornata 会恢复你的标签页、分屏布局，以及每个窗格的前进后退轨迹。期间被删除的笔记会被略过。这些都不会改动你的笔记本身。
        </P>
        <P>
          还是不行？这些文件是你笔记库文件夹里的普通 Markdown，永远属于你。可以看看{" "}
          <a className="text-foreground underline underline-offset-4" href="/zh#faq">常见问题</a>，或在{" "}
          <a className="text-foreground underline underline-offset-4" href="/zh/updates">更新日志</a> 里看看改了什么。
        </P>
        <p className="sr-only">
          <Code>ornata</Code>
        </p>
      </>
    ),
  },
];
