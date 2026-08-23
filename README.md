# dsh-drag-file

Codex 式拖拽文件插件：把本地文件拖进 DSH 聊天界面，按配置**复制进工作区**或**只解析真实路径**，在输入框与消息历史里都渲染成胶囊卡片——**不把路径当作文本显示**。

## 两种模式（设置里切换，重启生效）

| 模式 | 行为 | 适合场景 |
|---|---|---|
| `resolve`（默认） | 拖入后解析文件的真实绝对路径，**不复制、不动原文件** | 引用工作区已有文件；不破坏文件与邻居依赖的关系 |
| `copy` | 松手即把文件字节复制进 `<工作区>/<dropDir>/`（默认 `.drops`），返回副本路径 | 拖入工作区外的任意文件，让模型能稳定读取 |

图片（image/*）**不经过本插件**，保留平台原生附件通道（缩略图、预览、历史渲染）。

## 交互流程

1. 从资源管理器拖文件到页面任意位置 → 全屏遮罩提示（按模式显示「复制」或「引用」文案）。
2. 松手：非图片文件进入解析/复制管线；图片走原生通道（混合拖拽时图片自动重派发给原生）。
3. 输入框附件栏出现 **Codex 风格胶囊**：文件类型图标（常用类型用 Bootstrap Icons 图标，其余直接用扩展名文字充当图标）+ 文件名 + 大小 + 移除按钮（✕），不显示路径。
4. 发送时，消息内容在用户文本前追加每行一个 `@"<绝对路径>"` 的文件引用（纯文本模型可读），历史消息由平台原生渲染成 refChip 文件胶囊（仅显示文件名，路径在悬停 title 里）。
5. 发送成功才清空胶囊；失败保留，便于重试。

## 路径解析策略（resolve 模式）

浏览器出于安全不会把真实路径交给网页，插件按顺序定位：

1. **直读快路径**：拖拽 payload 里的 `file://` URI（资源管理器拖入时 Chromium 通常直接携带）。
2. **当前工作区** → 其他注册工作区。
3. **系统目录**：桌面 / 文档 / 下载。
4. **浅扫描**：深度 1–3 层（每根目录最多展开 4096 个子目录）。
5. **系统索引**：Windows 检测到 Everything CLI（`es.exe`）才启用，否则用 PowerShell 递归兜底；macOS Spotlight；Linux plocate/locate。
6. **有界递归**：深度 12、最多 2 万目录项、最多 100 候选。

候选按 名称+大小 去重，按 `|mtime − lastModified|` 排序取最优；多候选进入 **采样指纹（头/中/尾 64KB SHA-256）→ 全量指纹** 两级消歧；仍分不清时弹选择器让你选。失败会弹 toast 提示，不静默。

## 安装（开发机手动同步）

```bash
npm run build          # 产出 src/index.js（host）+ src/client.js（浏览器 bundle）
```

把包同步到 web profile：

```text
~/.hanako/plugin-data/dsh-hanako/dsh-home/profiles/web/node_modules/dsh-drag-file/
  ├── src/            # 构建产物
  ├── package.json
  └── cordis.patch.yml
```

并在 `profiles/web/cordis.patch.yml` 追加：

```yaml
- insert:
    - id: drag-file
      name: dsh-drag-file
```

客户端刷新页面即生效；host 端改动需重启 `dsh web`。

发布到 npm 后可直接 `dsh plugin add dsh-drag-file`（dsh 字段 + `dsh.bundle.patch` 已声明）。

## 设置

DSH 设置里新增 `drag-file` 分区：

- `mode`：`resolve`（默认）| `copy`
- `dropDir`：复制目标相对工作区的文件夹名，默认 `.drops`

## 维护

- `src/**` 是源码（TypeScript）；`src/*.js` / `src/client.js` 是构建产物，改动源码后必须 `npm run build`。
- host 路由：`/file-drop/config`、`/file-drop/resolve`、`/file-drop/copy`（见 `src/index.ts`）。
- 客户端：拖拽监听、MIME 分流、胶囊队列、sendSession 补丁（见 `src/client/index.ts`）。

## 图标策略

常用类型（PDF/DOC/XLS/PPT/压缩/视频/音频/代码/文本）用 Bootstrap Icons 的内嵌 SVG 图标；其余类型**直接把扩展名渲染成图标**（小圆角方块 + 扩展名文字），不需要为任何新扩展名寻找图标资产。见 `src/client/icons.ts`。

## 致谢

- 文件类型图标 ← [Bootstrap Icons](https://icons.getbootstrap.com)（MIT）
- 路径解析/定位器、平台搜索、指纹、file:// URI 解析、拖拽遮罩、选择器 ← [omdsh-dev/dsh-drag-and-drop](https://github.com/omdsh-dev/dsh-drag-and-drop)（BSD-3-Clause）
- sendSession 补丁模式、复制路由、胶囊栏 DOM 注入、混合拖拽图片重派发 ← [loudMore/dsh-drop-to-path](https://github.com/loudMore/dsh-drop-to-path)（MIT）
- 构建管线与插件骨架 ← [anzhaohao/dsh-side-chat-plus-plus](https://github.com/anzhaohao/dsh-side-chat-plus-plus)（MIT）

详见 `NOTICE`。
