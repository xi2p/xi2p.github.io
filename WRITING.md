# 分类首页、写作与部署

站点使用 Fuwari / Astro，在原主题上增加分类首页。首页显示有文章的分类；点击分类后，以原来的文章卡片分页展示文章。每页 8 篇。

## 项目结构

```text
src/
├── content/
│   ├── config.ts                       # 文章、分类的字段定义
│   ├── categories/                     # 首页分类卡片的标题、简介、封面和排序
│   │   ├── galgame.md
│   │   └── study.md
│   └── posts/                          # 文章正文与配图
│       └── japanese-beginner-notes/
│           └── index.md
├── assets/images/categories/           # 分类封面
├── components/
│   ├── CardFrame.astro                 # 分类与文章共用的卡片外观
│   ├── CategoryCard.astro              # 分类名、简介、文章数量
│   ├── PostCard.astro                  # 文章日期、标签等元数据
│   └── PdfAttachment.astro             # PDF 预览、打开与下载
├── pages/
│   ├── index.astro                     # 分类首页
│   ├── categories/[category]/[...page].astro
│   └── posts/[...slug].astro
└── utils/content-utils.ts              # 分类聚合、计数、草稿过滤
public/pdfs/                            # 原始 PDF，发布时原样复制
scripts/verify-site.mjs                  # 构建产物回归检查
.github/workflows/
├── build.yml                           # PR 检查
└── deploy.yml                          # master 检查并发布
```

## 新建分类

1. 在 `src/content/categories/` 新建一个 Markdown 文件，例如 `reading.md`。
2. 写入以下字段：

```yaml
---
name: 阅读
title: 在书页之间停留
description: 阅读记录、摘抄，以及读完之后的一点感想。
image: ../../assets/images/categories/reading.jpg
order: 30
---
```

- `name` 必须与文章的 `category` 相同；它是分类名。
- `title` 是首页卡片的大标题，可以与分类名完全不同。
- `description` 是卡片简介；`image` 是封面，相对于该分类 Markdown 文件。
- 封面放到 `src/assets/images/categories/`，也可使用 `public/` 中以 `/` 开头的图片路径。
- `order` 越小越靠前；默认 100。
- 分类按文章的 `category` 自动聚合，不使用 `tags`。没有已发布文章的分类不会出现在正式首页。
- 仅给文章填写一个新 `category` 也能自动生成分类入口，暂用默认标题、简介和最新文章封面；要自定义完整外观，再添加上述分类文件。
- 分类名忽略首尾空格和英文字母大小写。分类网址由名称生成，例如 `/categories/galgame/`、`/categories/学习资料/`；文件名不决定网址。分类名称中请避免 `/`、`?`、`#` 等 URL 分隔字符。

## 新建文章

运行：

```powershell
pnpm new-post my-new-post/index
```

编辑 `src/content/posts/my-new-post/index.md`：

```yaml
---
title: 文章标题
published: 2026-10-24
description: 一句简短摘要
image: ./cover.jpg
category: Galgame
draft: false
---
```

正文写在第二个 `---` 后。将 `category` 改为 `学习资料` 或你新建的分类名称，即可自动归类、更新首页数量和分类分页。

`tags` 是可选字段，不写就没有标签。若需要标签，可以加 `tags: [游戏记录]`；分类仍由 `category` 决定。

图片建议与文章放在一起，用 `![说明](./screenshot.jpg)` 引用。将 `draft` 改为 `true` 可隐藏正式文章。开发预览会显示草稿，正式构建会排除草稿及只有草稿的分类。

## 新增 PDF 文章

1. 将 PDF 放入 `public/pdfs/`，建议使用英文文件名，例如 `my-notes.pdf`。
2. 按上述方式创建文章，并在字段中增加：

```yaml
category: 学习资料
pdf: /pdfs/my-notes.pdf
```

不需要在正文手写 iframe 或下载按钮，文章模板会自动提供 PDF 预览、新窗口阅读和下载。移动浏览器若不支持内嵌 PDF，可直接打开或下载原文件。

现有三份资料的文件在：

- `public/pdfs/japanese-beginner-notes.pdf`
- `public/pdfs/japanese-intermediate-notes.pdf`
- `public/pdfs/linear-algebra-summary.pdf`

## 预览、检查与发布

项目推荐使用 Node.js 24（最低 22.12）和 `package.json` 指定的 pnpm 9.14.4。首次使用或依赖有变化时：

```powershell
corepack pnpm@9.14.4 install --frozen-lockfile
```

平时使用：

```powershell
pnpm dev
```

发布前检查：

```powershell
pnpm check
pnpm build
pnpm verify
```

`verify` 检查首页只有分类卡片、封面与数量齐全、文章归属正确、分类分页不串页、PDF 完整复制并有预览与下载入口，以及搜索、RSS、站点地图已生成。

将修改提交并推送到 `master`，GitHub Actions 会执行上述三步并发布到 `https://xi2p.github.io/`。PR 到 `master` 或 `main` 会运行相同检查，不会发布。Pages 的来源保持 **GitHub Actions**。

旧首页 `/2/`、`/3/`、`/4/` 会跳到对应的 Galgame 分类页。原文章地址及旧站重定向继续保留，旧的 `/archive/?category=...` 归档筛选链接也可使用。

## 主题和 CI 的维护

保留 Fuwari / Astro 框架与依赖管理。此次定制集中在分类集合、共用卡片、首页、分类路由和 PDF 组件，不需要放弃上游更新。合并上游时检查这些定制文件，并运行检查、构建和 `verify`。

原先只监听 `main`、使用不同 Node 版本的上游构建流程，已替换为与部署一致的检查。独立的上游 Biome 工作流已整合移除，避免在本仓库重复执行不匹配的检查；需要本地格式整理时仍可使用原有 `pnpm format`、`pnpm lint`。

迁移脚本 `pnpm migrate:jekyll` 仅用于从旧站重新导入，会重写迁移文章，日常写作无需运行。
