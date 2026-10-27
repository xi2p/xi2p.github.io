# 开发接续记录

## 2026-10-27

初版开发时创建了每 30 分钟继续本对话的 heartbeat，ID `chiwa-dictation`；初版已部署并验证，该自动任务目前暂停。

已完成：

- 初上 24 课、初下 24 课、中上前 10 课的单词Ⅰ/Ⅱ，共 2,123 条；保留两册模拟试题的课号说明。
- 全部 2,123 个词条都有显式分配的单词例句、假名、中文与句中词形；已取消课级通用句子回退。维护源为 `data/example-sentences.json`。
- 独立静态应用、五十音、选课和课程映射、新学／复习引擎、点击拼词、可选 TTS、统计、错词再练、导出、清除设置。
- 首页分隔与小项目卡，Astro 开发挂载和构建复制，用户／开发者 README 及浏览器说明页。
- 15 项 Node 测试通过；Astro check 0 errors / 0 warnings（已有一个上游代码的 unused hint）。
- 本地 Astro 服务端口 4321，IAB 已验证桌面、390／320 像素窄屏的选课和五十音界面，无横向溢出。
- 完整新学、点击拼词、答案锁定、错词复习、提前结束、总结下载与清除设置已通过浏览器实测。
- 前台 IAB 使用 Microsoft 日语声音，听力题已触发实时 TTS 并完成播放；默认静音与切到后台停止声音已检查。
- Astro 构建、Pagefind、15 项测试及站点验证通过，原有 2 个分类、5 个分类分页、32 篇文章和 3 份原有学习资料 PDF 保持有效。
- 开发过程已分阶段提交；教材原件、OCR、下载缓存与截图均未提交，构建只复制运行文件。

## 本轮反馈修订与验收

- 移除本轮数量设置及截取逻辑；按课／随机均练习所有所选词条，旧缓存中的 count 忽略。
- 下一题按钮排在解析之前；Chiwa 小卡片仅选课首页显示，练习与总结隐藏，返回首页恢复。
- 逐课补写、复核 2,123 个词条的例句，覆盖率 100%；1,145 组例句记录，1,137 个不同句段。检查了语境、词义、阶段难度与假名读音。
- 新增源文件同步脚本与强制目标词形检查，并测试缺例句、不含目标词、伪造目标词形、两个「かける」词义与超过 30 词的完整会话。
- 本轮浏览器实测：初上 14＋15 课、单词Ⅰ＋Ⅱ的 70 个词完整进入新学／复习；五十音全部 208 项进入会话。按钮实际位于解析上方；首页／练习／总结的卡片显隐正确。
- 1280×900、390×844、320×740 布局检查，无横向溢出；本轮数据校验、源文件一致性、15 项测试、Astro check、完整构建、Pagefind 与站点验证通过。
- 本轮改动分阶段提交，最后推送 origin/master。对应部署结果与线上验收在本对话完成报告及 [GitHub Actions](https://github.com/xi2p/xi2p.github.io/actions/workflows/deploy.yml) 中核实。

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

`dictation/data/vocabulary.json` 是运行词库；词表字段直接维护于此。例句维护源为 `dictation/data/example-sentences.json`，编辑后用 `node dictation/scripts/update-examples.mjs` 同步，再运行 `--check` 与测试。`tmp/dictation/assemble_data.py`、`tmp/dictation/review/curate.py` 是一次性初始整理／注音脚本，重新运行会覆盖后续勘误和已复核的例句读音，**不要当作构建步骤重跑**。扫描原件保留在用户桌面，未复制入仓库。OCR、公开词表缓存、Python 词典与中间件、截图都在被忽略的 `tmp/`，不提交、不部署。

MinerU 最初被自动审批拒绝，之后用户明确授权外部 MinerU，已完成定点词表页 OCR。公开词表参考为 newwise 论坛 thread-299278 第 1—3 页（第 0—23 个帖为初上 1—24，第 24—47 为初下 26—49，第 48—57 为中上 1—10）及 tingroom 中级 3562—3571；保留源码中的来源链接。
