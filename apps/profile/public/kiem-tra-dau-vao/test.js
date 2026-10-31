import {
	buildPlacementSummary,
	flattenQuestions,
	gradeAttempt,
} from "./grading.js";

const STORAGE_KEY = "msmy_placement_attempt_v1";
const ZALO_URL = "https://zalo.me/0929060994";

const COURSE_LABELS = {
	"ielts-foundation": "IELTS Foundation (0–3.0)",
	"ielts-first-step": "IELTS First Step (3.0–4.0)",
	"ielts-pre": "Pre-IELTS (4.0–5.0)",
	"ielts-advanced": "IELTS Advanced (6.0–7.0+)",
};

const VALID_STEPS = new Set(["intro", "part1", "part2", "result"]);
const OPTION_LETTERS = ["A", "B", "C", "D"];

let isPageUnloading = false;
if (typeof window !== "undefined") {
	window.addEventListener("beforeunload", () => {
		isPageUnloading = true;
	});
	window.addEventListener("pagehide", () => {
		isPageUnloading = true;
	});
}

function createEl(tag, className, text) {
	const el = document.createElement(tag);
	if (className) el.className = className;
	if (text !== undefined && text !== null) {
		el.textContent = String(text);
	}
	return el;
}

function loadSavedAttempt(test) {
	const allQuestions = flattenQuestions(test);
	const validQuestionIds = new Set(allQuestions.map((q) => q.id));
	const clipMaxPlays = new Map();
	for (const part of test.parts ?? []) {
		if (Array.isArray(part.clips)) {
			for (const clip of part.clips) {
				clipMaxPlays.set(clip.id, Number(clip.maxPlays) || 2);
			}
		}
	}

	const fresh = {
		version: test.version,
		step: "intro",
		answers: {},
		plays: {},
		result: null,
	};

	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return fresh;
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return fresh;
		if (parsed.version !== test.version) {
			localStorage.removeItem(STORAGE_KEY);
			return fresh;
		}

		const answers = {};
		if (parsed.answers && typeof parsed.answers === "object") {
			for (const [qId, val] of Object.entries(parsed.answers)) {
				if (
					validQuestionIds.has(qId) &&
					Number.isInteger(val) &&
					val >= 0 &&
					val < 4
				) {
					answers[qId] = val;
				}
			}
		}

		const plays = {};
		if (parsed.plays && typeof parsed.plays === "object") {
			for (const [clipId, max] of clipMaxPlays.entries()) {
				const rawCount = parsed.plays[clipId];
				if (Number.isInteger(rawCount) && rawCount > 0) {
					plays[clipId] = Math.min(max, rawCount);
				}
			}
		}

		const step = VALID_STEPS.has(parsed.step) ? parsed.step : "intro";
		const result =
			step === "result" || (parsed.result && typeof parsed.result === "object")
				? gradeAttempt(test, answers)
				: null;

		return {
			version: test.version,
			step: result && step === "result" ? "result" : step,
			answers,
			plays,
			result,
		};
	} catch {
		return fresh;
	}
}

function saveAttempt(state) {
	try {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				version: state.version,
				step: state.step,
				answers: state.answers,
				plays: state.plays,
				result: state.result,
			}),
		);
	} catch {
		// Storage blocked (e.g., strict private mode); attempt still works in memory
	}
}

function clearAttempt(test) {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Ignore storage errors
	}
	return {
		version: test.version,
		step: "intro",
		answers: {},
		plays: {},
		result: null,
	};
}

function renderError(root, message) {
	root.replaceChildren();
	const card = createEl("section", "error-card");
	card.appendChild(createEl("span", "kicker-pill", "Thông báo kỹ thuật"));
	card.appendChild(
		createEl("h1", "", "Không thể tải đề kiểm tra đầu vào lúc này"),
	);
	card.appendChild(createEl("p", "muted-copy", message));

	const actions = createEl("div", "btn-row");
	const retryBtn = createEl("button", "btn btn-primary", "Thử Tải Lại Trang");
	retryBtn.type = "button";
	retryBtn.addEventListener("click", () => window.location.reload());

	const zaloLink = createEl(
		"a",
		"btn btn-gold",
		"💬 Nhắn Zalo Cô Mỹ: 0929.060.994",
	);
	zaloLink.href = ZALO_URL;
	zaloLink.target = "_blank";
	zaloLink.rel = "noopener";

	actions.append(retryBtn, zaloLink);
	card.appendChild(actions);
	root.appendChild(card);
}

