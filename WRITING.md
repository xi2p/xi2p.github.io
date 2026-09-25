# 博客写作与预览

迁移后的文章都在 `src/content/posts/`。日常更新只需要编辑 Markdown，不需要手写页面 HTML。

## 新建文章

在项目目录运行：

```powershell
pnpm new-post my-new-post
```

然后编辑生成的 `src/content/posts/my-new-post.md`。一篇文章可以从下面的模板开始：

```md
---
title: 文章标题
published: 2026-09-25
description: 一句简短摘要
image: ./cover.jpg
tags:
  - Galgame
  - 游戏记录
category: Galgame
draft: false
---

正文从这里开始。
```

如果文章带图片，推荐把文章和图片放进同一个目录：

```text
src/content/posts/my-new-post/
├── index.md
├── cover.jpg
└── screenshot-1.jpg
```

在 `index.md` 里直接使用普通 Markdown：

```md
![图片说明](./screenshot-1.jpg)
```

把 `draft` 改为 `true`，文章就不会出现在正式站点中。

## 本地预览

首次使用或依赖有变化时：

```powershell
pnpm install
```

启动实时预览：

```powershell
pnpm dev
```

浏览器打开终端里显示的本地地址。保存 Markdown 后页面会自动刷新。

发布前检查：

```powershell
pnpm check
pnpm build
```

## 发布

确认 GitHub 仓库的 Pages 来源设为 **GitHub Actions**。以后把修改推送到 `master` 分支，`.github/workflows/deploy.yml` 会自动构建并发布到 `https://xi2p.github.io/`。

## 重新执行旧站迁移

迁移脚本保留在 `scripts/migrate-jekyll-content.mjs`。如确实需要从旧 Jekyll 目录重新生成全部文章，可以运行：

```powershell
pnpm migrate:jekyll -- "G:\GithubPages\MyBlog"
```

注意：该命令会重新生成 `src/content/posts/`，日常写作不要运行它。
