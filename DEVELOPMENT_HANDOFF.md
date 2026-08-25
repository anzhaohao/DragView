## 当前目标

将非图片文件改造成 Codex 风格附件卡片，修复原生图片、文件卡与 side-chat 引用之间的重叠，并提供安全的内部预览或系统打开能力。

## 2026-08-24 实施状态

- 已将附件协议改为 host 保存候选路径，客户端仅回传 `resolutionId`、`choiceId` 和内容摘要；文件解析/复制成功后得到短期不透明 `fileId`。
- 已增加 host 文件 token 注册表、访问时 realpath/stat 身份复核、TTL/容量/revoke/生命周期清理。
- 已增加 PDF、文本、视频、音频预览和系统默认应用打开；文本限制 10 MB 文件与 1 MB 读取量，音视频/PDF 支持单 Range。
- 已把附件卡改成 280×64 px 双行卡片；支持明暗主题、键盘、移除事件隔离和预览关闭后焦点恢复。
- 已把稳定的 `conversation.input.attachments` slot 改成正常列流，原生图片 rail 恢复 static + flex-wrap，文件卡加入同一 rail；引用由 side-chat 作为后继直系子元素显示，间距 8 px。
- 已把 side-chat 导出桥改为 Cordis host-to-host capability：side-chat host 安全保存 Markdown，并从 child session 的可信记录推导 parent session；drag-file host 验证来源位于可信 exportRoot。`resolve` 为原导出文件签发 token且不创建工作区副本，只有 `copy` 才在 parent session 的权威 workspace 下安全生成 `.dsh-side-chat-exports` 副本后注册。

## DragView 改名与发布交接

- 用户于 2026-08-25 确认最终公开身份：展示品牌与 GitHub 仓库名为 **DragView**，npm/DSH 包名与客户端 module-loader ID 为 `dsh-dragview`，首发版本为 `0.1.0`。源码元数据已指向 `https://github.com/anzhaohao/DragView`；执行发布的人仍需先完成 GitHub 仓库改名并核对远端，不能把源码声明误当成云端已经改名。
- 当前本地仓库目录仍为 `D:\Postgraduate_JilinUniversity\03_Sundries\02_DevLab\20260824-dsh-drag-file-preview`，仅目录名尚未迁移，不影响 npm 身份。npm 上的 `dsh-drag-file` 属于其他维护者，不得将它当作 DragView 的别名或发布目标；npm 不支持包别名。
- 兼容层故意保留：`dsh-drag-file:add-pill`、`settingsNamespace('drag-file')`、设置/Cordis ID `drag-file`、`dshDragFileHost`、`/file-drop/*`、`dsh-drag-file-*` DOM/CSS/data/header 标识。side-chat 仍使用 v2 ACK，未安装或未 ACK 时仍走 native reference fallback；不得让 side-chat import DragView 包。
- 2026-08-25 首发准备时，已安装 profile 仍是上一阶段的 `node_modules\dsh-drag-file-preview`。发布执行者必须先备份安装目录、profile package/lockfile 与 Cordis patch，再把依赖、注入名和目录作为一个迁移单元切换到 `dsh-dragview`；不得只重命名文件夹，也不得直接在 profile 内开发。
- 回滚时必须将安装目录、profile dependency/inject 项和 lockfile 一起恢复，然后完整重启 Hana；仅改回文件夹名会造成 Cordis 指向不一致。
- 首发构建已固定使用 lockfile 中的 `esbuild@0.25.9`，`scripts/build.mjs` 直接调用 esbuild JS API，不再通过 `npx --yes`、`npx.cmd` 或 `shell: true`。标准门禁为 `npm ci && npm run build && npm run check && npm test && npm pack --dry-run --json`；`npm test` 包含真实 tgz 安装 smoke test，会核对 exports、`dsh.bundle`、Cordis 包名、client loader ID 和发布文件。
- GitHub Actions 在 Node `22.19.0` 与 `24.x` 上执行 lockfile 安装、build、生成产物无差异、check、test 和 pack dry-run。发布细节见 `docs/RELEASING.md`，版本变化见 `CHANGELOG.md`，私密漏洞报告见 `SECURITY.md`。
- DSH 市场登记前必须给 GitHub 仓库添加 `dsh-plugin` topic，并重新阅读 `awesome-dsh-plugin/awesome-dsh-plugin` 的当期贡献指南。准备时该市场要求仓库至少 1 天、至少 10 个真实提交；禁止使用空提交、空白提交或人为切碎改动凑门槛。登记文件计划为 `data/plugins/anzhaohao__DragView.yml`，category 为 `ui`，不要手写 `npm:` 字段。