function createStepperBar(test, state) {
	const bar = createEl("div", "stepper-bar");
	const pills = createEl("div", "stepper-pills");

	const steps = [
		{ id: "intro", label: "1. Giới thiệu" },
		{ id: "part1", label: "2. Phần 1: Vocab + Grammar (15 câu)" },
		{ id: "part2", label: "3. Phần 2: Listening (15 câu)" },
		{ id: "result", label: "4. Kết quả & Lộ trình" },
	];

	const order = ["intro", "part1", "part2", "result"];
	const currentIdx = order.indexOf(state.step);

	for (const [idx, s] of steps.entries()) {
		let cls = "step-pill";
		if (idx === currentIdx) cls += " is-active";
		else if (idx < currentIdx) cls += " is-done";
		pills.appendChild(createEl("span", cls, s.label));
	}

	const totalQuestions = flattenQuestions(test).length;
	const answeredCount = Object.keys(state.answers).length;
	const counter = createEl(
		"span",
		"progress-counter",
		`Đã trả lời: ${answeredCount}/${totalQuestions} câu`,
	);

	bar.append(pills, counter);
	return bar;
}

function createQuestionFieldset(question, displayIndex, state, onAnswerChange) {
	const fieldset = createEl("fieldset", "question-card");
	fieldset.dataset.questionId = question.id;

	const legend = createEl("legend", "question-legend");
	const kindLabel =
		question.kind === "grammar"
			? "Ngữ pháp"
			: question.kind === "vocab"
				? "Từ vựng"
				: "Listening";
	legend.appendChild(
		createEl("span", "question-meta", `Câu ${displayIndex} • ${kindLabel}`),
	);
	legend.appendChild(document.createTextNode(question.prompt));
	fieldset.appendChild(legend);

	const optionsList = createEl("div", "options-list");
	const selectedIdx = state.answers[question.id];

	question.options.forEach((optText, optIdx) => {
		const label = createEl(
			"label",
			selectedIdx === optIdx ? "option-label is-selected" : "option-label",
		);
		const radio = document.createElement("input");
		radio.type = "radio";
		radio.name = `q_${question.id}`;
		radio.value = String(optIdx);
		radio.checked = selectedIdx === optIdx;

		radio.addEventListener("change", () => {
			state.answers[question.id] = optIdx;
			saveAttempt(state);
			for (const sibling of optionsList.querySelectorAll(".option-label")) {
				sibling.classList.remove("is-selected");
			}
			label.classList.add("is-selected");
			onAnswerChange();
		});

		const letterPrefix = OPTION_LETTERS[optIdx]
			? `${OPTION_LETTERS[optIdx]}. `
			: "";
		const span = createEl("span", "", `${letterPrefix}${optText}`);
		label.append(radio, span);
		optionsList.appendChild(label);
	});

	fieldset.appendChild(optionsList);
	return fieldset;
}

function renderApp(root, test, state) {
	let activeClipsCleanup = [];
	const cleanupActiveAudio = () => {
		for (const stopFn of activeClipsCleanup) {
			stopFn();
		}
		activeClipsCleanup = [];
	};

	const rerender = (nextStep) => {
		cleanupActiveAudio();
		if (nextStep) {
			state.step = nextStep;
			saveAttempt(state);
		}
		root.replaceChildren();
		root.appendChild(createStepperBar(test, state));

		if (state.step === "intro") {
			renderIntroStep(root, test, state, rerender);
		} else if (state.step === "part1") {
			renderPart1Step(root, test, state, rerender);
		} else if (state.step === "part2") {
			renderPart2Step(root, test, state, rerender, activeClipsCleanup);
		} else if (state.step === "result") {
			renderResultStep(root, test, state, rerender);
		}
		window.scrollTo({ top: 0, behavior: "smooth" });
		if (nextStep) {
			const heading = root.querySelector("h1");
			if (heading) {
				heading.tabIndex = -1;
				heading.focus({ preventScroll: true });
			}
		}
	};

	rerender();
}

