import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
	Session,
	courseLessons,
	selectWords,
	choicesFor,
	normalizeKana,
	kanaTokens,
	shuffle,
} from "../engine.js";
import { KANA_ROWS, kanaWords } from "../kana.js";
import { validateData } from "../scripts/validate-data.mjs";
import { compileExamples } from "../scripts/update-examples.mjs";
const data = JSON.parse(
	readFileSync(new URL("../data/vocabulary.json", import.meta.url), "utf8"),
);
const sample = data.words.filter((w) => w.lessonId === "b1-1" && w.list === 1);
function complete(session, answer) {
	let steps = 0;
	while (session.phase !== "summary") {
		assert.ok(++steps < 20000, "Session must terminate");
		if (session.phase === "learn") session.advanceLearning();
		else {
			session.answer(answer(session.current, session));
			session.next();
		}
	}
	return session.stats();
}
test("all 58 word lessons have both lists, valid readings, examples and unique IDs", () =>
	assert.ok(validateData(data).words > 2000));
test("every word example is assigned explicitly and matches the editable source", () => {
	const sentences = JSON.parse(
		readFileSync(
			new URL("../data/example-sentences.json", import.meta.url),
			"utf8",
		),
	);
	assert.deepEqual(compileExamples(data, sentences), data);
	assert.equal(validateData(data).examples, data.words.length);
	for (const word of data.words)
		assert.ok(word.example.ja.includes(word.example.form));
	const land = data.words.find((word) => word.word === "土地");
	const mail = data.words.find((word) => word.word === "船便");
	assert.match(land.example.ja, /土地/u);
	assert.match(mail.example.ja, /船便/u);
	assert.match(mail.example.reading, /ふなびん/u);
	const kakeru = data.words.filter(
		(word) => word.lessonId === "m1-6" && word.word === "かける",
	);
	assert.equal(kakeru.length, 2);
	assert.match(kakeru[0].example.ja, /皮/u);
	assert.match(kakeru[1].example.ja, /橋/u);
});
test("validation rejects missing, unrelated, and falsely labelled examples", () => {
	const invalid = structuredClone(data);
	const word = invalid.words.find((entry) => entry.word === "土地");
	const original = word.example;
	delete word.example;
	assert.throws(() => validateData(invalid), /Missing example/u);
	word.example = { ...original, ja: "図書館で本を借りたいです。" };
	assert.throws(() => validateData(invalid), /Example lacks target form/u);
	word.example.form = "図書館";
	assert.throws(() => validateData(invalid), /Unrecognized target form/u);
});
test("multi-lesson sessions practice every selected entry, including scopes over thirty words", () => {
	const words = selectWords(data.words, ["b1-14", "b1-15"], [1, 2]);
	assert.ok(words.length > 30);
	for (const mode of ["learn", "review"]) {
		const session = new Session(words, { mode });
		const stats = complete(session, () => true);
		assert.equal(stats.total, words.length);
		assert.equal(stats.attempted, words.length);
		assert.equal(stats.pending.length, 0);
	}
});
test("courses preserve user-provided boundaries and original lower-book numbering", () => {
	assert.deepEqual(
		courseLessons(1),
		Array.from({ length: 14 }, (_, i) => `b1-${i + 1}`),
	);
	assert.equal(courseLessons(2)[0], "b1-15");
	assert.equal(courseLessons(2).at(-1), "b2-4");
	assert.equal(courseLessons(2).length, 15);
	assert.equal(courseLessons(3).length, 16);
	assert.equal(courseLessons(3).at(-1), "b2-20");
	assert.equal(courseLessons(4).length, 15);
	assert.equal(courseLessons(4)[0], "b2-21");
	assert.equal(courseLessons(4).at(-1), "m1-10");
});
test("selection never mixes list I and list II or invents exam vocabulary", () => {
	const i = selectWords(data.words, ["b1-1", "b1-25"], [1]);
	assert.equal(i.length, 16);
	assert.ok(i.every((w) => w.list === 1));
	assert.equal(selectWords(data.words, ["b1-1"], [2]).length, 5);
	assert.equal(selectWords(data.words, ["b1-25", "b2-25"], [1, 2]).length, 0);
});
test("new learning groups five cards, checks each twice, and completes a partial last group", () => {
	const s = new Session(sample.slice(0, 7));
	assert.equal(s.phase, "learn");
	for (let i = 0; i < 5; i++) s.advanceLearning();
	assert.equal(s.phase, "quiz");
	const stats = complete(s, () => true);
	assert.equal(stats.total, 7);
	assert.equal(stats.attempted, 7);
	assert.equal(stats.answers, 14);
	assert.equal(stats.accuracy, 100);
	assert.equal(stats.missed.length, 0);
});
test("review starts at testing, retries mistakes later, and first accuracy does not inflate", () => {
	const s = new Session(sample.slice(0, 6), { mode: "review" });
	const id = s.current.word.id;
	s.answer(false);
	assert.notEqual(s.queue[0].word.id, id);
	s.next();
	const stats = complete(s, () => true);
	assert.equal(stats.accuracy, 83);
	assert.equal(stats.corrected, 1);
	assert.equal(stats.answers, 7);
	assert.equal(stats.unresolved.length, 0);
});
test("repeated failure is bounded and unresolved words remain in summary", () => {
	for (const mode of ["learn", "review"]) {
		const s = new Session(sample.slice(0, 7), { mode });
		const stats = complete(s, () => false);
		assert.equal(stats.unresolved.length, 7);
		assert.equal(stats.accuracy, 0);
		assert.ok(stats.answers <= 7 * (mode === "learn" ? 4 : 3));
	}
});
test("double answer cannot count twice; early finish distinguishes unanswered words", () => {
	const s = new Session(sample.slice(0, 4), { mode: "review" });
	assert.equal(s.answer(true), true);
	assert.equal(s.answer(false), false);
	s.finish();
	const stats = s.stats();
	assert.equal(stats.answers, 1);
	assert.equal(stats.pending.length, 3);
	assert.equal(stats.accuracy, 100);
	const empty = new Session(sample);
	empty.finish();
	assert.equal(empty.stats().accuracy, null);
	assert.equal(empty.stats().pending.length, 16);
});
test("pure kana words do not show their own reading as a reading question", () => {
	const s = new Session(
		data.words.filter((w) => w.lessonId === "b1-2"),
		{ mode: "review" },
	);
	complete(s, (task) => {
		if (task.type === "reading")
			assert.notEqual(
				normalizeKana(task.word.word),
				normalizeKana(task.word.reading),
			);
		return true;
	});
});
test("long spelling questions fall back; disabling listening also changes queued audio", () => {
	const s = new Session([{ ...sample[0], reading: "あ".repeat(14) }], {
		mode: "review",
	});
	s.current.type = "tiles";
	s.queue.unshift(s.current);
	s.next();
	assert.equal(s.current.type, "meaning");
	const listening = new Session(sample.slice(0, 5), {
		mode: "review",
		listening: true,
	});
	listening.options.listening = false;
	complete(listening, (task) => {
		assert.notEqual(task.type, "audio");
		return true;
	});
});
test("choices have one correct answer and no duplicate text, synonyms or homophones", () => {
	for (const word of data.words)
		for (const type of ["word", "meaning", "reading"]) {
			const options = choicesFor(
				word,
				type,
				data.words.filter((w) => w.lessonId === word.lessonId),
				() => 0.4,
			);
			assert.equal(options.filter((x) => x.correct).length, 1);
			assert.equal(new Set(options.map((x) => x.text)).size, options.length);
			assert.ok(options.length >= 2, `Insufficient choices ${word.id} ${type}`);
		}
	const w = { id: "a", word: "これ", reading: "これ", meaning: "这,这个" };
	assert.equal(
		choicesFor(w, "word", [
			w,
			{ id: "b", word: "この", reading: "この", meaning: "这,这个(人或事物)" },
		]).length,
		1,
	);
});
test("kana chart has 46 basic characters, 25 voiced characters and 33 contracted sounds", () => {
	const counts = Object.fromEntries(
		["清音", "浊音・半浊音", "拗音"].map((g) => [
			g,
			KANA_ROWS.filter((r) => r.group === g).reduce(
				(sum, r) => sum + r.chars.length,
				0,
			),
		]),
	);
	assert.deepEqual(counts, { 清音: 46, "浊音・半浊音": 25, 拗音: 33 });
	assert.equal(
		kanaWords(
			KANA_ROWS.map((r) => r.id),
			"both",
		).length,
		208,
	);
	assert.deepEqual(kanaTokens("きゃっと"), ["き", "ゃ", "っ", "と"]);
	assert.equal(normalizeKana("キャット"), "きゃっと");
	const stats = complete(
		new Session(kanaWords(["a"], "katakana"), { mode: "review" }),
		() => true,
	);
	assert.equal(stats.accuracy, 100);
});
test("empty sessions reject; deterministic shuffle does not mutate input", () => {
	assert.throws(() => new Session([]));
	const input = [1, 2, 3];
	const output = shuffle(input, () => 0.2);
	assert.deepEqual(input, [1, 2, 3]);
	assert.deepEqual([...output].sort(), input);
});
