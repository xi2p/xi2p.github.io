# 开发接续记录

## 2026-10-27

已创建每 30 分钟继续本对话的 heartbeat，ID `chiwa-dictation`。用户休息期间自行处理技术选择；自动任务已静音。完成部署验证后停用任务。

已完成：

- 初上 24 课、初下 24 课、中上前 10 课的单词Ⅰ/Ⅱ，共 2,123 条；保留两册模拟试题的课号说明。
- 185 条词条有专属短句，所有 58 个词汇课另有配套短句与假名、中文。
- 独立静态应用、五十音、选课和课程映射、新学／复习引擎、点击拼词、可选 TTS、统计、错词再练、导出、清除设置。
- 首页分隔与小项目卡，Astro 开发挂载和构建复制，用户／开发者 README 及浏览器说明页。
- 12 项 Node 测试通过；Astro check 0 errors / 0 warnings（已有一个上游代码的 unused hint）。
- 本地 Astro 服务端口 4321，已在 IAB 成功打开并检查桌面初始布局，无控制台错误。

尚待：

1. 完成 SOURCES.md 与源数据最终抽查。
2. 浏览器验证选课、完整新学／复习、拼词、五十音、提前结束、导出与清除；测试 390／320 像素移动布局。
3. 构建、Pagefind、站点验证，整理提交。
4. 最终推送 origin/master，检查 Actions 和线上首页／dictation 页面，停用 heartbeat。

## 本机运行注意

PATH 默认 Node 为 20，工程要求 22.12+。使用：

```powershell
$env:PATH='C:\Users\xi2p\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;'+$env:PATH
$env:ASTRO_TELEMETRY_DISABLED='1'
node node_modules/astro/astro.js check
node node_modules/astro/astro.js build
node node_modules/pagefind/lib/runner/bin.cjs --site dist
node --test dictation/tests/engine.test.mjs
node scripts/verify-site.mjs
```

若 Pagefind 入口不同，先读 node_modules/pagefind/package.json。本机 pnpm shim 版本与项目的 packageManager 不同，会尝试重新安装；不要因此清空 node_modules，直接使用现有 Node 24 和已安装 CLI。CI 仍用锁定的 pnpm 9.14.4。

Git 在沙箱账户下需 `git -c safe.directory=G:/GithubPages/StationV2 ...`；提交／推送需合理权限升级，用户已授权分阶段提交、最终推送。

## 数据与临时目录

`dictation/data/vocabulary.json` 是当前最终整理的词库，后续直接编辑此文件。`tmp/dictation/assemble_data.py` 是一次性初始整理脚本，重新运行会覆盖后续勘误和专属例句，**不要当作构建步骤重跑**。扫描原件保留在用户桌面，未复制入仓库。OCR、公开词表缓存、Python 中间件、截图都在被忽略的 `tmp/`，不提交、不部署。

MinerU 最初被自动审批拒绝，之后用户明确授权外部 MinerU，已完成定点词表页 OCR。公开词表参考为 newwise 论坛 thread-299278 第 1—3 页（第 0—23 个帖为初上 1—24，第 24—47 为初下 26—49，第 48—57 为中上 1—10）及 tingroom 中级 3562—3571；保留源码中的来源链接。