function renderIntroStep(root, test, state, rerender) {
	const card = createEl("section", "intro-card");
	card.appendChild(
		createEl(
			"span",
			"kicker-pill",
			"Bài Kiểm Tra Đầu Vào Chẩn Đoán Trình Độ (Miễn Phí 100%)",
		),
	);
	card.appendChild(
		createEl(
			"h1",
			"",
			"Đánh Giá Năng Lực Tiếng Anh Đầu Vào 30 Câu (Vocab, Grammar & Listening)",
		),
	);
	card.appendChild(
		createEl(
			"p",
			"muted-copy",
			"Bài kiểm tra giúp xác định mức CEFR hiện tại của bạn (A1 – B2+) và gợi ý lộ trình học phù hợp nhất cùng cô Đỗ Thị Thục Mỹ. Bạn không cần đăng nhập hay điền thông tin cá nhân trước khi làm bài.",
		),
	);

	const hasSavedProgress =
		Object.keys(state.answers).length > 0 ||
		Object.values(state.plays).some((n) => Number(n) > 0);

	if (hasSavedProgress) {
		const banner = createEl("div", "resume-banner");
		banner.appendChild(
			createEl(
				"span",
				"resume-banner-text",
				`Bạn đang có bài làm dở (${Object.keys(state.answers).length}/30 câu đã chọn). Bạn có thể tiếp tục hoặc xóa để làm lại từ đầu.`,
			),
		);
		const bannerActions = createEl("div", "header-actions");
		const resumeBtn = createEl(
			"button",
			"btn btn-primary btn-sm",
			"Tiếp Tục Bài Đang Làm →",
		);
		resumeBtn.type = "button";
		resumeBtn.id = "resumeAttemptBtn";
		resumeBtn.addEventListener("click", () => rerender("part1"));

		const resetBtn = createEl(
			"button",
			"btn btn-outline btn-sm",
			"Làm Lại Từ Đầu",
		);
		resetBtn.type = "button";
		resetBtn.id = "resetAttemptBtn";
		resetBtn.addEventListener("click", () => {
			const fresh = clearAttempt(test);
			state.step = fresh.step;
			state.answers = fresh.answers;
			state.plays = fresh.plays;
			state.result = fresh.result;
			rerender("intro");
		});
		bannerActions.append(resumeBtn, resetBtn);
		banner.appendChild(bannerActions);
		card.appendChild(banner);
	}

	const grid = createEl("div", "intro-grid");
	const features = [
		{
			title: "Phần 1: Vocab + Grammar (15 câu)",
			desc: "8 câu ngữ pháp bản chất và 7 câu từ vựng học thuật trải đều từ mức A1 đến C1.",
		},
		{
			title: "Phần 2: Listening (5 đoạn • 15 câu)",
			desc: "5 đoạn nghe độc thoại và hội thoại thực tế (A2 – C1), mỗi đoạn gồm 3 câu hỏi trắc nghiệm.",
		},
		{
			title: "Quy định làm bài & Lưu tự động",
			desc: "Không giới hạn thời gian. Mỗi đoạn âm thanh được nghe tối đa 2 lần. Câu trả lời tự động lưu khi tải lại trang.",
		},
	];
	for (const f of features) {
		const box = createEl("div", "intro-feature");
		box.appendChild(createEl("strong", "", f.title));
		box.appendChild(createEl("p", "", f.desc));
		grid.appendChild(box);
	}
	card.appendChild(grid);

	const actions = createEl("div", "btn-row");
	const startBtn = createEl(
		"button",
		"btn btn-primary",
		"📝 Bắt Đầu Làm Bài Kiểm Tra",
	);
	startBtn.type = "button";
	startBtn.id = "startTestBtn";
	startBtn.addEventListener("click", () => rerender("part1"));

	const homeLink = createEl("a", "btn btn-outline", "← Quay Lại Trang Chủ");
	homeLink.href = "../";

	actions.append(startBtn, homeLink);
	card.appendChild(actions);
	root.appendChild(card);
}

