import { defineCollection, z } from "astro:content";

const postsCollection = defineCollection({
	schema: z.object({
		title: z.string(),
		published: z.date(),
		updated: z.date().optional(),
		draft: z.boolean().optional().default(false),
		description: z.string().optional().default(""),
		image: z.string().optional().default(""),
		tags: z.array(z.string()).optional().default([]),
		category: z.string().optional().nullable().default(""),
		lang: z.string().optional().default(""),
		pdf: z.string().optional(),

		/* For internal use */
		prevTitle: z.string().default(""),
		prevSlug: z.string().default(""),
		nextTitle: z.string().default(""),
		nextSlug: z.string().default(""),
	}),
});
const specCollection = defineCollection({
	schema: z.object({}),
});
const categoriesCollection = defineCollection({
	schema: z.object({
		name: z.string().trim().min(1),
		title: z.string().min(1),
		description: z.string(),
		image: z.string().min(1),
		order: z.number().default(100),
	}),
});
export const collections = {
	posts: postsCollection,
	categories: categoriesCollection,
	spec: specCollection,
};
