import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderReadme } from "./scripts/render-readme.mjs";

const root = fileURLToPath(new URL("./", import.meta.url));
const publicFiles = [
	"index.html",
	"README.html",
	"styles.css",
	"app.js",
	"engine.js",
	"kana.js",
	"assets",
	"data/vocabulary.json",
];
const allowed = (file) =>
	publicFiles.some(
		(p) => file === p || (["assets"].includes(p) && file.startsWith(`${p}/`)),
	);
const mime = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".webp": "image/webp",
};

export default function dictation() {
	return {
		name: "chiwa-dictation",
		hooks: {
			"astro:server:setup": ({ server }) => {
				server.middlewares.use(async (req, res, next) => {
					let pathname;
					try {
						pathname = decodeURIComponent(
							new URL(req.url, "http://localhost").pathname,
						);
					} catch {
						next();
						return;
					}
					if (pathname === "/dictation") {
						res.writeHead(301, { Location: "/dictation/" });
						res.end();
						return;
					}
					if (!pathname.startsWith("/dictation/")) {
						next();
						return;
					}
					if (!["GET", "HEAD"].includes(req.method)) {
						res.statusCode = 405;
						res.end();
						return;
					}
					const file = pathname.slice("/dictation/".length) || "index.html";
					const resolved = path.resolve(root, file);
					if (!allowed(file) || !resolved.startsWith(root)) {
						res.statusCode = 404;
						res.end("Not found");
						return;
					}
					try {
						const content =
							file === "README.html"
								? await renderReadme()
								: await readFile(resolved);
						res.setHeader(
							"Content-Type",
							mime[path.extname(file)] || "application/octet-stream",
						);
						res.end(req.method === "HEAD" ? undefined : content);
					} catch {
						res.statusCode = 404;
						res.end("Not found");
					}
				});
			},
			"astro:build:done": async ({ dir }) => {
				const target = fileURLToPath(new URL("dictation/", dir));
				await mkdir(target, { recursive: true });
				for (const entry of publicFiles.filter((p) => p !== "README.html")) {
					await mkdir(path.dirname(path.join(target, entry)), {
						recursive: true,
					});
					await cp(path.join(root, entry), path.join(target, entry), {
						recursive: true,
					});
				}
				await writeFile(path.join(target, "README.html"), await renderReadme());
				console.log(
					"Chiwa Dictation copied to /dictation/ (runtime files only).",
				);
			},
		},
	};
}
