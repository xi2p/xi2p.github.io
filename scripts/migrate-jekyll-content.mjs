import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const sourceRoot = path.resolve(process.argv[2] ?? "G:/GithubPages/MyBlog");
const postsRoot = path.join(projectRoot, "src", "content", "posts");
const publicRoot = path.join(projectRoot, "public");

const packageJson = JSON.parse(
	fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
);
if (packageJson.name !== "fuwari") {
	throw new Error(`Refusing to migrate outside a Fuwari project: ${projectRoot}`);
}
if (!fs.existsSync(path.join(sourceRoot, "_posts"))) {
	throw new Error(`Jekyll posts directory not found: ${sourceRoot}`);
}
if (!postsRoot.startsWith(projectRoot + path.sep)) {
	throw new Error(`Unsafe target path: ${postsRoot}`);
}

function parseFrontmatter(raw) {
	const normalized = raw.replace(/\r\n/g, "\n");
	const match = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
	if (!match) return { data: {}, body: normalized };

	const data = {};
	for (const line of match[1].split("\n")) {
		const separator = line.indexOf(":");
		if (separator < 0) continue;
		const key = line.slice(0, separator).trim();
		let value = line.slice(separator + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		data[key] = value;
	}
	return { data, body: normalized.slice(match[0].length) };
}

function markdownDescription(body) {
	for (const originalLine of body.split("\n")) {
		const line = originalLine.trim();
		if (
			!line ||
			line === "---" ||
			line.startsWith("!") ||
			line.startsWith(">") ||
			line.startsWith("#")
		) {
			continue;
		}
		const plain = line
			.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
			.replace(/[*_`~]/g, "")
			.replace(/<[^>]+>/g, "")
			.trim();
		if (!plain) continue;
		return plain.length > 110 ? `${plain.slice(0, 107)}…` : plain;
	}
	return "";
}

function cleanBody(body, coverFile) {
	let imageIndex = 0;
	let coverRemoved = false;
	let result = body.replace(/\r\n/g, "\n");

	result = result.replace(
		/<div\s+align\s*=\s*center[^>]*>\s*<img\s+src\s*=\s*["']\s*([^"']+)["'][^>]*\/?\s*>\s*<\/div>/gi,
		(_match, source) => {
			const filename = path.posix.basename(source.trim());
			if (!coverRemoved && filename === coverFile) {
				coverRemoved = true;
				return "";
			}
			imageIndex += 1;
			return `![文章图片 ${imageIndex}](./${filename})`;
		},
	);

	result = result.replace(
		/!\[([^\]]*)\]\(\{\{\s*site\.url\s*\}\}\/assets\/images\/([^)]+)\)/gi,
		(_match, alt, source) => `![${alt || "文章图片"}](./${path.posix.basename(source)})`,
	);

	result = result.replace(
		/<(?:div\s+align\s*=\s*center[^>]*|center)>([\s\S]*?)<\/(?:div|center)>/gi,
		(_match, content) => `> *${content.replace(/<[^>]+>/g, "").trim()}*`,
	);
	result = result.replace(
		/<div\s+style\s*=\s*["']text-align\s*:\s*right["'][^>]*>([\s\S]*?)<\/div>/gi,
		(_match, content) => `> — ${content.replace(/<[^>]+>/g, "").trim()}`,
	);

	return result.replace(/\n{3,}/g, "\n\n").trim();
}

function postMetadata(title, draft) {
	if (title.startsWith("Galgame記録")) {
		return { category: "Galgame", tags: ["Galgame", "游戏记录"] };
	}
	if (title.includes("MOTIS")) {
		return { category: "技术", tags: ["MOTIS", "技术"] };
	}
	return {
		category: draft ? "草稿" : "随笔",
		tags: draft ? ["草稿"] : ["随笔"],
	};
}

function normalizeSlug(value) {
	return value
		.normalize("NFKC")
		.toLocaleLowerCase("zh-CN")
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-|-$/g, "");
}

function astroSlug(value) {
	return value
		.normalize("NFKC")
		.toLocaleLowerCase("zh-CN")
		.replace(/[^\p{L}\p{N}_-]+/gu, "");
}

function copyDirectory(source, target) {
	if (!fs.existsSync(source)) return;
	fs.cpSync(source, target, { recursive: true });
}

for (const entry of fs.readdirSync(postsRoot, { withFileTypes: true })) {
	const target = path.resolve(postsRoot, entry.name);
	if (!target.startsWith(path.resolve(postsRoot) + path.sep)) {
		throw new Error(`Unsafe cleanup target: ${target}`);
	}
	fs.rmSync(target, { recursive: true, force: true });
}

const migrated = [];
const sources = [
	{ directory: path.join(sourceRoot, "_posts"), draft: false },
	{ directory: path.join(sourceRoot, "hidePosts"), draft: true },
];

for (const source of sources) {
	if (!fs.existsSync(source.directory)) continue;
	for (const filename of fs
		.readdirSync(source.directory)
		.filter((name) => name.toLowerCase().endsWith(".md"))
		.sort()) {
		const dateMatch = filename.match(/^(\d{4})-(\d{1,2})-(\d{1,2})-(.+)\.md$/u);
		if (!dateMatch) {
			throw new Error(`Unsupported Jekyll post filename: ${filename}`);
		}
		const [, year, month, day, slug] = dateMatch;
		const published = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
		const raw = fs.readFileSync(path.join(source.directory, filename), "utf8");
		const { data, body } = parseFrontmatter(raw);
		const title = data.title || slug;
		const coverPath = (data.excerpt_image || "").replace(/^\s+/, "");
		const coverFile = coverPath ? path.posix.basename(coverPath) : "";
		const assetRelative = coverPath.match(/^\/assets\/images\/(.+)\/[^/]+$/u)?.[1];
		const outputDirectory = path.join(postsRoot, slug);
		fs.mkdirSync(outputDirectory, { recursive: true });

		if (assetRelative) {
			copyDirectory(
				path.join(sourceRoot, "assets", "images", ...assetRelative.split("/")),
				outputDirectory,
			);
		}

		const cleanedBody = cleanBody(body, coverFile);
		const description = markdownDescription(cleanedBody);
		const { category, tags } = postMetadata(title, source.draft);
		const frontmatter = [
			"---",
			`title: ${JSON.stringify(title)}`,
			`published: ${published}`,
			`description: ${JSON.stringify(description)}`,
			`image: ${JSON.stringify(coverFile ? `./${coverFile}` : "")}`,
			`tags: ${JSON.stringify(tags)}`,
			`category: ${JSON.stringify(category)}`,
			`draft: ${source.draft}`,
			"---",
			"",
		].join("\n");
		fs.writeFileSync(
			path.join(outputDirectory, "index.md"),
			`${frontmatter}${cleanedBody}\n`,
			"utf8",
		);
		migrated.push({
			date: published,
			draft: source.draft,
			slug,
			normalizedSlug: normalizeSlug(slug),
			title,
		});
	}
}

const datedOutputRoot = path.join(sourceRoot, "_site");
let redirects = 0;
if (fs.existsSync(datedOutputRoot)) {
	for (const yearEntry of fs.readdirSync(datedOutputRoot, { withFileTypes: true })) {
		if (!yearEntry.isDirectory() || !/^20\d{2}$/.test(yearEntry.name)) continue;
		const yearDirectory = path.join(datedOutputRoot, yearEntry.name);
		for (const monthEntry of fs.readdirSync(yearDirectory, { withFileTypes: true })) {
			if (!monthEntry.isDirectory() || !/^\d{2}$/.test(monthEntry.name)) continue;
			const monthDirectory = path.join(yearDirectory, monthEntry.name);
			for (const dayEntry of fs.readdirSync(monthDirectory, { withFileTypes: true })) {
				if (!dayEntry.isDirectory() || !/^\d{2}$/.test(dayEntry.name)) continue;
				const date = `${yearEntry.name}-${monthEntry.name}-${dayEntry.name}`;
				const candidates = migrated.filter((post) => post.date === date && !post.draft);
				for (const htmlFile of fs
					.readdirSync(path.join(monthDirectory, dayEntry.name))
					.filter((name) => name.endsWith(".html"))) {
					const oldSlug = htmlFile.slice(0, -5);
					const normalizedOldSlug = normalizeSlug(oldSlug);
					const post =
						candidates.find((candidate) => candidate.normalizedSlug === normalizedOldSlug) ??
						(candidates.length === 1 ? candidates[0] : undefined);
					if (!post) continue;
					const targetUrl = `/posts/${encodeURI(astroSlug(post.slug))}/`;
					const redirectDirectory = path.join(
						publicRoot,
						yearEntry.name,
						monthEntry.name,
						dayEntry.name,
					);
					fs.mkdirSync(redirectDirectory, { recursive: true });
					fs.writeFileSync(
						path.join(redirectDirectory, htmlFile),
						`<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta http-equiv="refresh" content="0; url=${targetUrl}">\n<link rel="canonical" href="https://xi2p.github.io${targetUrl}">\n<title>正在前往新页面</title>\n</head>\n<body><p><a href="${targetUrl}">文章已迁移，点击继续阅读。</a></p></body>\n</html>\n`,
						"utf8",
					);
					redirects += 1;
				}
			}
		}
	}
}

fs.copyFileSync(
	path.join(sourceRoot, "assets", "images", "banners", "home.jpeg"),
	path.join(projectRoot, "src", "assets", "images", "home-banner.jpeg"),
);
fs.copyFileSync(
	path.join(sourceRoot, "assets", "images", "2025-02-07-initial-test", "avator.jpg"),
	path.join(projectRoot, "src", "assets", "images", "avatar.jpg"),
);
fs.copyFileSync(
	path.join(sourceRoot, "assets", "images", "avator.ico"),
	path.join(projectRoot, "public", "favicon", "favicon.ico"),
);

const publishedCount = migrated.filter((post) => !post.draft).length;
const draftCount = migrated.filter((post) => post.draft).length;
console.log(
	`Migrated ${publishedCount} published posts, ${draftCount} drafts, and ${redirects} legacy URLs.`,
);
