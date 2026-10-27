import {
	BOOKS,
	Session,
	shuffle,
	choicesFor,
	selectWords,
	courseLessons,
	kanaTokens,
	normalizeKana,
} from "./engine.js";
import { KANA_ROWS, kanaWords, kanaKatakana } from "./kana.js";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (s) =>
	String(s ?? "").replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c
			],
	);
const STORAGE_KEY = "chiwa-dictation.settings.v1";
const defaults = {
	selected: ["b1-1"],
	lists: [1],
	mode: "learn",
	order: "lesson",
	listening: false,
	voice: "",
	kanaRows: ["a", "k"],
	kanaScript: "hiragana",
};
let settings = structuredClone(defaults);
try {
	const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
	if (saved && typeof saved === "object") {
		settings.selected = Array.isArray(saved.selected)
			? saved.selected.filter((s) => /^(b1|b2|m1)-\d+$/.test(s))
			: defaults.selected;
		settings.lists =
			Array.isArray(saved.lists) && saved.lists.some((x) => x === 1 || x === 2)
				? saved.lists.filter((x) => x === 1 || x === 2)
				: [1];
		for (const [key, values] of Object.entries({
			mode: ["learn", "review"],
			order: ["lesson", "shuffle"],
			kanaScript: ["hiragana", "katakana", "both"],
		}))
			if (values.includes(saved[key])) settings[key] = saved[key];
		settings.kanaRows = Array.isArray(saved.kanaRows)
			? saved.kanaRows.filter((id) => KANA_ROWS.some((r) => r.id === id))
			: defaults.kanaRows;
		settings.voice = typeof saved.voice === "string" ? saved.voice : "";
		// Sound is deliberately opt-in on every page visit, even if other settings were remembered.
	}
} catch {
	/* Storage disabled or malformed: use defaults. */
}
let data,
	activeBook = "b1",
	module = "words",
	session = null,
	sessionWords = [],
	allChoices = [],
	tileBank = [],
	pickedTiles = [],
	toastTimer,
	voiceTimer,
	audioFailed = false;
