import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
export function targetForms(word) {
	const text = word.word;
	const forms = new Set([text]);
	const add = (stem, endings) =>
		endings.forEach((ending) => forms.add(stem + ending));
	if (text.endsWith("だ"))
		add(text.slice(0, -1), [
			"です",
			"でした",
			"ではありません",
			"な",
			"に",
			"で",
			"だった",
		]);
	if (text === "同じだ") forms.add("同じ");
	if (word.pos.startsWith("动") || word.pos === "惯用") {
		if (text.endsWith("する"))
			add(text.slice(0, -2), [
				"します",
				"しました",
				"しません",
				"しませんでした",
				"しましょう",
				"しない",
				"した",
				"して",
				"し",
				"したい",
				"すれば",
				"できる",
				"される",
			]);
		if (text.endsWith("くる") || text.endsWith("来る"))
			add(text.slice(0, -2), [
				"きます",
				"きました",
				"こない",
				"きた",
				"きて",
				"来ます",
				"来ました",
				"来ない",
				"来た",
				"来て",
			]);
		if ((word.pos === "动2" || word.pos === "惯用") && text.endsWith("る"))
			add(text.slice(0, -1), [
				"ます",
				"ました",
				"ません",
				"ませんでした",
				"ましょう",
				"ない",
				"なかった",
				"た",
				"て",
				"たい",
				"れば",
				"られる",
				"よう",
			]);
		if (word.pos === "动1" || word.pos === "惯用") {
			const index = [..."うくぐすつぬぶむる"].indexOf(text.at(-1));
			if (index >= 0) {
				const stem = text.slice(0, -1);
				add(stem + [..."いきぎしちにびみり"][index], [
					"ます",
					"ました",
					"ません",
					"ませんでした",
					"ましょう",
					"たい",
					"に",
				]);
				add(stem + [..."わかがさたなばまら"][index], ["ない", "なかった"]);
				add(stem + [..."えけげせてねべめれ"][index], [
					"ば",
					"ます",
					"ません",
					"ませんでした",
				]);
				const te = text.endsWith("行く")
					? "って"
					: [
							"って",
							"いて",
							"いで",
							"して",
							"って",
							"んで",
							"んで",
							"んで",
							"って",
						][index];
				add(stem, [te, te.slice(0, -1) + (te.endsWith("で") ? "だ" : "た")]);
			}
		}
		const irregular = {
			くださる: ["ください", "くださいます", "くださいました"],
			おっしゃる: ["おっしゃいます", "おっしゃいました"],
			なさる: ["なさいます", "なさいました"],
			いらっしゃる: ["いらっしゃいます", "いらっしゃいました"],
		};
		for (const form of irregular[text] || []) forms.add(form);
	}
	if (word.pos === "形" && text.endsWith("い"))
		add(text.slice(0, -1), [
			"く",
			"くて",
			"かった",
			"くない",
			"くなかった",
			"ければ",
		]);
	return forms;
}
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
		for (const f of ["ja", "reading", "zh", "form"])
			assert.ok(
				typeof word.example?.[f] === "string" && word.example[f].trim(),
				`Missing example ${f}: ${word.id}`,
			);
		assert.ok(
			word.example.ja.includes(word.example.form),
			`Example lacks target form: ${word.id}`,
		);
		assert.ok(
			targetForms(word).has(word.example.form),
			`Unrecognized target form: ${word.id}`,
		);
		assert.ok(
			!/[一-龯々A-Za-z0-9\uFFFD]/u.test(word.example.reading),
			`Non-kana example reading: ${word.id}`,
		);
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
