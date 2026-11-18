# Windows 版:构建和发布

Windows 版有两种发布方式:

- **首选:GitHub Actions**(仓库公开后 Actions 免费)。在网页上点一下就行,见下一节。
- **备用:云端 Windows 机器**。CI 出问题,或者要在真机上调试时用,见后面的“在云端 Windows 上手动发布”。

两种方式运行的是同一个脚本(`bun run release:windows`),检查规则也一样。macOS 版仍在维护者的 Mac 上发布(见 AGENTS.md 的 Releasing)。

## 先记住一条规则:先发 Mac,再发 Windows,版本号相同

应用内的更新读取一个共用的清单 `channels/stable/latest.json`。一个清单只能写一个版本号,里面按平台分条(`darwin-aarch64`、`windows-x86_64`)。所以:

1. 每个版本先在 Mac 上发布(`bun run release` + `release:publish`),版本号的修改也是在那一步提交的。
2. 然后用同一个提交构建 Windows 版(CI 或云端机器),**版本号相同**,把 Windows 这一条加进清单。

脚本会强制执行这条规则:

- `release:windows` 和 `update:generate` 会读取线上清单,把 macOS 那条合并进来。如果线上的版本号和要构建的不一样,就直接停下。
- `release:publish` 上传之前会再核对一次:如果新清单会删掉线上同版本已有的平台,或者 Windows 要发布的版本号和线上的不一样,就拒绝发布。

之前就出过这个问题:清单被只含 Windows 的版本覆盖,Mac 用户就再也收不到更新。

Mac 发布新版本时,清单里旧的 Windows 条目会被去掉,这是正常的。从那时起到 Windows 补发之前,Windows 用户暂时收不到更新。

## 用 GitHub Actions 发布

### 一次性准备:配置密钥

仓库 → **Settings → Environments → New environment**,名字填 `release`。在这个环境里添加 4 个 **Environment secrets**:

| 名称 | 内容 |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Mac 上 `~/.tauri/ornata-markd.key` 文件的**全部内容**(不是路径) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 这把密钥的密码(Mac 钥匙串里的 `ornata-markd-tauri-updater`) |
| `CLOUDFLARE_API_TOKEN` | Cloudflare 令牌,权限只需要 **Workers R2 Storage: Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 ID(控制台右侧栏,或 `bunx wrangler whoami`) |

建议在这个环境里勾选 **Required reviewers** 并填上你自己:这样每次发布前 GitHub 都会再请你确认一次。密钥放在环境里而不是仓库级别,别人提交的 PR 读不到它们。

### 每次发布

前提和下面的规则一样:这个版本已经在 Mac 上发布,线上清单就是这个版本号。

1. 打开仓库的 **Actions → Release Windows → Run workflow**。
2. `version` 填版本号(例如 `0.13.1`)。`publish` **先不勾**,运行一次:只构建,不上传。
3. 跑完后在这次运行页面下方的 **Artifacts** 下载 `ornata-<版本>-windows`,在 Windows 上装一下试试。
4. 没问题就再运行一次,这次勾上 `publish`:上传到 R2,把 Windows 加进稳定渠道,并把安装包附到这个版本的 GitHub Release 上(Release 由 Mac 发布时创建)。
5. 修改 `site/lib/config.ts` 里的 `WINDOWS_VERSION` 并部署官网(见“发布之后”)。

## 在云端 Windows 上手动发布(备用)

### 一次性准备

在云端 Windows 上安装:

| 工具 | 版本 / 说明 |
| --- | --- |
| Git | 任意较新版本 |
| Bun | 1.3.14(与 CI 一致):`powershell -c "irm bun.sh/install.ps1 \| iex"` |
| Rust | 用 rustup 安装;仓库的 `rust-toolchain.toml` 固定为 1.99.1,第一次构建时会自动下载 |
| Visual Studio Build Tools | 勾选“使用 C++ 的桌面开发”(MSVC 和 Windows SDK) |
| WebView2 Runtime | Windows 10/11 一般已自带 |

NSIS 不用自己装,`tauri build` 第一次运行时会自动下载。

#### 更新签名密钥

Windows 安装包的更新签名和 Mac 用的是**同一把** Tauri 更新密钥。签名不对,已安装的应用会拒绝这次更新。

- 把 Mac 上的 `~/.tauri/ornata-markd.key` 复制到云端机器的 `%USERPROFILE%\.tauri\ornata-markd.key`。只能通过可信渠道传输,不要提交到任何仓库。
- 密钥的密码保存在 Mac 钥匙串里(服务名 `ornata-markd-tauri-updater`)。在 Mac 上用下面的命令查看:
  `security find-generic-password -a "$USER" -s ornata-markd-tauri-updater -w`