## 2026-08-25 发布完成记录

- npm 已发布 `dsh-dragview@0.1.0`（`latest`），tarball `https://registry.npmjs.org/dsh-dragview/-/dsh-dragview-0.1.0.tgz`；`repository` 指向 `https://github.com/anzhaohao/DragView`，`gitHead=1b320f47`。发布前 `build/check/test` 全绿，`npm pack --dry-run` 为 40 文件 / 90,335 bytes，无秘密/备份/node_modules 混入。
- GitHub Release `v0.1.0` 已创建并附加预构建 tarball：`https://github.com/anzhaohao/DragView/releases/tag/v0.1.0`；git tag `v0.1.0` 已推送远端。
- GitHub 仓库已正式命名为 `DragView`，并已添加 `dsh-plugin`、`drag-file`、`drag-and-drop`、`file-preview`、`file-attachment`、`pdf-preview`、`dragview`、`dsh`、`deepseek-harness` 等 topic。
- DSH 插件市场 PR 已提交：`https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/3186`；登记文件 `data/plugins/anzhaohao__DragView.yml`（category `ui`），README.md / README.zh.md 已用生成器重生成。CI 的「Submission gate」与「check」均通过，等待维护者合并（合并后网站自动重建，无需再动）。
- 本地 profile 尚未迁移：已安装目录仍是 `node_modules\dsh-drag-file-preview`（`file:` 链接到本地源码目录），插件当前工作正常。切到发布身份 `dsh-dragview` 需把 profile 的 dependency/bundles 键、node_modules 目录与 lockfile 作为一个迁移单元更新，再完整重启 Hana；本步骤尚未执行（重启会中断当前 DSH 会话，交用户或后续会话）。
- 旧空目录 `D:\Postgraduate_JilinUniversity\03_Sundries\02_DevLab\20260824-dsh-drag-file` 仍被存活的 Codex 进程（`codex.exe` PID 27192）占用句柄，`Remove-Item` 报「being used by another process」；关闭该 Codex 会话后即可删除。

## 安全不变量

- 预览和系统打开接口不得接受文件路径。
- resolve 的 sample/full/choose 请求不得包含候选路径数组。
- copy、side-chat export 的工作区只能由 workspace registry 的 session membership 推导。
- side-chat 导出桥的浏览器事件只能携带 host 已签发的 opaque token 与显示/发送元数据，不能用路径或 Markdown 内容换取注册、预览或打开权限；drag-file 缺失或 v2 ACK 失败时，由 side-chat 使用自身 `savedPath` 创建原生 reference chip。
- `dropDir` 不得经过绝对路径、`.`/`..`、符号链接或 junction。
- settings POST 会在替换内存配置及调用持久化服务之前验证 `dropDir`；空值、绝对路径、危险分段和路径穿越返回 400，并保留请求前配置。合法的嵌套相对目录继续受支持。
- 系统打开必须保持 `spawn(command, args, { shell: false })`。
- preview 与 text-preview 必须从身份复核后的 open FileHandle 读取；system-open 在复核后关闭句柄，再把路径交给 Explorer/操作系统。
- 页面销毁、发送成功或移除卡片只清理 token/队列，不删除用户原文件。

## 验证与交接

- 本地回归入口：`npm run build && npm run check && npm test`。
- 2026-08-25 首发准备门禁在 Node `24.15.0` / npm `11.12.1` 上通过：`npm ci --ignore-scripts`、两次 build 的 9 个生成文件 SHA-256 完全一致、check、security/UI、rail/preview、真实 tgz 安装 smoke、`npm pack --dry-run --json` 与 `git diff --check` 均 exit 0。dry-run 产物为 `dsh-dragview-0.1.0.tgz`，90,239 bytes、解包 349,500 bytes、40 个文件；smoke 使用临时目录生成并安装 tgz 后自动清理，没有在仓库留下归档。Node 22.19 的验证交给新增 CI matrix，在 CI 实际跑绿前不得声称该平台已通过。
- 安全测试覆盖 token 生命周期/身份变化、路径穿越与 symlink/junction、Range 206/416 解析、MIME 分类、系统打开 argv、opaque resolver 与 host-registered capability bridge。
- DragView 与 side-chat 均已完成 `npm run build`、`npm run check`、`npm test`，全部 exit 0；两仓库 `git diff --check` exit 0。DragView 测试覆盖 safe transactional settings、token、Range、safe open、bridge 与 rail/preview；side-chat 覆盖 boundary 5/5、close-loop 10/10 与 export bridge。提交前 DragView 的 31 个预期文件已精确暂存，暂存差异、whitespace 与安全门禁均已通过；本文档不预写尚未生成的提交 SHA。
- 已完成正式备份、产物部署、Hana 完整重启和真实 DSH 验收；详细数据见下方“最终部署与真实验收”。

