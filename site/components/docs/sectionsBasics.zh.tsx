import { Code, H3, Kbd, Li, P, Pre, Table, Ul, type DocSection } from "./Prose";

const B = ({ children }: { children: React.ReactNode }) => (
  <strong className="font-medium text-foreground">{children}</strong>
);

export const BASICS_ZH: DocSection[] = [
  {
    id: "start",
    title: "开始使用",
    lead: "安装 Ornata，选一个文件夹，开始写。",
    body: (
      <>
        <P>
          Ornata 支持 macOS 12 或更高版本（Apple 芯片）和 64 位 Windows 10 或更高版本。在 Windows 上，文档里的 ⌘ 对应 Ctrl，⌥ 对应 Alt。从首页下载并打开应用。第一次启动时，选择 <B>创建新仓库</B>{" "}
          为笔记新建一个文件夹，或选择 <B>打开现有仓库</B> 使用你已有的 Markdown 文件夹 —— 包括 Obsidian 的。
        </P>
        <P>
          按 <Kbd>⌘N</Kbd> 新建笔记，输入标题，开始写。停下输入片刻后会自动保存，没有保存按钮。
        </P>
        <P>
          随时按 <Kbd>⌘K</Kbd> 跳转到某篇笔记或执行命令。这一个快捷键几乎能带你去任何地方。
        </P>
      </>
    ),
  },
  {
    id: "vault",
    title: "你的笔记库",
    lead: "放在你自己真实文件夹里的纯 Markdown 文件。",
    body: (
      <>
        <P>笔记库就是一个文件夹：</P>
        <Pre>{`my-vault/
├── notes/       你的笔记 —— 真实文件夹里的普通 .md 文件
└── .ornata/     应用数据：粘贴的图片、笔记历史、模板`}</Pre>
        <Ul>
          <Li>
            笔记的 <B>文件名就是它的标题</B>，没有任何 ID。重命名笔记就是重命名文件，所有指向它的链接都会被改写。
          </Li>
          <Li>
            你可以用其他编辑器编辑同样的文件。Ornata 会在外部改动发生时、以及你切回它时发现这些改动。如果某篇笔记里有尚未保存的输入，以你的输入为准。
          </Li>
          <Li>
            其他工具写入的 frontmatter 会原样保留，并以只读的「属性」面板显示在笔记上方。Ornata 自己从不写 frontmatter。
          </Li>
          <Li>
            删除笔记会把它移到废纸篓。Ornata 没有内置同步；因为笔记就是文件，iCloud 云盘、Dropbox 或 git 的用法与任何文件夹一样。
          </Li>
          <Li>
            用 <Kbd>⌘O</Kbd> 打开任意位置的 Markdown 文件。它像普通笔记一样在标签页里打开，但不会被复制进笔记库。
          </Li>
          <Li>
            侧栏里的<strong className="font-medium text-foreground">笔记库</strong>会打开一个标签页，把文件夹和笔记显示成卡片：文件夹卡片露出里面最近修改的笔记，笔记卡片是正文开头的缩略图。点文件夹进入，用顶部的路径返回，点笔记打开它。
          </Li>
          <Li>在「设置 → 通用」里更换当前打开的笔记库。</Li>
        </Ul>
      </>
    ),
  },
  {
    id: "writing",
    title: "写作",
    lead: "一个不碍事的 Markdown 编辑器。",
    body: (
      <>
        <H3>边打字边 Markdown</H3>
        <P>在行首输入常见的 Markdown 写法，会自动变成对应的格式：</P>
        <Table
          head={["输入", "得到"]}
          rows={[
            [<Code key="1"># </Code>, "一级标题（## 为二级，### 为三级）"],
            [<Code key="2">- </Code>, "无序列表"],
            [<Code key="3">1. </Code>, "有序列表"],
            [<Code key="4">* </Code>, "带复选框的待办（- [ ] 也可以）"],
            [<Code key="5">&gt; </Code>, "引用"],
            [<Code key="6">---</Code>, "分隔线"],
            [<Code key="7">```</Code>, "代码块"],
          ]}
        />
        <H3>建议菜单</H3>
        <P>
          在任意一行输入 <Code>/</Code>，或点击空行左侧出现的 <B>+</B>，打开建议菜单：标题、列表、引用、表格、分隔线，以及指向其他笔记的链接。继续输入可缩小范围。输入{" "}
          <Code>/code</Code> 可按语言选择代码块 —— 约三十种，外加 Mermaid。
        </P>
        <P>
          输入 <Code>@</Code> 可插入指向今天、明天或昨天{" "}
          <a className="text-foreground underline underline-offset-4" href="#daily">日记</a>{" "}
          的链接。
        </P>
        <H3>表格</H3>
        <P>
          用 <Code>/table</Code> 插入表格。在最后一格按 <Kbd>Tab</Kbd> 会新增一行；把鼠标移到表格上，底边和右边会出现
          添加行、添加列的 <B>+</B> 条。在单元格上点右键可以在上下插入行、在左右插入列、设置本列的对齐方式，或删除行、列和整张表格。对齐方式保存为标准
          Markdown（<Code>:---:</Code>）。
        </P>
        <H3>提示块</H3>
        <P>
          以 <Code>[!note]</Code> 开头的引用会显示成提示块，带图标和标签：<Code>&gt; [!note] 标题</Code>。类型有{" "}
          <Code>note</Code>、<Code>tip</Code>、<Code>important</Code>、<Code>warning</Code>、<Code>caution</Code>
          ，也认识 Obsidian 的类型名（<Code>info</Code>、<Code>bug</Code> 等）。用 <Code>/callout</Code>{" "}
          插入；点一下标签可以改类型。文件里保存的就是你输入的这行 Markdown，GitHub 和 Obsidian 都能照常显示。
        </P>
        <H3>图片大小与图注</H3>
        <P>
          鼠标移到图片上，右边缘会出现一个拖柄：拖动调整宽度，双击拖柄恢复原始大小。单击图片会在下方显示它的 Markdown，在路径后面加上{" "}
          <Code>&quot;图注&quot;</Code> 就会在图片下显示图注。双击图片放大查看。调整过大小的图片保存为 <Code>&lt;img&gt;</Code>{" "}
          标签（Markdown 本身没有尺寸语法），其余仍是普通的 <Code>![]()</Code>。
        </P>
        <H3>脚注</H3>
        <P>
          在正文里写 <Code>[^1]</Code>，再另起一行写 <Code>[^1]: 脚注内容</Code>。正文里的标记显示成编号，鼠标悬停可以看到脚注内容，按住{" "}
          <Kbd>⌘</Kbd> 点击编号跳到脚注（在脚注上点击则跳回正文）。<Code>/footnote</Code>{" "}
          会一次插入标记和脚注行。编号按出现顺序排列，文件里保存的仍是你写的标记。
        </P>
        <H3>链接与图片</H3>
        <Ul>
          <Li>
            用 <Code>/link</Code> 链接到另一篇笔记，或输入 <Code>[[</Code> 加标题。Ornata 会把它存成标准的 Markdown 链接{" "}
            <Code>[标题]（文件夹/笔记.md）</Code>，所以在其他应用里也能用。指向标题的链接形如 <Code>笔记.md#标题</Code>。
          </Li>
          <Li>把鼠标停在指向另一篇笔记的链接上，会浮出那篇笔记的开头内容，不用打开就能看一眼。</Li>
          <Li>指向尚不存在的笔记的链接显示为灰色虚线；点击它会创建这篇笔记。</Li>
          <Li>
            把图片粘贴或拖进笔记，会保存到 <Code>.ornata/assets/</Code>。你也可以在「设置 → 编辑器」里改用自己的上传命令，例如 PicGo。
          </Li>
        </Ul>
        <H3>代码、公式与图表</H3>
        <Ul>
          <Li>
            代码块带语法高亮和复制按钮。点击语言标签可以选中整个代码块、复制、折叠或更改语言。悬停在代码块上，可用边栏的箭头折叠某个函数或分支；折叠只改变显示，复制时仍会复制全部内容。
          </Li>
          <Li>
            用 <Code>$x^2$</Code> 写行内公式，或用单独一行的 <Code>$$ ... $$</Code> 写块级公式（KaTeX）。
          </Li>
          <Li>
            语言为 <Code>mermaid</Code> 的代码块会渲染成图表；点击它可查看并编辑源码。
          </Li>
        </Ul>
        <H3>在笔记里移动</H3>
        <Ul>
          <Li>每个标题左侧有一个小箭头，可折叠它的内容。较长的笔记右侧边缘还有大纲。</Li>
          <Li>
            <Kbd>⌥↑</Kbd> 和 <Kbd>⌥↓</Kbd> 移动当前块，或在同级列表项之间移动当前项。撤销一次就能放回原处。
          </Li>
          <Li>
            <Kbd>⌘F</Kbd> 在笔记内查找；<Kbd>⌘⌥F</Kbd> 加上替换。
          </Li>
          <Li>
            右上角的 <Code>{"</>"}</Code> 按钮可在编辑器和原始 Markdown 之间切换。
          </Li>
          <Li>
            <Kbd>⌘⇧F</Kbd> 是专注模式：侧边栏和各个栏会淡出，直到你把鼠标移过去。
          </Li>
        </Ul>
      </>
    ),
  },
  {
    id: "links",
    title: "链接、标签与图谱",
    lead: "看见你的笔记如何相连。",
    body: (
      <>
        <Ul>
          <Li>
            笔记底部的 <B>链接提及</B> 列出链接到它的笔记，并附上链接所在的那一行作为上下文。<B>未链接的提及</B>{" "}
            显示其他笔记里提到了它的标题却没有链接的地方；点「链接」即可把它变成链接。
          </Li>
          <Li>
            其下方的小型 <B>局部图谱</B> 显示这篇笔记和它的邻居。
          </Li>
          <Li>
            从命令面板（<Kbd>⌘K</Kbd> → 关系图谱）把整个笔记库作为图谱打开。文件夹形成彩色区域，悬停一篇笔记会描出它的链接和方向，也可以搜索并飞到某篇笔记。
          </Li>
          <Li>
            标签读取自笔记正文里的 <Code>#标签</Code>，以及 frontmatter 里的 <Code>tags:</Code> 行。边栏里的 # 按钮会列出它们和数量。
          </Li>
        </Ul>
      </>
    ),
  },
];