function updateProgressCounter(root, test, state) {
	const counter = root.querySelector(".progress-counter");
	if (!counter) return;
	const totalQuestions = flattenQuestions(test).length;
	const answeredCount = Object.keys(state.answers).length;
	counter.textContent = `Đã trả lời: ${answeredCount}/${totalQuestions} câu`;
}

function renderPart1Step(root, test, state, rerender) {
	const part1 = test.parts.find((p) => p.id === "vocab-grammar");
	const card = createEl("section", "step-card");
	card.appendChild(createEl("span", "kicker-pill", "Phần 1 / 2"));
	card.appendChild(
		createEl("h1", "", "Phần 1: Ngữ Pháp & Từ Vựng (Vocab + Grammar)"),
	);
	card.appendChild(
		createEl(
			"p",
			"muted-copy",
			"Chọn đáp án đúng nhất cho 15 câu bên dưới. Bạn có thể chuyển sang Phần 2 bất cứ lúc nào và quay lại chỉnh sửa trước khi nộp bài.",
		),
	);

	const stack = createEl("div", "questions-stack");
	const questions = part1?.questions ?? [];
	questions.forEach((q, idx) => {
		stack.appendChild(
			createQuestionFieldset(q, idx + 1, state, () =>
				updateProgressCounter(root, test, state),
			),
		);
	});
	card.appendChild(stack);

	const actions = createEl("div", "btn-row");
	const backBtn = createEl("button", "btn btn-outline", "← Về Mục Giới Thiệu");
	backBtn.type = "button";
	backBtn.addEventListener("click", () => rerender("intro"));

	const nextBtn = createEl(
		"button",
		"btn btn-primary",
		"Tiếp Tục Sang Phần 2: Listening (15 câu) →",
	);
	nextBtn.type = "button";
	nextBtn.id = "toPart2Btn";
	nextBtn.addEventListener("click", () => rerender("part2"));

	actions.append(backBtn, nextBtn);
	card.appendChild(actions);
	root.appendChild(card);
}

