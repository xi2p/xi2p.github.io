import { type CollectionEntry, getCollection } from "astro:content";
import { getCategoryName, getCategoryUrl, getDir } from "@utils/url-utils.ts";
import { siteConfig } from "../config";

// // Retrieve posts and sort them by publication date
async function getRawSortedPosts() {
	const allBlogPosts = await getCollection("posts", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});

	const sorted = allBlogPosts.sort((a, b) => {
		const dateA = new Date(a.data.published);
		const dateB = new Date(b.data.published);
		return dateA > dateB ? -1 : 1;
	});
	return sorted;
}

export async function getSortedPosts() {
	const sorted = await getRawSortedPosts();

	for (let i = 1; i < sorted.length; i++) {
		sorted[i].data.nextSlug = sorted[i - 1].slug;
		sorted[i].data.nextTitle = sorted[i - 1].data.title;
	}
	for (let i = 0; i < sorted.length - 1; i++) {
		sorted[i].data.prevSlug = sorted[i + 1].slug;
		sorted[i].data.prevTitle = sorted[i + 1].data.title;
	}

	return sorted;
}
export type PostForList = {
	slug: string;
	data: CollectionEntry<"posts">["data"];
};
export async function getSortedPostsList(): Promise<PostForList[]> {
	const sortedFullPosts = await getRawSortedPosts();

	// delete post.body
	const sortedPostsList = sortedFullPosts.map((post) => ({
		slug: post.slug,
		data: post.data,
	}));

	return sortedPostsList;
}
export type Tag = {
	name: string;
	count: number;
};

export async function getTagList(): Promise<Tag[]> {
	const allBlogPosts = await getCollection<"posts">("posts", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});

	const countMap: { [key: string]: number } = {};
	allBlogPosts.forEach((post: { data: { tags: string[] } }) => {
		post.data.tags.forEach((tag: string) => {
			if (!countMap[tag]) countMap[tag] = 0;
			countMap[tag]++;
		});
	});

	// sort tags
	const keys: string[] = Object.keys(countMap).sort((a, b) => {
		return a.toLowerCase().localeCompare(b.toLowerCase());
	});

	return keys.map((key) => ({ name: key, count: countMap[key] }));
}

export type Category = {
	name: string;
	title: string;
	description: string;
	image: string;
	imageBasePath: string;
	order: number;
	count: number;
	url: string;
};

export async function getCategoryList(): Promise<Category[]> {
	const [posts, details] = await Promise.all([
		getRawSortedPosts(),
		getCollection("categories"),
	]);
	const metadata = new Map<string, CollectionEntry<"categories">>();
	for (const entry of details) {
		if (metadata.has(entry.data.name.toLowerCase())) {
			throw new Error(`Duplicate category: ${entry.data.name}`);
		}
		metadata.set(entry.data.name.toLowerCase(), entry);
	}
	const categories = new Map<string, Category>();
	for (const post of posts) {
		const name = getCategoryName(post.data.category);
		const key = name.toLowerCase();
		const existing = categories.get(key);
		if (existing) {
			existing.count++;
			continue;
		}
		const detail = metadata.get(key);
		categories.set(key, {
			name: detail?.data.name ?? name,
			title: detail?.data.title ?? `${name} · 文章集`,
			description:
				detail?.data.description ??
				`这里收录了「${name}」分类下的文章，点击查看全部内容。`,
			image: detail?.data.image || post.data.image || siteConfig.banner.src,
			imageBasePath: detail
				? `content/categories/${getDir(detail.id)}`
				: post.data.image
					? `content/posts/${getDir(post.id)}`
					: "/",
			order: detail?.data.order ?? 100,
			count: 1,
			url: getCategoryUrl(name),
		});
	}
	return [...categories.values()].sort(
		(a, b) => a.order - b.order || a.name.localeCompare(b.name, "zh-CN"),
	);
}
