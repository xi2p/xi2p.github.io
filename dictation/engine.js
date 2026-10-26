// Pure session logic. No storage, network, DOM or cross-day scheduling.
export const BOOKS = [
	{ id: "b1", label: "初级上", subtitle: "原书第 1—25 课", count: 25 },
	{ id: "b2", label: "初级下", subtitle: "原书第 26—50 课", count: 25 },
	{ id: "m1", label: "中级上", subtitle: "本工具收录第 1—10 课", count: 10 },
];
export const courseLessons = (course) => {
	const range = (book, a, b) =>
		Array.from({ length: b - a + 1 }, (_, i) => `${book}-${a + i}`);
	return (
		{
			1: range("b1", 1, 14),
			2: [...range("b1", 15, 25), ...range("b2", 1, 4)],
			3: range("b2", 5, 20),
			4: [...range("b2", 21, 25), ...range("m1", 1, 10)],
		}[course] || []
	);
};
export function shuffle(items, random = Math.random) {
	const a = [...items];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}
export function normalizeKana(value) {
	return value
		.normalize("NFKC")
		.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
		.replace(/[\s・･]/g, "");
}
export function kanaTokens(reading) {
	return Array.from(reading.normalize("NFKC").replace(/[\s・･]/g, ""));
}
export function selectWords(words, lessons, lists) {
	const selected = new Set(lessons);
	return words.filter(
		(w) => selected.has(w.lessonId) && lists.includes(w.list),
	);
}
export function answerValue(word, type) {
	if (type === "meaning") return word.meaning;
	if (type === "reading") return word.reading;
	if (type === "romaji") return word.romaji;
	return word.word;
}
export function choicesFor(word, type, pool, random = Math.random) {
	const correct = answerValue(word, type);
	const seen = new Set([correct]);
	// Do not offer homophones or alternate spellings of the same meaning as distractors.
	const glosses = (value) =>
		value
			.replace(/[（(][^）)]*[）)]/g, "")
			.split(/[,，;；、/]/)
			.map((s) => s.trim())
			.filter(Boolean);
	const meanings = glosses(word.meaning);
	const candidates = shuffle(
		pool.filter(
			(w) =>
				w.id !== word.id &&
				!glosses(w.meaning).some((m) => meanings.includes(m)) &&
				normalizeKana(w.reading) !== normalizeKana(word.reading),
		),
		random,
	);
	const options = [{ text: correct, correct: true }];
	for (const other of candidates) {
		const text = answerValue(other, type);
		if (!text || seen.has(text)) continue;
		seen.add(text);
		options.push({ text, correct: false });
		if (options.length === 4) break;
	}
	return shuffle(options, random);
}
export class Session {
	constructor(words, options = {}) {
		if (!words.length) throw new Error("请至少选择一个有词条的范围。");
		this.words = [...words];
		this.options = { mode: "learn", listening: false, ...options };
		this.startedAt = Date.now();
		this.finishedAt = null;
		this.round = 0;
		this.groupStart = 0;
		this.learnIndex = 0;
		this.phase = this.options.mode === "learn" ? "learn" : "quiz";
		this.results = new Map(
			words.map((w) => [
				w.id,
				{
					word: w,
					attempts: 0,
					firstCorrect: null,
					correct: false,
					mistakes: 0,
				},
			]),
		);
		this.queue = [];
		this.current = null;
		this.groupSize = 5;
		if (this.phase === "quiz") this.prepareQuiz(words);
	}
	group() {
		return this.words.slice(this.groupStart, this.groupStart + this.groupSize);
	}
	learningWord() {
		return this.group()[this.learnIndex];
	}
	advanceLearning() {
		if (this.phase !== "learn") return;
		this.learnIndex++;
		if (this.learnIndex >= this.group().length) {
			this.phase = "quiz";
			this.prepareQuiz(this.group());
		}
	}
	prepareQuiz(words) {
		const tasks = words.map((word, index) => ({
			word,
			type: this.typeFor(word, index),
			retry: false,
		}));
		// New learning checks both meaning and reading, separated by other words.
		if (this.options.mode === "learn")
			tasks.push(
				...words.map((word, index) => ({
					word,
					type: word.kana ? "romaji" : index % 2 ? "reading" : "tiles",
					retry: false,
				})),
			);
		this.queue = tasks;
		this.next();
	}
	typeFor(word, index) {
		if (word.kana) return index % 2 ? "romaji" : "word";
		if (this.options.listening && index % 4 === 3) return "audio";
		return ["word", "meaning", "reading", "tiles"][index % 4];
	}
	next() {
		if (this.finishedAt) return;
		this.current = this.queue.shift() || null;
		if (this.current) {
			if (
				this.current.type === "reading" &&
				normalizeKana(this.current.word.word) ===
					normalizeKana(this.current.word.reading)
			)
				this.current.type = "tiles";
			const tokens = kanaTokens(this.current.word.reading);
			if (
				this.current.type === "tiles" &&
				(tokens.length > 12 ||
					/[^ぁ-ゖァ-ヺー]/u.test(tokens.join("")) ||
					tokens.length === 0)
			)
				this.current.type = "meaning";
			if (this.current.type === "audio" && !this.options.listening)
				this.current.type = "word";
			return;
		}
		this.groupStart +=
			this.options.mode === "learn" ? this.groupSize : this.words.length;
		if (this.options.mode === "learn" && this.groupStart < this.words.length) {
			this.learnIndex = 0;
			this.phase = "learn";
		} else this.finish();
	}
	answer(correct) {
		if (this.phase !== "quiz" || !this.current || this.current.answered)
			return false;
		this.current.answered = true;
		const result = this.results.get(this.current.word.id);
		if (!result.attempts) result.firstCorrect = correct;
		result.attempts++;
		result.correct = correct;
		if (!correct) {
			result.mistakes++;
			if (result.mistakes < 3) {
				const task = {
					word: this.current.word,
					type: this.current.word.kana ? "word" : "word",
					retry: true,
				};
				// Two intervening questions whenever the remaining pool permits it.
				this.queue.splice(Math.min(3, this.queue.length), 0, task);
			}
		}
		return true;
	}
	finish() {
		this.finishedAt = Date.now();
		this.phase = "summary";
		this.current = null;
	}
	stats() {
		const rows = [...this.results.values()];
		const attempted = rows.filter((r) => r.attempts > 0);
		const firstCorrect = attempted.filter((r) => r.firstCorrect).length;
		const missed = rows.filter((r) => r.mistakes > 0);
		const corrected = missed.filter((r) => r.correct).length;
		return {
			total: rows.length,
			attempted: attempted.length,
			firstCorrect,
			accuracy: attempted.length
				? Math.round((firstCorrect / attempted.length) * 100)
				: null,
			answers: rows.reduce((s, r) => s + r.attempts, 0),
			correctAnswers: rows.reduce((s, r) => s + r.attempts - r.mistakes, 0),
			missed,
			corrected,
			unresolved: missed.filter((r) => !r.correct),
			pending: rows.filter((r) => !r.attempts),
			duration: Math.max(
				0,
				Math.round(((this.finishedAt || Date.now()) - this.startedAt) / 1000),
			),
		};
	}
}