- 在 Windows 上,每次构建前在当前 PowerShell 窗口里设置一次密码,不要写进脚本或配置文件:

  ```powershell
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = Read-Host -MaskInput "updater key password"
  ```

#### Cloudflare(上传安装包用)

在仓库的 `site` 目录下运行 `bunx wrangler login`,用和 Mac 相同的 Cloudflare 账号登录。登录后运行 `bunx wrangler whoami`,能看到账号名就说明成功了。

如果是无界面的机器,改用 API 令牌:令牌需要 R2 编辑权限,分别设置环境变量 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`。

#### 拉取代码

```powershell
git clone https://github.com/08820048/ornata.git
cd ornata
bun install --frozen-lockfile
```

### 只验证,不发布

拉取最新代码后,先跑一遍检查,再在本机运行应用:

```powershell
git pull
bun install --frozen-lockfile
bunx tsc --noEmit
bun test
cd src-tauri; cargo clippy --all-targets -- -D warnings; cargo test; cd ..
bun tauri dev
```

需要试一下安装包时,运行 `bun tauri build --bundles nsis`。产物在 `src-tauri\target\release\bundle\nsis\`。没有设置签名密钥时,这一步可能会因为无法签更新包而报错,这不影响试用;要发布时用下一节的脚本。

建议每次重点检查的项目:

- 设置窗口:从状态栏的齿轮、Ctrl+K 命令面板和 Ctrl+, 都能打开,内容正常显示,可以关闭,再次打开时会聚焦已有的窗口。
- 标题栏:在应用里切换浅色 / 深色 / 跟随系统,原生标题栏跟着变色,包括系统是浅色、应用设为深色的情况。
- 图标:任务栏、开始菜单、安装程序、桌面快捷方式里都是圆角图标,四角透明。
- 导出 PDF:Windows 上会弹出系统打印对话框(选“另存为 PDF”)。设置 › 导出 里的纸张和页边距在 Windows 上暂时不起作用(已知问题)。

### 构建并发布

前提:这个版本已经在 Mac 上发布,线上清单的版本号就是它。可以用下面的命令确认:

```powershell
(Invoke-RestMethod "https://download.ornata.app/products/ornata-markd/channels/stable/latest.json").version
```

然后:

```powershell
git pull                                   # 拉到包含版本号修改的提交
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = Read-Host -MaskInput "updater key password"
bun run release:windows 0.13.1             # 清理、构建 NSIS、签名、生成合并后的清单
```

脚本会把安装包和签名放到 `release\0.13.1\windows-x86_64\`,并在 `release\0.13.1\latest.json` 里同时保留 macOS 和 Windows 两条。发布前请先:

1. 在这台机器上安装 `release\0.13.1\windows-x86_64\Ornata_0.13.1_x64-setup.exe`,打开试用一下。
2. 打开 `release\0.13.1\latest.json`,确认 `platforms` 里有 `darwin-aarch64` 和 `windows-x86_64` 两条。

确认无误后:

```powershell
bun run release:publish -- 0.13.1            # 试运行,只列出要上传的内容
bun run release:publish -- 0.13.1 --confirm  # 上传到 R2 并切换稳定渠道(不可撤销)
```

`--confirm` 结束时,脚本会重新读取线上清单,并检查安装包地址能否访问。

## 发布之后

1. 在 Mac 上(或任何装了仓库的机器上)修改 `site/lib/config.ts` 里的 `WINDOWS_VERSION`,改成新版本号。先确认下面这个地址返回 200:
   `https://download.ornata.app/products/ornata-markd/releases/0.13.1/windows-x86_64/Ornata_0.13.1_x64-setup.exe`
   然后 `cd site && bun run deploy`。官网的 Windows 下载按钮只认这个数字,Mac 发版不会动它。
2. 如果这个版本有只影响 Windows 的修复,在 `CHANGELOG.md` 和 `site/lib/releases.ts` 对应版本下补一句。

## 常见问题

- **`the checkout is 0.13.0, not 0.13.1`**:代码不是 Mac 发版的那个提交。先 `git pull`。
- **`the stable channel serves 0.13.0`**:Mac 还没发这个版本,或者你输错了版本号。Windows 只能发线上正在用的版本。
- **`missing updater signature`**:密钥文件不在 `%USERPROFILE%\.tauri\ornata-markd.key`,或者密码不对。
- **Windows 上要不要发一个比 Mac 新的版本?** 不行。一个清单只能有一个版本号,只发 Windows 会让 Mac 用户收不到更新。先在 Mac 上发,再在 Windows 上补。
