# DragView — dsh-dragview

**DragView** 是 DSH 的拖拽文件与预览插件：把本地文件拖进聊天界面，按配置**复制进工作区**或**只解析真实路径**，在输入框中渲染成 **Codex** 风格附件卡片，并安全预览或用系统默认应用打开——**不把路径显示给用户**。

GitHub 仓库名为 `DragView`，npm 与 DSH 包名为 `dsh-dragview`；品牌与 `drag` 搜索词同时保留，便于在 GitHub 和 DSH 插件市场检索。

## 两种模式（设置里切换，重启生效）

| 模式 | 行为 | 适合场景 |
|---|---|---|
| `resolve`（默认） | 拖入后解析文件的真实绝对路径，**不复制、不动原文件** | 引用工作区已有文件；不破坏文件与邻居依赖的关系 |
| `copy` | 松手即把文件字节复制进 `<工作区>/<dropDir>/`（默认 `.drops`），返回副本路径 | 拖入工作区外的任意文件，让模型能稳定读取 |

图片（image/*）**不经过本插件**，保留平台原生附件通道（缩略图、预览、历史渲染）。

## 交互流程
<img width="1920" height="1032" alt="image" src="https://github.com/user-attachments/assets/b1fc02a9-61f9-40b1-a372-d387280081ae" />

1. 从资源管理器拖文件到页面任意位置 → 全屏遮罩提示（按模式显示「复制」或「引用」文案）。
2. 松手：非图片文件进入解析/复制管线；图片走原生通道（混合拖拽时图片自动重派发给原生）。
3. 输入框附件栏出现约 280×64 px 的 **Codex 风格附件卡片**：左侧类型方块，中间文件名与「类型 · 大小」双行信息，右侧圆形移除按钮。卡片和原生图片共同换行，side-chat 引用独占下方一行。
4. 点击卡片或按 Enter/Space：PDF、文本/代码、视频和音频在 DSH 内预览；Office、压缩包与未知文件使用系统默认应用打开。移除按钮不会触发上述操作。
5. 发送时，消息内容在用户文本前追加每行一个 `@"<绝对路径>"` 的文件引用（纯文本模型可读），但绝对路径不会进入附件 DOM、标题或浏览器日志。
6. 发送成功才清空卡片并撤销临时 token；失败保留，便于重试。

## 路径解析策略（resolve 模式）

浏览器出于安全不会把真实路径交给网页，插件按顺序定位：

1. **当前会话的注册工作区** → 其他注册工作区（workspace 根由 host 权威解析，客户端不能指定任意路径）。
2. **系统目录**：桌面 / 文档 / 下载。
3. **浅扫描**：深度 1–3 层（每根目录最多展开 4096 个子目录）。
4. **系统索引**：Windows 检测到 Everything CLI（`es.exe`）才启用，否则用 PowerShell 递归兜底；macOS Spotlight；Linux plocate/locate。
5. **有界递归**：深度 12、最多 2 万目录项、最多 100 候选。

候选按名称+大小去重，按 `|mtime − lastModified|` 排序；即使只有一个 metadata 候选也必须经过内容证明。小于等于 `3 × 64 KB` 时 sample 已覆盖全文件；更大文件的 sample 匹配后必须再做全量指纹。候选绝对路径只保存在 host 的短期 resolution 中，浏览器只持有不透明 `resolutionId/choiceId`；仍分不清时选择器只显示安全编号。失败会弹出提示，不静默。

## 文件能力与安全边界

- host 为每个解析/复制成功的文件建立短期、不透明的 `fileId`；预览、系统打开与撤销接口只接受该 ID。
- 每次访问都重新核对 `realpath`、文件类型、大小、mtime、设备号与 inode；过期、撤销、变化或非法 token 均拒绝。
- `copy` 只能写入当前 session 在 workspace registry 中权威绑定的工作区。`dropDir` 禁止绝对路径、`..`、符号链接/junction 与前缀碰撞逃逸。
- side-chat host 先把 Markdown 安全保存到可信 exportRoot，并根据 child session 的可信记录推导 parent session，再调用 `dshDragFileHost`。drag-file host 验证来源仍位于该 exportRoot：`resolve` 直接为原导出文件签发 token，**不创建工作区副本**；只有 `copy` 才受限读取最多 4 MiB，并安全复制到 parent session 权威工作区的 `.dsh-side-chat-exports` 后注册。浏览器事件只接收已签发的 opaque token 与显示/发送元数据，不接收路径或 Markdown 来换取权限；未安装 drag-file 时，side-chat 仍以自身保存的 `savedPath` 创建 DSH 原生 reference chip。
- 系统打开使用参数数组与 `shell: false`；不拼接 shell 命令。
- PDF/音视频与文本预览都从经过 token、session、workspace 和文件身份复核后打开的 FileHandle 读取；PDF/音视频响应为 `inline`、`no-store`、`nosniff`，支持单段 Range（206/416）。文本文件最大 10 MB，最多读取并显示前 1 MB；无论原扩展名/MIME 是 HTML、XML、代码还是 Markdown，文本预览响应均强制 `text/plain` 并附加 sandbox CSP，避免主动内容执行。
- 系统打开同样先取得并复核 FileHandle，关闭句柄后再把已验证路径交给 Explorer/操作系统；这一交接点仍有无法完全消除的极窄 TOCTOU 残余，不能宣称 system-open 与路径替换完全无竞态。
- 写入流程逐层拒绝 symlink/junction，并在 `wx` 创建后重新 realpath 验证目标仍位于 canonical workspace。受 Node 跨平台 API 限制，同权限恶意进程在验证与创建之间替换目录的极窄竞态不能被描述为完全消除，详见交接文档。

## 安装（开发机手动同步）

```bash
npm run build          # 产出 host/client bundle 与安全、指纹、rail 测试产物
npm run check
npm test               # token/路径约束/Range/MIME/open argv/side 内容桥回归
```

把包同步到 web profile：

```text
~/.hanako/plugin-data/dsh-hanako/dsh-home/profiles/web/node_modules/dsh-dragview/
  ├── src/            # 构建产物
  ├── package.json
  └── cordis.patch.yml
```

并在 `profiles/web/cordis.patch.yml` 追加：

```yaml
- insert:
    - id: drag-file
      name: dsh-dragview
```

客户端刷新页面即生效；host 端改动需重启 `dsh web`。

发布到 npm 后可直接 `dsh plugin add dsh-dragview`（dsh 字段 + `dsh.bundle.patch` 已声明）。

> 注：npm 上的 `dsh-drag-file` 是其他维护者的既有包，不是 DragView；请使用完整包名 `dsh-dragview`。GitHub 仓库改名后通常会为旧 URL 保留跳转，但 npm 包名不支持别名。

## 兼容性标识

为避免旧配置和 side-chat 集成失效，改名后仍保留以下稳定接口：

- Cordis entry 与设置分区 ID：`drag-file`；
- side-chat 事件：`dsh-drag-file:add-pill`；
- host capability：`dshDragFileHost`；
- host 路由前缀：`/file-drop`；
- 已有 `dsh-drag-file-*` DOM/CSS/data/header 标识。

这些是有意保留的协议名，不表示仍需安装旧 npm 包。

## 设置

DSH 设置里新增 `drag-file` 分区：

- `mode`：`resolve`（默认）| `copy`
- `dropDir`：复制目标相对工作区的文件夹名，默认 `.drops`

## 维护

- `src/**` 是源码（TypeScript）；`src/*.js` / `src/client.js` 是构建产物，改动源码后必须 `npm run build`。
- host 路由：`/file-drop/config`、`resolve`、`copy`、`preview`、`text-preview`、`open`、`revoke`；side-chat 导出使用 `dshDragFileHost` 的 host-to-host capability，不开放浏览器注册路由（见 `src/index.ts`）。
- 客户端：拖拽监听、MIME 分流、胶囊队列、sendSession 补丁（见 `src/client/index.ts`）。

## 图标策略

常用类型（PDF/DOC/XLS/PPT/压缩/视频/音频/代码/文本）用 Bootstrap Icons 的内嵌 SVG 图标；其余类型**直接把扩展名渲染成图标**（小圆角方块 + 扩展名文字），不需要为任何新扩展名寻找图标资产。见 `src/client/icons.ts`。

## 致谢

- 文件类型图标 ← [Bootstrap Icons](https://icons.getbootstrap.com)（MIT）
- 路径解析/定位器、平台搜索、指纹、拖拽遮罩、选择器 ← [omdsh-dev/dsh-drag-and-drop](https://github.com/omdsh-dev/dsh-drag-and-drop)（BSD-3-Clause）
- sendSession 补丁模式、复制路由、胶囊栏 DOM 注入、混合拖拽图片重派发 ← [loudMore/dsh-drop-to-path](https://github.com/loudMore/dsh-drop-to-path)（MIT）
- 构建管线与插件骨架 ← [anzhaohao/dsh-side-chat-plus-plus](https://github.com/anzhaohao/dsh-side-chat-plus-plus)（MIT）

详见 `NOTICE`。