let japaneseVoices = [];
const app = $("#app");
function toast(message) {
	clearTimeout(toastTimer);
	$("#toast").textContent = message;
	$("#toast").classList.add("visible");
	toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 4500);
}
function save() {
	try {
		const { listening, ...rest } = settings;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
	} catch {
		/* Practice works without storage. */
	}
}
function lesson(id) {
	return data.lessons.find((l) => l.id === id);
}
function sourceLabel(word) {
	if (word.kana)
		return `五十音 · ${word.row} · ${word.script === "katakana" ? "片假名" : "平假名"}`;
	const l = lesson(word.lessonId);
	return `${BOOKS.find((b) => b.id === l.book).label} · 第 ${l.number} 课 · 单词${word.list === 1 ? "Ⅰ" : "Ⅱ"}`;
}
function currentPool() {
	return module === "kana"
		? kanaWords(settings.kanaRows, settings.kanaScript)
		: selectWords(data.words, settings.selected, settings.lists);
}
function countFor(id) {
	return selectWords(data.words, [id], settings.lists).length;
}
function sessionCount() {
	return currentPool().length;
}
function renderHero() {
	return `<section class="hero"><div><div class="eyebrow"><span class="dot"></span>旧版标准日本语 / ZJU JAPANESE</div><h1>把日语，<br>一点点<em>记牢。</em></h1><p>从五十音到每一课的单词。自己选范围，按自己的节奏，<br>在一次次回想中，让陌生变成熟悉。</p></div><div class="hero-art" aria-hidden="true"><div class="kana-note" lang="ja">あ</div><div class="kana-note second" lang="ja">ア</div><span class="art-flower">✳</span><span class="art-caption">A LITTLE PRACTICE, EVERY TIME.</span></div></section>`;
}
function renderNav() {
	return `<div class="module-nav" role="tablist" aria-label="练习内容"><button role="tab" id="tab-words" aria-controls="setup-workspace" aria-selected="${module === "words"}" data-module="words">单词练习 <span>VOCABULARY</span></button><button role="tab" id="tab-kana" aria-controls="setup-workspace" aria-selected="${module === "kana"}" data-module="kana">五十音 <span>KANA</span></button></div>`;
}
function renderWordSelection() {
	const book = BOOKS.find((b) => b.id === activeBook);
	const lessons = data.lessons.filter((l) => l.book === activeBook && !l.exam);
	const units = [...new Set(lessons.map((l) => l.unit))];
	return `<section class="panel scope-panel" aria-labelledby="scope-title"><div class="panel-title"><span class="step">01</span><h2 id="scope-title">今天，记哪些课？</h2><button class="text-button tiny" data-action="clear-lessons">清空选择</button></div><span class="label">按课程快速选择</span><div class="course-buttons">${[1, 2, 3, 4].map((n) => `<button class="pill" data-course="${n}">日语 ${n}</button>`).join("")}</div><p class="course-note">快捷选择后，仍可逐课增减。日语 1 还包含 <button class="text-button" data-module="kana">五十音练习 ↗</button></p><div class="book-tabs" role="tablist" aria-label="教材">${BOOKS.map((b) => `<button role="tab" aria-selected="${b.id === activeBook}" data-book="${b.id}">${b.label}</button>`).join("")}</div><div class="book-info"><span class="tiny">${book.subtitle}</span><button class="text-button" data-action="toggle-book">${lessons.every((l) => settings.selected.includes(l.id)) ? "取消本册" : "选择本册"}</button></div>${units
		.map(
			(unit) =>
				`<div class="unit"><div class="unit-head"><span class="unit-label">第 ${String(unit).padStart(2, "0")} 单元${activeBook === "m1" ? " · 每 4 课分组" : ""}</span><button data-unit="${unit}">${lessons.filter((l) => l.unit === unit).every((l) => settings.selected.includes(l.id)) ? "取消本单元 −" : "选择本单元 +"}</button></div><div class="lesson-grid">${lessons
					.filter((l) => l.unit === unit)
					.map(
						(l) =>
							`<button class="lesson" aria-pressed="${settings.selected.includes(l.id)}" data-lesson="${l.id}" title="${esc(l.title)}"><span class="lesson-number">第 ${String(l.number).padStart(2, "0")} 课</span><span class="lesson-count">${countFor(l.id)} 个词${activeBook === "b2" ? ` · 原 ${l.originalNumber}` : ""}</span><span class="lesson-topic">${esc(l.topic || l.title)}</span></button>`,
					)
					.join("")}</div></div>`,
		)
		.join(
			"",
		)}${activeBook !== "m1" ? '<div class="lesson exam">第 25 课 · 模拟试题，无独立新增词表</div>' : ""}<div class="selection-footer"><strong id="selection-total">已选 ${settings.selected.filter((id) => lesson(id) && !lesson(id).exam).length} 课 · ${currentPool().length} 个词</strong><button class="text-button" data-action="preview">查看所选词表 ↗</button></div></section>`;
}
function renderKanaSelection() {
	return `<section class="panel" aria-labelledby="scope-title"><div class="panel-title"><span class="step">01</span><h2 id="scope-title">从声音的起点开始</h2><button class="text-button tiny" data-action="clear-kana">清空选择</button></div><div class="setting-pair" style="margin:0 0 25px"><label class="label">练习哪种假名<select name="kanaScript"><option value="hiragana" ${settings.kanaScript === "hiragana" ? "selected" : ""}>平假名</option><option value="katakana" ${settings.kanaScript === "katakana" ? "selected" : ""}>片假名</option><option value="both" ${settings.kanaScript === "both" ? "selected" : ""}>平假名 + 片假名</option></select></label><div><span class="label">快速选择</span><div class="button-row"><button class="pill" data-kana-group="清音">清音</button><button class="pill" data-kana-group="all">全部</button></div></div></div><div class="kana-sections">${[
		"清音",
		"浊音・半浊音",
		"拗音",
	]
		.map(
			(group) =>
				`<div><h3>${group}</h3><div class="kana-rows">${KANA_ROWS.filter(
					(r) => r.group === group,
				)
					.map(
						(row) =>
							`<button class="pill" data-kana-row="${row.id}" aria-pressed="${settings.kanaRows.includes(row.id)}">${row.label}</button>`,
					)
					.join("")}</div></div>`,
		)
		.join(
			"",
		)}</div><details class="kana-reference"><summary>打开五十音参考表与发音提示</summary><p class="tiny">罗马字采用常用赫本式；ぢ／じ、づ／ず读音相同，选择题不会把它们互作干扰项。を通常读作 o，表中写作 wo 以区分字符。</p>${[
		"清音",
		"浊音・半浊音",
		"拗音",
	]
		.map(
			(group) =>
				`<div class="chart-label">${group}</div><div class="kana-chart">${KANA_ROWS.filter(
					(r) => r.group === group,
				)
					.flatMap((r) =>
						r.chars.map(
							(c, i) =>
								`<div class="kana-cell"><span lang="ja">${c} ${kanaKatakana(c)}</span><small>${r.roman[i]}</small></div>`,
						),
					)
					.join("")}</div>`,
		)
		.join(
			"",
		)}<div class="kana-tips"><p><strong>促音 っ／ッ：</strong>占一拍短暂停顿。比较 <span lang="ja">さか（坂）／さっか（作家）</span>。</p><p><strong>长音：</strong>拉长一拍；片假名常写作「ー」。比较 <span lang="ja">おばさん（阿姨）／おばあさん（奶奶）</span>。</p><p><strong>拗音：</strong>小写的「ゃ・ゅ・ょ」和前一假名合成一拍，例如「きゃ」。读音练习可在右侧开启声音后使用。</p><button class="pill sound-test" data-action="kana-sounds" ${!settings.listening ? "disabled" : ""}>听示范：促音与长音</button></div></details><div class="selection-footer"><strong>已选 ${settings.kanaRows.length} 行 · ${currentPool().length} 个假名</strong><button class="text-button" data-action="preview">查看所选假名 ↗</button></div></section>`;
}
function renderSettings() {
	return `<aside class="panel settings" aria-labelledby="settings-title"><div class="panel-title"><span class="step">02</span><h2 id="settings-title">定一个小节奏</h2></div><div class="mode-choices">${[
		["learn", "新学", "先认读，再回想。每 5 个一组，逐步记牢。"],
		["review", "复习", "直接测试。混合题型，把不熟悉的词再过一遍。"],
	]
		.map(
			([value, title, note]) =>
				`<label class="mode-option"><input type="radio" name="mode" value="${value}" ${settings.mode === value ? "checked" : ""}><span><b>${title}</b><small>${note}</small></span></label>`,
		)
		.join(
			"",
		)}</div>${module === "words" ? `<div class="setting-group"><span class="label">词表范围 · 至少选一项</span><label class="check-row"><input type="checkbox" name="list" value="1" ${settings.lists.includes(1) ? "checked" : ""}>单词Ⅰ <small>考试范围</small></label><label class="check-row"><input type="checkbox" name="list" value="2" ${settings.lists.includes(2) ? "checked" : ""}>单词Ⅱ <small>补充拓展</small></label></div>` : ""}<div class="setting-group"><label class="label">练习顺序<select name="order"><option value="lesson" ${settings.order === "lesson" ? "selected" : ""}>按课顺序</option><option value="shuffle" ${settings.order === "shuffle" ? "selected" : ""}>随机顺序</option></select></label></div><div class="setting-group"><label class="check-row"><input type="checkbox" name="listening" ${settings.listening ? "checked" : ""}>允许发声与听力题</label><p class="listening-note">默认静音。开启后使用设备实时日语 TTS，无需麦克风，不下载预录音频。</p><div id="voice-controls">${renderVoiceControls()}</div></div><div class="start-area"><div class="start-count"><b>${sessionCount()} <span>${module === "kana" ? "个假名" : "个词"}</span></b><span>${settings.mode === "learn" ? "分组认读 → 回想练习" : "直接测试 → 错词巩固"}</span></div><button class="button primary wide" data-action="start" ${!sessionCount() ? "disabled" : ""}><span>开始${settings.mode === "learn" ? "新学" : "复习"}</span><span aria-hidden="true">↗</span></button><p class="privacy-note">只记住设置，不保存学习记录。<br>刷新或关闭页面后，本轮进度即清空。</p></div></aside>`;
}
function renderVoiceControls() {
	if (!settings.listening) return "";
	if (!("speechSynthesis" in window))
		return '<p class="tiny">当前浏览器不支持语音。请关闭声音选项继续练习。</p>';
	if (!japaneseVoices.length)
		return '<p class="tiny">未检测到日语语音。可在设备的语音设置中安装日语声音，或关闭声音选项继续。<button class="text-button" data-action="reload-voices">重新检测</button></p>';
	return `<select name="voice" class="voice-select" aria-label="日语语音">${japaneseVoices.map((v) => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === settings.voice ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select><button class="pill sound-test" data-action="test-sound">▷ 测试发音</button>`;
}
function renderSetup(focus = false) {
	$(".credit-card").hidden = false;
	session = null;
	stopSound();
	app.innerHTML = `${renderHero()}${renderNav()}<div class="workspace" id="setup-workspace" role="tabpanel" aria-labelledby="tab-${module}">${module === "words" ? renderWordSelection() : renderKanaSelection()}${renderSettings()}</div><section class="help-strip" aria-label="使用步骤"><div><b><span class="help-number">01</span>圈定小范围</b><p>课程快捷选择后，逐课微调。</p></div><div><b><span class="help-number">02</span>让回想发生</b><p>先在心里想，再点选或拼假名。</p></div><div><b><span class="help-number">03</span>把错词带走</b><p>查看本轮总结，再练一遍错词。</p></div></section><p class="data-note"><b>教材说明</b>　初下第 1—25 课对应原书第 26—50 课；两册第 25 课均为模拟试题，不另造词表。中上收录前 10 课。<a href="./README.html#词库与版本">查看词库与校对说明 ↗</a></p>`;
	if (focus)
		$("#scope-title").scrollIntoView({ block: "start", behavior: "instant" });
}
function refreshVoices() {
	japaneseVoices =
		"speechSynthesis" in window
			? speechSynthesis.getVoices().filter((v) => /^ja(?:[-_]|$)/i.test(v.lang))
			: [];
	if (!japaneseVoices.some((v) => v.voiceURI === settings.voice))
		settings.voice = japaneseVoices[0]?.voiceURI || "";
	const controls = $("#voice-controls");
	if (controls) controls.innerHTML = renderVoiceControls();
}
function stopSound() {
	if ("speechSynthesis" in window) speechSynthesis.cancel();
	clearTimeout(voiceTimer);
}
function speak(text, listeningQuestion = false) {
	if (
		!settings.listening ||
		!japaneseVoices.length ||
		!("speechSynthesis" in window)
	) {
		toast("需要先开启声音，并安装可用的日语语音。");
		return;
	}
	stopSound();
	const utterance = new SpeechSynthesisUtterance(text);
	utterance.lang = "ja-JP";
	utterance.rate = 0.82;
	utterance.voice =
		japaneseVoices.find((v) => v.voiceURI === settings.voice) ||
		japaneseVoices[0];
	let started = false;
	utterance.onstart = () => {
		started = true;
		clearTimeout(voiceTimer);
		const status = $("#audio-status");
		if (status) status.textContent = "正在播放…";
	};
	utterance.onend = () => {
		const status = $("#audio-status");
		if (status) status.textContent = "点击可再听一次";
	};
	const failure = () => {
		if (audioFailed) return;
		audioFailed = true;
		stopSound();
		toast("日语语音未能播放，已切换为静音文字题。");
		settings.listening = false;
		if (session) session.options.listening = false;
		if (listeningQuestion && session?.current && !session.current.answered) {
			session.current.type = "word";
			renderSession();
		} else if (!session) renderSetup();
	};
	utterance.onerror = (event) => {
		if (!["canceled", "interrupted"].includes(event.error)) failure();
	};
	voiceTimer = setTimeout(() => {
		if (!started) failure();
	}, 8000);
	speechSynthesis.speak(utterance);
}
function soundButton(word) {
	return settings.listening
		? `<button class="pill sound-test" data-speak="${esc(word.reading)}" aria-label="播放${esc(word.word)}的发音">▷ 听发音</button>`
		: "";
}
function exampleHTML(word) {
	const example = word.example;
	if (!example) return "";
	const form = example.form || word.word;
	const position = example.ja.indexOf(form);
	const sentence =
		position < 0
			? esc(example.ja)
			: esc(example.ja.slice(0, position)) +
				'<mark class="example-target">' +
				esc(form) +
				"</mark>" +
				esc(example.ja.slice(position + form.length));
	return (
		'<div class="example"><span class="example-label">单词例句</span><p lang="ja">' +
		sentence +
		'</p><p class="example-zh" lang="ja">' +
		esc(example.reading) +
		'</p><p class="example-zh">' +
		esc(example.zh) +
		"</p>" +
		(settings.listening
			? '<button class="text-button" data-speak="' +
				esc(example.ja) +
				'">▷ 朗读例句</button>'
			: "") +
		"</div>"
	);
}
function startSession(words = null) {
	if (settings.listening && !japaneseVoices.length) {
		toast("未检测到日语语音，请关闭声音选项或安装日语语音。");
		return;
	}
	let selected = words || currentPool();
	if (settings.order === "shuffle") selected = shuffle(selected);
	if (!selected.length) {
		toast("请先选择有词条的课程或假名行。");
		return;
	}
	sessionWords = selected;
	session = new Session(selected, {
		mode: settings.mode,
		listening: settings.listening,
	});
	audioFailed = false;
	save();
	renderSession();
	window.scrollTo({ top: 0, behavior: "instant" });
}
function renderSession() {
	$(".credit-card").hidden = true;
	stopSound();
	if (session.phase === "summary") {
		renderSummary();
		return;
	}
	const stats = session.stats();
	const progress = Math.round((stats.attempted / stats.total) * 100);
	app.innerHTML = `<section class="session-wrap"><div class="session-header"><h1>${module === "kana" ? "五十音" : "单词"}${session.options.mode === "learn" ? "新学" : "复习"} <span class="session-meta">/ 本轮 ${stats.total} ${module === "kana" ? "个假名" : "个词"}</span></h1><button class="text-button" data-action="end-session">结束本轮</button></div><div class="progress-track" role="progressbar" aria-label="已测词条" aria-valuenow="${stats.attempted}" aria-valuemin="0" aria-valuemax="${stats.total}"><div class="progress-fill" style="width:${progress}%"></div></div><div class="panel session-panel" id="exercise" tabindex="-1">${session.phase === "learn" ? renderLearning() : renderQuestion()}</div><p class="session-hint">${session.phase === "learn" ? "先观察写法、读音与含义，再试着遮住答案回想。" : "选择题可用 1—4 作答，Enter 继续。拼词时点击假名，点击已选假名可撤回。"}</p></section>`;
	if (session.phase === "quiz") {
		if (session.current.type === "tiles") renderTiles();
		if (session.current.answered) renderFeedback();
	}
	$("#exercise").focus({ preventScroll: true });
}
function renderLearning() {
	const word = session.learningWord();
	return `<div class="exercise-top"><span class="exercise-tag">先认识 · 第 ${Math.floor(session.groupStart / 5) + 1} 组 ${session.learnIndex + 1}/${session.group().length}</span><span class="source-label">${esc(sourceLabel(word))}</span></div><div class="flashcard"><h2 class="word-ja" lang="ja">${esc(word.word)}</h2><p class="word-reading" lang="${word.kana ? "en" : "ja"}">${esc(word.kana ? word.romaji : word.reading)}</p><div class="word-meaning"><span class="pos-tag">${esc(word.pos)}</span>${esc(word.meaning)}</div>${soundButton(word)}${exampleHTML(word)}</div><div class="session-actions"><button class="button primary" data-action="learn-next">${session.learnIndex === session.group().length - 1 ? "开始这组回想 →" : "记住了，下一个 →"}</button></div>`;
}
function renderQuestion() {
	const { word, type, retry } = session.current;
	let instruction,
		prompt,
		japanese = false;
	if (type === "word") {
		instruction = word.kana ? "选择对应的假名" : "先回想日语，再选择正确的单词";
		prompt = word.meaning;
	}
	if (type === "meaning") {
		instruction = "选择正确的中文含义";
		prompt = word.word;
		japanese = true;
	}
	if (type === "reading") {
		instruction = "选择正确的假名读音";
		prompt = word.word;
		japanese = true;
	}
	if (type === "romaji") {
		instruction = "选择对应的罗马字读音";
		prompt = word.word;
		japanese = true;
	}
	if (type === "tiles") {
		instruction = "根据含义，点击假名拼出读音";
		prompt = word.meaning;
	}
	if (type === "audio") {
		instruction = "听发音，选择对应的日语单词";
		prompt = "";
	}
	const pool =
		module === "kana"
			? kanaWords(
					KANA_ROWS.map((r) => r.id),
					settings.kanaScript,
				)
			: data.words.filter(
					(w) =>
						w.lessonId === word.lessonId && settings.lists.includes(w.list),
				);
	allChoices = type === "tiles" ? [] : choicesFor(word, type, pool);
	// A one-word scope can still practice without inventing duplicate choices.
	if (allChoices.length < 2 && type !== "tiles")
		allChoices = [{ text: answerFallback(word, type), correct: true }];
	const question =
		type === "audio"
			? `<div class="question-prompt"><button class="audio-play" data-action="play-question">▷ 播放发音</button></div><p id="audio-status" class="audio-status" aria-live="polite">准备好后点击播放，可重复聆听</p>`
			: `<div class="question-prompt${japanese ? " japanese" : ""}" ${japanese ? 'lang="ja"' : ""}>${esc(prompt)}</div>${type === "reading" ? `<p class="question-instruction">语境：${esc(word.meaning)}</p>` : ""}`;
	const inputs =
		type === "tiles"
			? `<div id="tiles-answer" class="tiles-answer" aria-label="已拼出的假名"></div><div id="tile-bank" class="tile-bank" aria-label="可选假名"></div><div class="tiles-tools"><button class="text-button" data-action="tile-undo">撤回一个</button><button class="text-button" data-action="tile-clear">清空</button></div><div class="session-actions"><button class="button primary" data-action="check-tiles">检查答案</button></div>`
			: `<div class="choices">${allChoices.map((c, i) => `<button class="choice" data-choice="${i}"><span class="choice-number" aria-hidden="true">${i + 1}</span><span ${type !== "meaning" ? 'lang="' + (type === "romaji" ? "en" : "ja") + '"' : ""}>${esc(c.text)}</span></button>`).join("")}</div>`;
	if (type === "tiles") {
		const chars = kanaTokens(word.reading);
		const extras = shuffle([
			..."あいうえおかきくけこさしすせそたちつてとなにぬねの",
		])
			.filter((c) => !chars.includes(c))
			.slice(0, 3);
		tileBank = shuffle([...chars, ...extras]);
		pickedTiles = [];
	}
	return `<div class="exercise-top"><span class="exercise-tag">${retry ? "错词再遇见" : "主动回想"} · ${esc({ word: "中 → 日", meaning: "日 → 中", reading: "读音辨认", romaji: "假名读音", tiles: "拼出假名", audio: "听音辨词" }[type])}</span><span class="source-label">${esc(sourceLabel(word))}</span></div><p class="question-instruction">${instruction}</p>${question}${inputs}<div id="answer-feedback" aria-live="polite"></div><div class="session-actions" id="skip-action"><button class="text-button" data-action="unknown">还想不起来，看看答案</button></div>`;
}
function answerFallback(word, type) {
	return type === "meaning"
		? word.meaning
		: type === "reading"
			? word.reading
			: type === "romaji"
				? word.romaji
				: word.word;
}
function renderTiles() {
	const answered = session.current.answered;
	$("#tiles-answer").innerHTML = pickedTiles
		.map(
			(index, position) =>
				`<button class="tile" data-tile-remove="${position}" ${answered ? "disabled" : ""} aria-label="撤回${esc(tileBank[index])}" lang="ja">${esc(tileBank[index])}</button>`,
		)
		.join("");
	$("#tile-bank").innerHTML = tileBank
		.map(
			(char, index) =>
				`<button class="tile" data-tile="${index}" ${pickedTiles.includes(index) || answered ? "disabled" : ""} lang="ja">${esc(char)}</button>`,
		)
		.join("");
}
function submitAnswer(correct, choice = null) {
	if (!session?.answer(correct)) return;
	stopSound();
	session.current.chosen = choice;
	$$(".choice").forEach((b, i) => {
		b.disabled = true;
		if (allChoices[i].correct) b.classList.add("correct");
		else if (i === choice) b.classList.add("wrong");
	});
	if (session.current.type === "tiles") {
		renderTiles();
		$('[data-action="check-tiles"]').disabled = true;
	}
	renderFeedback();
	const next = $('[data-action="quiz-next"]');
	next?.focus({ preventScroll: true });
}
function renderFeedback() {
	const word = session.current.word;
	const result = session.results.get(word.id);
	const correct = result.correct;
	$("#skip-action").hidden = true;
	const message = correct
		? "✓ 这次想起来了。"
		: result.mistakes < 3
			? "再认识一次，稍后会重遇。"
			: "先记下它，留到下一轮巩固。";
	$("#answer-feedback").innerHTML =
		'<div class="feedback-actions"><button class="button primary" data-action="quiz-next">下一题 →</button>' +
		soundButton(word) +
		'</div><div class="answer-feedback ' +
		(correct ? "" : "incorrect") +
		'"><strong>' +
		message +
		'</strong><div class="answer-detail" lang="ja">' +
		esc(word.word) +
		"<small>" +
		esc(word.kana ? word.romaji : word.reading) +
		" · " +
		esc(word.meaning) +
		"</small></div>" +
		exampleHTML(word) +
		"</div>";
}
function renderSummary() {
	$(".credit-card").hidden = true;
	stopSound();
	const s = session.stats();
	const grouped = new Map();
	for (const r of session.results.values()) {
		const key = r.word.lessonId;
		if (!grouped.has(key))
			grouped.set(key, { total: 0, attempted: 0, correct: 0 });
		const group = grouped.get(key);
		group.total++;
		if (r.attempts) group.attempted++;
		if (r.firstCorrect) group.correct++;
	}
	const duration =
		s.duration < 60
			? `${s.duration} 秒`
			: `${Math.floor(s.duration / 60)} 分 ${s.duration % 60} 秒`;
	app.innerHTML = `<section class="session-wrap"><div class="summary-heading"><span class="summary-symbol" aria-hidden="true">✳</span><h1>${s.pending.length ? "这次，先到这里。" : "又向前了一小步。"}</h1><p>本轮${session.options.mode === "learn" ? "新学" : "复习"} · ${s.total} ${module === "kana" ? "个假名" : "个词"} · 用时 ${duration}<br>记住了多少，从下一次回想开始检验。</p></div><div class="stats-grid"><div class="stat"><strong>${s.attempted}<span style="display:inline"> / ${s.total}</span></strong><span>已测试词条</span></div><div class="stat"><strong>${s.accuracy === null ? "—" : s.accuracy + "%"}</strong><span>首次作答正确率</span></div><div class="stat"><strong>${s.corrected}</strong><span>错后已答对</span></div><div class="stat"><strong>${s.unresolved.length}</strong><span>仍需巩固</span></div></div><p class="summary-note">首次正确率按每个词第一次作答计算；本轮共作答 ${s.answers} 次，答对 ${s.correctAnswers} 次。${s.pending.length ? `另有 ${s.pending.length} 个词尚未测试。` : ""}数据只在本页本轮保留，关闭后清空。</p><div class="panel"><div class="panel-title"><span class="step">03</span><h2>把不熟悉的，再过一遍</h2></div>${s.missed.length ? `<p class="tiny">本轮有 ${s.missed.length} 个词出现过错误，其中 ${s.corrected} 个在最后一次尝试答对。</p><div class="result-list">${s.missed.map((r) => `<div class="result-item"><div><div class="result-word" lang="ja">${esc(r.word.word)}</div><small>${esc(r.word.kana ? r.word.romaji : r.word.reading)} · ${esc(r.word.meaning)}</small><small>${esc(sourceLabel(r.word))}</small></div><span class="result-status ${r.correct ? "recovered" : ""}">${r.correct ? "错后答对" : "仍需巩固"} · 错 ${r.mistakes} 次</span></div>`).join("")}</div>` : '<p class="tiny">本轮已测试的词条没有出现错误。下次可以扩大一点范围，或换成随机顺序。</p>'}<details style="margin-top:25px"><summary>查看各课统计</summary><table class="lesson-stats"><thead><tr><th>范围</th><th>已测 / 总数</th><th>首次答对</th></tr></thead><tbody>${[...grouped].map(([id, g]) => `<tr><td>${id === "kana" ? "五十音" : `${BOOKS.find((b) => b.id === lesson(id).book).label} 第 ${lesson(id).number} 课`}</td><td>${g.attempted} / ${g.total}</td><td>${g.correct}</td></tr>`).join("")}</tbody></table></details></div><div class="summary-actions">${s.missed.length ? '<button class="button primary" data-action="retry-mistakes">只练本轮错词</button>' : ""}${s.pending.length ? '<button class="button secondary" data-action="practice-pending">练未测词条</button>' : ""}<button class="button secondary" data-action="repeat">同一范围再来一轮</button><button class="button secondary" data-action="back-setup">重新选课</button><button class="button secondary" data-action="export">导出本轮总结</button></div></section>`;
	window.scrollTo({ top: 0, behavior: "instant" });
}
async function confirmAction(title, message, label) {
	const dialog = $("#confirm-dialog");
	$("#dialog-title").textContent = title;
	$("#dialog-message").textContent = message;
	$('button[value="confirm"]', dialog).textContent = label;
	dialog.returnValue = "";
	dialog.showModal();
	return new Promise((resolve) =>
		dialog.addEventListener(
			"close",
			() => resolve(dialog.returnValue === "confirm"),
			{ once: true },
		),
	);
}
function preview() {
	const pool = currentPool();
	const dialog = document.createElement("dialog");
	dialog.setAttribute("aria-label", "所选词条");
	dialog.innerHTML = `<form method="dialog"><h2>本次范围 · ${pool.length} ${module === "kana" ? "个假名" : "个词"}</h2><p class="tiny">本轮会${settings.order === "shuffle" ? "打乱顺序练习" : "按课顺序练习"}所选范围的全部 ${sessionCount()} 个${module === "kana" ? "假名" : "词条"}。</p><div class="word-preview">${pool.map((w) => `<div class="preview-item"><b lang="ja">${esc(w.word)}</b><small>${esc(w.kana ? w.romaji : w.reading)} · ${esc(w.meaning)}</small><small>${esc(sourceLabel(w))}</small></div>`).join("") || '<p class="tiny">还没有选择词条。</p>'}</div><button class="button primary wide">返回选课</button></form>`;
	document.body.append(dialog);
	dialog.addEventListener("close", () => dialog.remove(), { once: true });
	dialog.showModal();
}
function exportSummary() {
	const s = session.stats();
	const lines = [
		"Chiwa Dictation · 本轮学习总结",
		`生成时间：${new Date(session.finishedAt).toLocaleString("zh-CN")}`,
		`模式：${session.options.mode === "learn" ? "新学" : "复习"}`,
		`已测：${s.attempted}/${s.total}；首次正确率：${s.accuracy === null ? "未作答" : s.accuracy + "%"}；答题次数：${s.answers}`,
		`错后答对：${s.corrected}；仍需巩固：${s.unresolved.length}；未测：${s.pending.length}`,
		"",
		...[...session.results.values()].map(
			(r) =>
				`${r.word.word} [${r.word.kana ? r.word.romaji : r.word.reading}] ${r.word.meaning}\n${sourceLabel(r.word)} · ${!r.attempts ? "未测试" : r.mistakes ? (r.correct ? "错后答对" : "仍需巩固") : "首次答对"} · 错误 ${r.mistakes} 次`,
		),
	];
	const url = URL.createObjectURL(
		new Blob(["\ufeff" + lines.join("\n")], {
			type: "text/plain;charset=utf-8",
		}),
	);
	const a = document.createElement("a");
	a.href = url;
	a.download = "Chiwa-Dictation-本轮总结.txt";
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
app.addEventListener("change", (event) => {
	const target = event.target;
	if (!target.name || session) return;
	if (target.name === "list") {
		const value = Number(target.value);
		if (!target.checked && settings.lists.length === 1) {
			target.checked = true;
			toast("单词Ⅰ和Ⅱ至少保留一项。");
			return;
		}
		settings.lists = target.checked
			? [...settings.lists, value]
			: settings.lists.filter((n) => n !== value);
	} else if (target.name === "listening") {
		settings.listening = target.checked;
		audioFailed = false;
		refreshVoices();
	} else settings[target.name] = target.value;
	save();
	renderSetup();
});
app.addEventListener("click", async (event) => {
	const button = event.target.closest("button");
	if (!button || button.disabled) return;
	if (button.dataset.speak) {
		speak(button.dataset.speak);
		return;
	}
	if (button.dataset.module) {
		module = button.dataset.module;
		renderSetup();
		return;
	}
	if (button.dataset.book) {
		activeBook = button.dataset.book;
		renderSetup();
		return;
	}
	if (button.dataset.course) {
		settings.selected = courseLessons(Number(button.dataset.course));
		activeBook = lesson(settings.selected[0]).book;
		save();
		renderSetup();
		toast(`已选择日语 ${button.dataset.course}，可继续逐课调整。`);
		return;
	}
	if (button.dataset.lesson) {
		const id = button.dataset.lesson;
		settings.selected = settings.selected.includes(id)
			? settings.selected.filter((s) => s !== id)
			: [...settings.selected, id];
		save();
		renderSetup();
		return;
	}
	if (button.dataset.unit) {
		toggleLessons(
			data.lessons
				.filter(
					(l) =>
						l.book === activeBook &&
						l.unit === Number(button.dataset.unit) &&
						!l.exam,
				)
				.map((l) => l.id),
		);
		return;
	}
	if (button.dataset.kanaRow) {
		const id = button.dataset.kanaRow;
		settings.kanaRows = settings.kanaRows.includes(id)
			? settings.kanaRows.filter((s) => s !== id)
			: [...settings.kanaRows, id];
		save();
		renderSetup();
		return;
	}
	if (button.dataset.kanaGroup) {
		settings.kanaRows = KANA_ROWS.filter(
			(r) =>
				button.dataset.kanaGroup === "all" ||
				r.group === button.dataset.kanaGroup,
		).map((r) => r.id);
		save();
		renderSetup();
		return;
	}
	if (button.dataset.choice !== undefined && session) {
		const i = Number(button.dataset.choice);
		submitAnswer(allChoices[i].correct, i);
		return;
	}
	if (
		button.dataset.tile !== undefined &&
		session &&
		!session.current.answered
	) {
		pickedTiles.push(Number(button.dataset.tile));
		renderTiles();
		return;
	}
	if (
		button.dataset.tileRemove !== undefined &&
		session &&
		!session.current.answered
	) {
		pickedTiles.splice(Number(button.dataset.tileRemove), 1);
		renderTiles();
		return;
	}
	const action = button.dataset.action;
	if (action === "clear-lessons") {
		settings.selected = [];
		save();
		renderSetup();
	}
	if (action === "clear-kana") {
		settings.kanaRows = [];
		save();
		renderSetup();
	}
	if (action === "toggle-book")
		toggleLessons(
			data.lessons
				.filter((l) => l.book === activeBook && !l.exam)
				.map((l) => l.id),
		);
	if (action === "preview") preview();
	if (action === "start") startSession();
	if (action === "test-sound") speak("こんにちは。いっしょに勉強しましょう。");
	if (action === "reload-voices") {
		refreshVoices();
		toast(
			japaneseVoices.length
				? "已检测到日语语音。"
				: "仍未检测到日语语音，可以先用静音模式。",
		);
	}
	if (action === "kana-sounds") speak("さか。さっか。おばさん。おばあさん。");
	if (action === "learn-next") {
		session.advanceLearning();
		renderSession();
	}
	if (action === "play-question") speak(session.current.word.reading, true);
	if (action === "tile-undo" && !session.current.answered) {
		pickedTiles.pop();
		renderTiles();
	}
	if (action === "tile-clear" && !session.current.answered) {
		pickedTiles = [];
		renderTiles();
	}
	if (action === "check-tiles") {
		if (!pickedTiles.length) {
			toast("先点击假名拼出答案，或选择“还想不起来”。");
			return;
		}
		submitAnswer(
			normalizeKana(pickedTiles.map((i) => tileBank[i]).join("")) ===
				normalizeKana(session.current.word.reading),
		);
	}
	if (action === "unknown") submitAnswer(false);
	if (action === "quiz-next") {
		session.next();
		renderSession();
	}
	if (
		action === "end-session" &&
		(await confirmAction(
			"结束这次练习？",
			"会展示已完成部分的统计；未测试的词会单独列出。",
			"查看本轮总结",
		))
	) {
		session.finish();
		renderSummary();
	}
	if (action === "back-setup") renderSetup();
	if (action === "repeat") {
		const words = [...sessionWords];
		startSession(words);
	}
	if (action === "retry-mistakes") {
		const words = session.stats().missed.map((r) => r.word);
		settings.mode = "review";
		startSession(words);
	}
	if (action === "practice-pending") {
		const words = session.stats().pending.map((r) => r.word);
		startSession(words);
	}
	if (action === "export") exportSummary();
});
function toggleLessons(ids) {
	const all = ids.every((id) => settings.selected.includes(id));
	settings.selected = all
		? settings.selected.filter((id) => !ids.includes(id))
		: [...new Set([...settings.selected, ...ids])];
	save();
	renderSetup();
}
$("#clear-settings").addEventListener("click", async () => {
	if (
		session?.phase !== "summary" &&
		session &&
		!(await confirmAction(
			"清除设置并返回首页？",
			"本轮进度会清空，选课、数量等设置恢复默认值。",
			"清除设置",
		))
	)
		return;
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {}
	settings = structuredClone(defaults);
	module = "words";
	activeBook = "b1";
	if (data) renderSetup();
	toast("已清除本工具保存的设置。");
});
document.addEventListener("keydown", (event) => {
	if (
		!session ||
		session.phase === "summary" ||
		event.altKey ||
		event.ctrlKey ||
		event.metaKey ||
		$("dialog[open]") ||
		/SELECT|INPUT/.test(event.target.tagName)
	)
		return;
	if (event.key === "Enter" && event.target.tagName !== "BUTTON") {
		const button =
			$('[data-action="quiz-next"]') || $('[data-action="learn-next"]');
		if (button) {
			event.preventDefault();
			button.click();
		}
	}
	if (
		/^[1-4]$/.test(event.key) &&
		session.phase === "quiz" &&
		!session.current.answered
	) {
		const button = $(`[data-choice="${Number(event.key) - 1}"]`);
		if (button) {
			event.preventDefault();
			button.click();
		}
	}
});
window.addEventListener("beforeunload", (event) => {
	stopSound();
	if (session && session.phase !== "summary") {
		event.preventDefault();
		event.returnValue = "";
	}
});
document.addEventListener("visibilitychange", () => {
	if (document.hidden) stopSound();
});
if ("speechSynthesis" in window) {
	speechSynthesis.addEventListener("voiceschanged", refreshVoices);
	refreshVoices();
}
async function init() {
	try {
		const response = await fetch(
			new URL("./data/vocabulary.json", import.meta.url),
		);
		if (!response.ok) throw new Error("词库请求失败");
		data = await response.json();
		if (
			!Array.isArray(data.words) ||
			!Array.isArray(data.lessons) ||
			!data.words.length
		)
			throw new Error("词库格式错误");
		settings.selected = settings.selected.filter((id) => lesson(id));
		$("#loading").hidden = true;
		renderSetup();
	} catch {
		$("#loading").hidden = true;
		app.innerHTML =
			'<div class="panel error-panel"><h1>词库暂时没有准备好</h1><p>请检查网络后重新加载。如果是本地运行，请通过 HTTP 服务访问本目录。</p><button class="button primary" id="retry-load">重新加载</button></div>';
		$("#retry-load").addEventListener("click", init);
	}
}
init();
