import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { renderReadme } from "../dictation/scripts/render-readme.mjs";

const root = process.cwd();
const dist = path.join(root, "dist");
const read = (file) => readFileSync(file, "utf8");
const main = (html) => {
	const match = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/);
	assert.ok(match, "Page must have main content");
	return match[1];
};
const links = (html) =>
	[...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((match) => match[1]);
const localFile = (url) =>
	path.join(dist, decodeURIComponent(url).replace(/^\//, ""), "index.html");
const hash = (file) =>
	createHash("sha256").update(readFileSync(file)).digest("hex");
function walk(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const file = path.join(directory, entry.name);
		return entry.isDirectory() ? walk(file) : [file];
	});
}

const home = main(read(path.join(dist, "index.html")));
assert.ok(
	!home.includes("post-card"),
	"Homepage must contain categories, never article cards",
);
assert.ok(!home.includes("<time"), "Category cards must not show dates");
assert.ok(
	!home.includes(" 分钟"),
	"Category cards must not show reading times",
);
const cards = home
	.split(/(?=<div\b[^>]*class="[^"]*\bcategory-card\b)/g)
	.slice(1);
assert.ok(cards.length > 0, "Homepage must contain category cards");
const allPosts = new Set();
const categoryPages = walk(path.join(dist, "categories")).filter((file) =>
	file.endsWith("index.html"),
);

for (const card of cards) {
	const categoryLinks = [
		...new Set(links(card).filter((url) => url.startsWith("/categories/"))),
	];
	assert.equal(
		categoryLinks.length,
		1,
		"Each category card must have one destination",
	);
	const categoryUrl = categoryLinks[0];
	assert.ok(
		existsSync(localFile(categoryUrl)),
		`Missing category: ${categoryUrl}`,
	);
	assert.ok(/<img\b/.test(card), `Category needs a cover: ${categoryUrl}`);
	const expectedCount = Number(card.match(/(\d+) 篇文章/)?.[1]);
	assert.ok(
		expectedCount > 0,
		`Category needs an article count: ${categoryUrl}`,
	);
	const categoryDirectory = path.dirname(localFile(categoryUrl));
	const pages = categoryPages.filter((file) =>
		file.startsWith(`${categoryDirectory}${path.sep}`),
	);
	const posts = new Set();
	for (const file of pages) {
		const content = main(read(file));
		const postLinks = [
			...new Set(links(content).filter((url) => url.startsWith("/posts/"))),
		];
		assert.equal(
			(content.match(/class="[^"]*\bpost-card\b/g) || []).length,
			postLinks.length,
		);
		for (const postUrl of postLinks) {
			assert.ok(!posts.has(postUrl), `Post repeated across pages: ${postUrl}`);
			assert.ok(
				!allPosts.has(postUrl),
				`Post repeated across categories: ${postUrl}`,
			);
			const postFile = localFile(postUrl);
			assert.ok(existsSync(postFile), `Missing article: ${postUrl}`);
			const postCategories = [
				...new Set(
					links(main(read(postFile))).filter((url) =>
						url.startsWith("/categories/"),
					),
				),
			];
			assert.deepEqual(
				postCategories,
				[categoryUrl],
				`Incorrect category for ${postUrl}`,
			);
			posts.add(postUrl);
			allPosts.add(postUrl);
		}
		for (const pageUrl of links(content).filter((url) =>
			url.startsWith("/categories/"),
		)) {
			assert.ok(
				pageUrl.startsWith(categoryUrl),
				`Pagination left its category: ${pageUrl}`,
			);
			assert.ok(
				existsSync(localFile(pageUrl)),
				`Broken pagination: ${pageUrl}`,
			);
		}
	}
	assert.equal(posts.size, expectedCount, `Incorrect count for ${categoryUrl}`);
}

let attachments = 0;
for (const postUrl of allPosts) {
	const content = main(read(localFile(postUrl)));
	for (const pdf of new Set(
		links(content).filter((url) => url.startsWith("/pdfs/")),
	)) {
		const source = path.join(root, "public", pdf.slice(1));
		const output = path.join(dist, pdf.slice(1));
		assert.ok(existsSync(output), `Missing PDF: ${pdf}`);
		assert.equal(
			hash(source),
			hash(output),
			`PDF changed during build: ${pdf}`,
		);
		assert.ok(
			content.includes(`data="${pdf}#view=FitH"`),
			`Missing PDF preview: ${postUrl}`,
		);
		assert.ok(
			/download="[^"]+\.pdf"/.test(content),
			`Missing PDF download: ${postUrl}`,
		);
		attachments++;
	}
}

assert.ok(
	existsSync(path.join(dist, "pagefind", "pagefind.js")),
	"Search index must be built",
);
assert.ok(existsSync(path.join(dist, "rss.xml")), "RSS must be built");
assert.equal(
	(home.match(/class="[^"]*\bproject-card\b/g) || []).length,
	1,
	"Homepage must contain one project card",
);
assert.ok(
	home.includes('href="/dictation/" data-no-swup'),
	"Project must navigate outside the blog shell",
);
for (const file of [
	"index.html",
	"styles.css",
	"app.js",
	"engine.js",
	"kana.js",
	"data/vocabulary.json",
	"assets/chiwa.webp",
	"assets/favicon.svg",
]) {
	assert.equal(
		hash(path.join(root, "dictation", file)),
		hash(path.join(dist, "dictation", file)),
		`Dictation runtime changed during build: ${file}`,
	);
}
assert.equal(
	read(path.join(dist, "dictation", "README.html")),
	await renderReadme(),
	"Built documentation must match source",
);
assert.ok(
	!walk(path.join(dist, "dictation")).some((file) =>
		/\.(pdf|py|md|test\.mjs)$/i.test(file),
	),
	"Do not deploy scans or development files",
);
assert.ok(
	existsSync(path.join(dist, "sitemap-index.xml")),
	"Sitemap must be built",
);
console.log(
	`Verified ${cards.length} categories, ${categoryPages.length} category pages, ${allPosts.size} articles and ${attachments} PDFs.`,
);
