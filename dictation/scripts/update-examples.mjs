import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateData } from "./validate-data.mjs";

// Readings and translations are authored data. Do not generate a fallback
// sentence from the lesson: every word must have an explicit assignment.
export function compileExamples(data, sentences) {
	const result = structuredClone(data);
	const words = new Map(result.words.map((word) => [word.id, word]));
	const assigned = new Set();
	for (const sentence of sentences) {
		assert.ok(Object.keys(sentence.targets).length, "Sentence has no targets");
		const { ja, reading, zh } = sentence;
		for (const [id, form] of Object.entries(sentence.targets)) {
			assert.ok(words.has(id), `Unknown example target: ${id}`);
			assert.ok(!assigned.has(id), `Duplicate example assignment: ${id}`);
			assigned.add(id);
			words.get(id).example = { ja, reading, zh, form };
		}
	}
	assert.equal(
		assigned.size,
		words.size,
		"Every word needs an example assignment",
	);
	for (const lesson of result.lessons) delete lesson.example;
	validateData(result);
	return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const path = new URL("../data/vocabulary.json", import.meta.url);
	const data = JSON.parse(readFileSync(path, "utf8"));
	const sentences = JSON.parse(
		readFileSync(
			new URL("../data/example-sentences.json", import.meta.url),
			"utf8",
		),
	);
	const result = compileExamples(data, sentences);
	if (process.argv.includes("--check")) {
		assert.deepEqual(
			data,
			result,
			"Run node dictation/scripts/update-examples.mjs after editing examples",
		);
		console.log(
			`Example source matches all ${data.words.length} word entries.`,
		);
	} else {
		writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
		console.log(
			`Assigned ${sentences.length} sentences to ${result.words.length} word entries.`,
		);
	}
}
