import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
export function validateData(data) {
	assert.equal(data.version, 1);
	assert.equal(data.lessons.length, 60);
	const lessons = new Map(data.lessons.map((l) => [l.id, l]));
	assert.equal(lessons.size, 60);
	const ids = new Set();
	for (const word of data.words) {
		assert.ok(!ids.has(word.id), `Duplicate word ID: ${word.id}`);
		ids.add(word.id);
		assert.ok(lessons.has(word.lessonId), `Unknown lesson: ${word.lessonId}`);
		assert.ok(
			!lessons.get(word.lessonId).exam,
			`Exam has vocabulary: ${word.id}`,
		);
		assert.ok([1, 2].includes(word.list), `Invalid list: ${word.id}`);
		for (const field of ["word", "reading", "meaning", "pos"])
			assert.ok(
				typeof word[field] === "string" && word[field].trim(),
				`Missing ${field}: ${word.id}`,
			);
		assert.match(
			word.reading,
			/^[ぁ-ゖァ-ヺー・]+$/u,
			`Non-kana reading: ${word.id}`,
		);
		assert.ok(
			!/[?<>\uFFFD]/u.test(word.word + word.reading),
			`OCR artifact: ${word.id}`,
		);
		assert.ok(!/[A-Za-z`]/.test(word.meaning), `Unresolved gloss: ${word.id}`);
		if (word.example)
			for (const f of ["ja", "reading", "zh"])
				assert.ok(word.example[f], `Missing example ${f}: ${word.id}`);
	}
	for (const l of data.lessons) {
		assert.equal(l.originalNumber, l.book === "b2" ? l.number + 25 : l.number);
		assert.equal(l.exam, l.book !== "m1" && l.number === 25);
		if (l.exam) continue;
		for (const list of [1, 2])
			assert.ok(
				data.words.some((w) => w.lessonId === l.id && w.list === list),
				`Missing list ${list}: ${l.id}`,
			);
		for (const key of ["ja", "reading", "zh"])
			assert.ok(
				l.example?.[key],
				`Missing lesson short sentence ${key}: ${l.id}`,
			);
	}
	return {
		words: ids.size,
		lessons: data.lessons.filter((l) => !l.exam).length,
		examples: data.words.filter((w) => w.example).length,
	};
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const data = JSON.parse(
		readFileSync(new URL("../data/vocabulary.json", import.meta.url), "utf8"),
	);
	console.log("Validated vocabulary:", validateData(data));
}