## 独立评审返工

- metadata 即使只有一个候选也只返回 `resolutionId`，不能直接注册 token。小文件 sample 覆盖全文件后才可注册；大于 `3 × 64 KB` 的文件在 sample 后无条件进入 full，且 host/browser full digest 都使用同一个 8-byte size header。
- 卡片使用 wrapper + 原生主体 button + 独立移除 button，不再嵌套交互元素。移除键盘事件仅阻止冒泡，不取消按钮默认 Enter/Space 行为。
- native attachment outer/inner rail 使用自有 data 标记；文件 bar 迁入 inner `[role=group]` 并以 `display: contents` 参与同一 flex-wrap。即使没有文件 bar，协调器也会标记并恢复原生图片 rail 的 static/wrap；observer 覆盖图片后创建、native rail 替换和移除后的重建。
- 文本预览返回受限原始文本；PDF iframe 有 error、12 秒加载超时和统一关闭清理。pagehide 与插件 effect cleanup 使用 sendBeacon/keepalive 撤销 token。
- 受控写入后再次 realpath 目标并验证它仍位于 canonical workspace root，再进行 token 注册。
- 最终安全门禁将所有文本预览响应统一为 `text/plain; charset=utf-8`，并设置 `sandbox; default-src 'none'; base-uri 'none'` CSP；HTML/XML/代码的原 MIME 仅保留为卡片 UI 元数据。
- Range HEAD 路径在 `res.end()` 前等待已验证 FileHandle 关闭；浏览器 fixture 通过实际 MutationObserver 与 debounce 验证零文件时 native rail 的插入、替换、移除和恢复。
- 真实 Hana 验收发现遮罩 `mousedown` 后浏览器默认聚焦会覆盖卡片焦点恢复；现已在 backdrop 自身的 pointer/mousedown 阶段阻止默认聚焦，并在 click 阶段关闭。浏览器回归同时验证面板内点击不关闭、遮罩点击和 Escape 关闭均把焦点返回原 `.dsh-drag-file-main`。

### 已知安全边界

Node 的跨平台文件 API 没有在此插件中提供可移植的 `openat`/目录句柄相对写入，因此仍存在“目录验证完成后、创建文件前”被同机同权限恶意进程替换目录的极窄竞态窗口。当前通过逐层拒绝 symlink/junction、每层 realpath containment、随机 `wx` 创建以及写后 realpath containment 复核收紧该窗口。该残余不等同于客户端获得任意路径权限：side-chat 源必须位于 exportRoot，注册目标还必须通过权威 workspace 的写后 containment；交接中仍不得声称 TOCTOU 已完全消除。

预览与文本读取保持在已验证的 FileHandle 上，避免复核后再按路径重新读取。system-open 必须关闭复核句柄后交给 Explorer/操作系统，因此在该交接点仍存在无法完全消除的极窄路径替换竞态；这属于明确的 OS 边界，不能描述为已彻底消除。

## 最终部署与真实验收（2026-08-24，上一包名阶段的历史记录）

### 备份、部署与进程

- 源码修改前备份：`E:\software\AI改前备份\20260824_165730_dsh-drag-file-Codex附件卡片源码修改前_codex`。
- 正式部署前备份：`E:\software\AI改前备份\20260824_185521_dsh-drag-file-Codex附件卡片改造前_codex`。
- DragView 改名前源码与部署备份：`E:\software\AI改前备份\20260824_211432_DragView改名前源码与部署备份_codex`。
- 构建产物已部署到 `C:\Users\anzhaofeng\.hanako\plugin-data\dsh-hanako\dsh-home\profiles\web\node_modules\dsh-drag-file-preview`，旧安装目录 `node_modules\dsh-drag-file` 不存在。
- Hana 已在改名部署后完整重启；主进程 PID 为 `45964`，端口 `9222` owner 为 `45964`，端口 `3080` owner 为 `16128`。