function renderPart2Step(root, test, state, rerender, activeClipsCleanup) {
	const part2 = test.parts.find((p) => p.id === "listening");
	const card = createEl("section", "step-card");
	card.appendChild(createEl("span", "kicker-pill", "Phần 2 / 2"));
	card.appendChild(
		createEl("h1", "", "Phần 2: Nghe Hiểu (Listening – 5 Đoạn Audio)"),
	);
	card.appendChild(
		createEl(
			"p",
			"muted-copy",
			"Mỗi đoạn âm thanh được phát tối đa 2 lần và không thể tua. Hãy đọc trước 3 câu hỏi của từng đoạn rồi bấm nút Phát đoạn nghe.",
		),
	);

	const clips = part2?.clips ?? [];
	let questionNumber = 16;
	const clipControllers = [];

	const pauseAllOtherClips = (exceptClipId) => {
		for (const ctrl of clipControllers) {
			if (ctrl.clipId !== exceptClipId) {
				ctrl.stopIfPlaying();
			}
		}
	};

	for (const clip of clips) {
		const maxPlays = Number(clip.maxPlays) || 2;
		const block = createEl("div", "clip-block");
		block.dataset.clipBlock = clip.id;

		const header = createEl("div", "clip-header");
		const titleGroup = createEl("div", "clip-title-group");
		titleGroup.appendChild(
			createEl("h3", "", clip.title || `Đoạn nghe ${clip.id}`),
		);
		titleGroup.appendChild(
			createEl(
				"p",
				"muted-copy",
				`Mức độ: ${clip.level} • Tối đa ${maxPlays} lần nghe`,
			),
		);

		const controls = createEl("div", "clip-controls");
		const playBtn = createEl("button", "btn btn-primary btn-sm");
		playBtn.type = "button";
		playBtn.dataset.playClip = clip.id;

		const statusEl = createEl("span", "clip-status");
		statusEl.setAttribute("aria-live", "polite");
		statusEl.dataset.clipStatus = clip.id;

		const audio = document.createElement("audio");
		audio.preload = "none";
		audio.src = `./${clip.src.replace(/^\.?\//, "")}`;
		audio.dataset.audioClip = clip.id;

		let activeSession = false;
		let chargedCurrentAttempt = false;

		const getPlays = () => {
			const count = state.plays[clip.id];
			return Number.isInteger(count) && count > 0
				? Math.min(maxPlays, count)
				: 0;
		};

		const updateClipUi = (errorMessage = "") => {
			const used = getPlays();
			const remaining = Math.max(0, maxPlays - used);
			statusEl.classList.remove("is-exhausted", "is-error");

			if (errorMessage) {
				playBtn.disabled = remaining <= 0;
				playBtn.textContent =
					remaining > 0 ? "▶ Phát đoạn nghe" : "🔒 Đã hết lượt nghe";
				statusEl.textContent = errorMessage;
				statusEl.classList.add("is-error");
				return;
			}

			if (activeSession) {
				playBtn.disabled = true;
				playBtn.textContent = "🔊 Đang phát đoạn nghe...";
				statusEl.textContent = `Đang phát (còn ${remaining}/${maxPlays} lượt nghe sau lượt này)`;
				return;
			}

			if (remaining <= 0) {
				playBtn.disabled = true;
				playBtn.textContent = "🔒 Đã hết lượt nghe";
				statusEl.textContent = `Đã hết lượt nghe (0/${maxPlays} lượt còn lại)`;
				statusEl.classList.add("is-exhausted");
				return;
			}

			playBtn.disabled = false;
			playBtn.textContent =
				used === 0 ? "▶ Phát đoạn nghe" : "▶ Phát lại đoạn nghe";
			statusEl.textContent = `Còn ${remaining}/${maxPlays} lượt nghe`;
		};

		audio.addEventListener("playing", () => {
			if (!activeSession) return;
			if (!chargedCurrentAttempt) {
				chargedCurrentAttempt = true;
				state.plays[clip.id] = Math.min(maxPlays, getPlays() + 1);
				saveAttempt(state);
			}
			updateClipUi();
		});

		audio.addEventListener("ended", () => {
			activeSession = false;
			chargedCurrentAttempt = false;
			updateClipUi();
		});

		const refundPlayIfCharged = () => {
			if (!chargedCurrentAttempt) return;
			const nextCount = Math.max(0, getPlays() - 1);
			if (nextCount > 0) {
				state.plays[clip.id] = nextCount;
			} else {
				delete state.plays[clip.id];
			}
			saveAttempt(state);
		};

		audio.addEventListener("error", () => {
			if (isPageUnloading || !activeSession) return;
			refundPlayIfCharged();
			activeSession = false;
			chargedCurrentAttempt = false;
			updateClipUi(
				"Không tải được âm thanh – không bị trừ lượt nghe. Vui lòng thử lại.",
			);
		});

		playBtn.addEventListener("click", () => {
			if (activeSession || getPlays() >= maxPlays) return;
			pauseAllOtherClips(clip.id);
			activeSession = true;
			chargedCurrentAttempt = false;
			updateClipUi();
			try {
				audio.currentTime = 0;
			} catch {
				// Ignore currentTime reset before metadata is loaded
			}
			const playPromise = audio.play();
			if (playPromise && typeof playPromise.catch === "function") {
				playPromise.catch(() => {
					if (isPageUnloading || !activeSession) return;
					refundPlayIfCharged();
					activeSession = false;
					chargedCurrentAttempt = false;
					updateClipUi(
						"Không phát được âm thanh – không bị trừ lượt nghe. Vui lòng thử lại.",
					);
				});
			}
		});

		const stopIfPlaying = () => {
			if (!activeSession && audio.paused) return;
			activeSession = false;
			chargedCurrentAttempt = false;
			try {
				audio.pause();
				audio.currentTime = 0;
			} catch {
				// Ignore pause errors
			}
			updateClipUi();
		};

		clipControllers.push({ clipId: clip.id, stopIfPlaying });
		activeClipsCleanup.push(stopIfPlaying);
		updateClipUi();

		controls.append(playBtn, statusEl, audio);
		header.append(titleGroup, controls);
		block.appendChild(header);

		const stack = createEl("div", "questions-stack");
		for (const q of clip.questions ?? []) {
			stack.appendChild(
				createQuestionFieldset(q, questionNumber, state, () =>
					updateProgressCounter(root, test, state),
				),
			);
			questionNumber += 1;
		}
		block.appendChild(stack);
		card.appendChild(block);
	}

	const confirmHost = createEl("div");
	card.appendChild(confirmHost);

	const finalizeSubmission = () => {
		state.result = gradeAttempt(test, state.answers);
		rerender("result");
	};

	const actions = createEl("div", "btn-row");
	const backBtn = createEl(
		"button",
		"btn btn-outline",
		"← Quay Lại Phần 1 (Vocab + Grammar)",
	);
	backBtn.type = "button";
	backBtn.addEventListener("click", () => rerender("part1"));

	const submitBtn = createEl(
		"button",
		"btn btn-gold",
		"✨ Nộp Bài & Xem Kết Quả Xếp Lớp",
	);
	submitBtn.type = "button";
	submitBtn.id = "submitTestBtn";
	submitBtn.addEventListener("click", () => {
		const totalQuestions = flattenQuestions(test).length;
		const answeredCount = Object.keys(state.answers).length;
		const unanswered = totalQuestions - answeredCount;
		if (unanswered <= 0) {
			finalizeSubmission();
			return;
		}

		confirmHost.replaceChildren();
		const confirmBox = createEl("div", "confirm-submit-box");
		confirmBox.id = "unansweredConfirmBox";
		confirmBox.appendChild(
			createEl(
				"p",
				"",
				`Bạn còn ${unanswered}/${totalQuestions} câu chưa chọn đáp án. Câu bỏ trống sẽ được tính là 0 điểm. Bạn có chắc chắn muốn nộp bài ngay?`,
			),
		);
		const confirmActions = createEl("div", "header-actions");
		const confirmYes = createEl(
			"button",
			"btn btn-primary btn-sm",
			"Vẫn Nộp Bài Ngay",
		);
		confirmYes.type = "button";
		confirmYes.id = "confirmSubmitBtn";
		confirmYes.addEventListener("click", finalizeSubmission);

		const confirmCancel = createEl(
			"button",
			"btn btn-outline btn-sm",
			"Quay Lại Làm Tiếp",
		);
		confirmCancel.type = "button";
		confirmCancel.id = "cancelSubmitBtn";
		confirmCancel.addEventListener("click", () =>
			confirmHost.replaceChildren(),
		);

		confirmActions.append(confirmYes, confirmCancel);
		confirmBox.appendChild(confirmActions);
		confirmHost.appendChild(confirmBox);
	});

	actions.append(backBtn, submitBtn);
	card.appendChild(actions);
	root.appendChild(card);
}

