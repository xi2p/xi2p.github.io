import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";

export async function renderReadme() {
	const md = new MarkdownIt({ html: false, linkify: true });
	md.renderer.rules.heading_open = (tokens, index, options, env, self) => {
		const title = tokens[index + 1]?.content || "";
		tokens[index].attrSet("id", title.toLowerCase().replace(/\s+/g, "-"));
		return self.renderToken(tokens, index, options);
	};
	const content = md.render(
		await readFile(new URL("../README.md", import.meta.url), "utf8"),
	);
	return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>使用说明 · Chiwa Dictation</title><link rel="stylesheet" href="./styles.css"><link rel="icon" href="./assets/favicon.svg" type="image/svg+xml"></head><body><header class="site-header wrap"><a class="brand" href="./"><span class="brand-mark" lang="ja">ち</span><span>Chiwa Dictation<small>使用说明与开发文档</small></span></a><a class="back-site" href="./">返回默写器 ↗</a></header><main class="wrap doc">${content}</main><footer class="wrap site-footer"><a href="./">← 返回默写器</a></footer></body></html>`;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	await writeFile(
		new URL("../README.html", import.meta.url),
		await renderReadme(),
	);
	console.log("README generated in dictation/README.html");
}