### Host 与 HTTP 安全验收

- `POST /file-drop/settings` 发送 `{ mode: "copy", dropDir: "../escape" }` 返回 400；请求前后配置均为 `resolve/.drops`，危险值没有写入内存或持久化。
- 非法 token 或附带任意 `path` 的 preview 请求返回 404；只传 `path` 的 open 请求返回 404。
- PDF `HEAD` 返回 200；`Range: bytes=0-9` 返回 206、长度 10 且带正确 `Content-Range`；非法 Range 返回 416；错误 session 返回 404。
- 文本预览返回 200，`Content-Type` 为 `text/plain; charset=utf-8`，并带 `no-store`、`nosniff` 和 sandbox CSP。
- DragView 改名重启后复验：非法 token、携带任意 `path` 的 preview 以及只传 `path` 的 open 均返回 404。

### 真实 DSH 布局验收

- DragView 改名部署后的当前复验环境为真实 DSH、视口 `1239×886`：1 张原生图片与 4 张文件卡片排成两行，卡片 top 为 `623/695`，`intersections=[]`，卡片区 `absolutePathLeak=false`。
- 改名后复验证据：同一证据目录下的 `hana-real-dragview-rename-restart-final.json` 与 `hana-real-dragview-rename-restart-final.png`。复验完成后已清空附件和草稿，当前页面为 clean 状态。
- 以下 `1919×988` 数据是改名前对**同一构建**完成的图片+文件+引用三层完整功能验收，作为完整组合布局证据保留：
- attachment slot：`x=726, y=483, width=778, height=330`，计算样式为 `display:flex; flex-direction:column; gap:8px`。
- native inner rail：`x=738, y=487, width=754, height=280`，`flex-wrap`，`gap=8px`。
- 同时存在 8 张 `280×64` 文件卡片和 1 张 `62×62` DSH 原生图片，共 4 行；文件卡片 top 依次为 `487/559/631/703`。
- 附件区域 bottom 为 `767`；引用行 `x=738, y=775, width=754, height=38`，与附件区域间距精确为 `8px`。交集检测结果为 `[]`，无重叠，绝对路径泄露为 `false`。
- 卡片圆角 `14px`、边框 `1px`、`min-width:220px`；移除按钮 `24×24`；卡片主体 `tabIndex=0`。
- 证据：`C:\Users\anzhaofeng\AppData\Local\azf-auto-dev-loop\manual-evidence\dsh-drag-file-20260824\hana-real-combined-multiline-restart-final.png` 与同名 `.json`。

### 真实预览与交互验收

- DragView 改名重启后已再次成功打开文本、PDF、视频和音频内部预览；视频与音频的 `readyState` 均为 `4`。
- 以下尺寸和交互数据来自改名前的同一构建完整验收：
- 文本预览对话框 `962×762`，位于视口内；`pre` 文本长度为 1384 个字符，内容区为 `960×634` 且 `overflow:auto`，未泄露绝对路径。
- PDF iframe 为 `960×634`。
- 视频控件 `readyState=4`、无错误，尺寸 `256×192`；音频控件 `readyState=4`、无错误，尺寸 `620×54`。
- 证据位于同一目录的 `hana-real-preview-{text,pdf,video,audio}-restart-final.{png,json}`。
- 卡片按 Enter 或 Space 均能打开预览；按 Escape 或点击遮罩关闭后，焦点均回到原附件卡片。
- 移除 JSON 卡片后附件数从 8 变为 7，没有打开 modal，草稿保持只有 side sentinel；已移除文本附件的旧 token 随后返回 404。
- Office 文件真实调用系统默认应用时曾启动新的 WINWORD 进程，并在验证后关闭该新进程；ZIP/BIN 点击安全交给 Windows 默认应用关联处理。
- side-chat export bridge 的自动化测试全部通过，并有此前真实事件桥验证结果支撑。

### 验收范围与剩余边界

- 真实页面证据包括改名后 `1239×886` 复验与此前同一构建的 dark `1919×988` 三层组合验收；light 主题与窄屏由 fixture 覆盖。不要把失败的 `narrow-final` 记录作为真实验收证据。
- Node 缺少可移植 `openat` 的同用户 TOCTOU 边界仍然存在；当前通过 realpath、lstat、身份与 open 复核缩小窗口。
- Office、压缩包和未知二进制文件最终由 Windows 默认应用关联负责，插件不保证目标系统一定安装了对应应用。