function renderResultStep(root, test, state, rerender) {
	const result = gradeAttempt(test, state.answers);
	state.result = result;
	saveAttempt(state);

	const summaryText = buildPlacementSummary(result);
	const courseCode = result.band.course;
	const courseLabel = COURSE_LABELS[courseCode] || courseCode;

	const card = createEl("section", "result-card");
	card.id = "testResultCard";
	card.appendChild(
		createEl("span", "kicker-pill", "Hoàn Thành Bài Kiểm Tra Đầu Vào"),
	);
	card.appendChild(
		createEl("h1", "", "Kết Quả Đánh Giá Trình Độ & Lộ Trình Gợi Ý"),
	);
	card.appendChild(createEl("p", "muted-copy", summaryText));

	const hero = createEl("div", "result-hero");
	hero.appendChild(
		createEl("h2", "", `Trình độ CEFR ước tính: ${result.band.cefr}`),
	);
	hero.appendChild(
		createEl(
			"p",
			"",
			"Đáp án chi tiết được bảo mật để cô Thục Mỹ trực tiếp phân tích lỗ hổng tư duy và chữa bài 1-1 cùng bạn.",
		),
	);

	const scoreGrid = createEl("div", "score-grid");
	const items = [
		{
			label: "Tổng điểm bài test",
			value: `${result.totalScore}/${result.maxScore}`,
			id: "totalScoreValue",
		},
		{
			label: "Phần 1: Vocab + Grammar",
			value: `${result.vocabGrammar.score}/${result.vocabGrammar.total}`,
			id: "vgScoreValue",
		},
		{
			label: "Phần 2: Listening",
			value: `${result.listening.score}/${result.listening.total}`,
			id: "listeningScoreValue",
		},
		{
			label: "Mức CEFR ước tính",
			value: result.band.cefr,
			id: "cefrBandValue",
		},
	];
	for (const item of items) {
		const box = createEl("div", "score-box");
		box.appendChild(createEl("span", "", item.label));
		const strong = createEl("strong", "", item.value);
		strong.id = item.id;
		box.appendChild(strong);
		scoreGrid.appendChild(box);
	}
	hero.appendChild(scoreGrid);
	card.appendChild(hero);

	const recBox = createEl("div", "recommendation-box");
	recBox.appendChild(
		createEl("h3", "", `Khóa học gợi ý tham khảo: ${courseLabel}`),
	);
	recBox.appendChild(
		createEl(
			"p",
			"",
			"Khi bấm nút đăng ký bên dưới, điểm kiểm tra đầu vào và khóa học gợi ý sẽ được điền sẵn vào biểu mẫu tư vấn. Bạn hoàn toàn có thể đổi sang khóa Tiếng Anh Giao Tiếp / Công Sở hoặc khóa học khác ngay trên biểu mẫu.",
		),
	);
	recBox.appendChild(
		createEl(
			"p",
			"recommendation-note",
			"🎁 Quyền lợi kèm theo: Bạn được tặng thêm 01 buổi Khám Bệnh Tiếng Anh 1-1 (30 phút qua Google Meet) trực tiếp cùng cô Thục Mỹ để kiểm tra kỹ năng Nói (Speaking) và chốt lộ trình cá nhân hóa.",
		),
	);
	card.appendChild(recBox);

	const actions = createEl("div", "btn-row");
	const registerParams = new URLSearchParams({
		ketqua: summaryText,
		khoa: courseCode,
	});
	const registerLink = createEl(
		"a",
		"btn btn-gold",
		"🎓 Đăng Ký Theo Kết Quả Này",
	);
	registerLink.id = "registerWithResultBtn";
	registerLink.href = `../?${registerParams.toString()}#dang-ky-tu-van`;

	const zaloLink = createEl(
		"a",
		"btn btn-primary",
		"💬 Nhắn Kết Quả Qua Zalo Cô Mỹ: 0929.060.994",
	);
	zaloLink.href = ZALO_URL;
	zaloLink.target = "_blank";
	zaloLink.rel = "noopener";

	const retryBtn = createEl("button", "btn btn-outline", "🔄 Làm Lại");
	retryBtn.type = "button";
	retryBtn.id = "retryTestBtn";
	retryBtn.addEventListener("click", () => {
		const fresh = clearAttempt(test);
		state.step = fresh.step;
		state.answers = fresh.answers;
		state.plays = fresh.plays;
		state.result = fresh.result;
		rerender("intro");
	});

	actions.append(registerLink, zaloLink, retryBtn);
	card.appendChild(actions);
	root.appendChild(card);
}

async function init() {
	const root = document.getElementById("appRoot");
	if (!root) return;
	try {
		const res = await fetch("./questions.json", { cache: "no-cache" });
		if (!res.ok) {
			throw new Error(`HTTP ${res.status}`);
		}
		const test = await res.json();
		if (!test || !Array.isArray(test.parts) || !Array.isArray(test.bands)) {
			throw new Error("Invalid schema");
		}
		const state = loadSavedAttempt(test);
		renderApp(root, test, state);
	} catch {
		renderError(
			root,
			"Hệ thống chưa tải được bộ câu hỏi kiểm tra đầu vào. Vui lòng kiểm tra kết nối mạng rồi tải lại trang, hoặc nhắn trực tiếp qua Zalo để cô Thục Mỹ gửi bài test và xếp lịch tư vấn 1-1.",
		);
	}
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
	init();
}
