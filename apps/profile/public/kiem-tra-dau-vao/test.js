import {
	buildProvisionalSummary,
	canReplaySpeakingPrompt,
	computeSpeechFallbackTimeoutMs,
	countObjectiveProgress,
	countReadingQuestions,
	countWords,
	createInitialSpeakingSession,
	pickSupportedRecorderMime,
	resolveReadingRenderState,
	resolveRestoredAttemptStep,
	resolveSpeakingStatusDisplay,
	resolveSpeakingStepState,
	resolveSpeakingSubmitDecision,
	resolveSpeakingUploadMeta,
	resolveTaskTimings,
	resolveWritingPromptState,
	scoreObjectiveTest,
	startSpeakingTaskReading,
	stripInlineCefrLabel,
	transitionSpeakingAfterReading,
	transitionSpeakingNextTask,
	transitionSpeakingToAnswer,
} from "./grading.js";
import {
	buildLeadPayload,
	buildPlacementSubmissionLead,
	LEAD_NAME_MAX,
	leadErrorMessage,
	PLACEMENT_COURSE_GROUPS,
	PLACEMENT_STUDY_MODES,
	validateLeadForm,
} from "./lead-gate.js";

const DEFAULT_API_BASE = "https://api.teacheros.io.vn";
const ZALO_URL = "https://zalo.me/0929060994";
const STORAGE_KEY = "msmy_placement_attempt_v2";
const LEAD_DRAFT_KEY = "msmy_lead_draft_v1";

const RECOMMENDED_TIMER_SECONDS = 40 * 60;
const SPEAKING_MAX_BYTES = 50 * 1024 * 1024;
const OPTION_LETTERS = ["A", "B", "C", "D"];

const SKILL_STEPS = [
	{ id: "listening", shortLabel: "1. Listening", title: "Phần 1 · Listening" },
	{
		id: "vocab-grammar",
		shortLabel: "2. Grammar & Vocab",
		title: "Phần 2 · Grammar & Vocabulary",
	},
	{ id: "reading", shortLabel: "3. Reading", title: "Phần 3 · Reading" },
	{ id: "writing", shortLabel: "4. Writing", title: "Phần 4 · Writing" },
	{ id: "speaking", shortLabel: "5. Speaking", title: "Phần 5 · Speaking" },
];

const OBJECTIVE_AND_WRITING_STEPS = new Set([
	"listening",
	"vocab-grammar",
	"reading",
	"writing",
]);

const READING_KIND_LABELS = {
	sign: "Biển báo / Thông báo",
	message: "Tin nhắn / Email",
	passage: "Bài đọc hiểu",
	cloze: "Đoạn văn điền từ",
};

const CEFR_ORDER = ["Pre-A1", "A1", "A2", "A2+", "B1", "B2", "B2+", "C1", "C2"];

const CEFR_EXPLORER_DATA = [
	{
		cefr: "Pre-A1",
		range: "Dưới 25%",
		courseLabel: "Nền tảng Cơ bản",
		audience:
			"Người mới bắt đầu hoặc mất gốc lâu năm, cần củng cố phát âm, từ vựng và mẫu câu cơ bản.",
		goals: [
			"Đánh vần, phát âm đúng 44 âm IPA",
			"Nắm vững thì hiện tại đơn, quá khứ đơn cơ bản",
			"Nghe – phản xạ các câu chào hỏi, số đếm, giờ giấc",
		],
	},
	{
		cefr: "A1",
		range: "25% – 44%",
		courseLabel: "Giao tiếp 1 (Mất gốc & Nền tảng)",
		audience:
			"Học viên nghe hiểu từ khóa quen thuộc và đặt câu đơn, muốn nói mạch lạc hơn.",
		goals: [
			"Làm chủ cấu trúc câu tiếng Anh chuẩn bản ngữ",
			"Nghe hiểu hội thoại sinh hoạt, mua sắm, đặt lịch",
			"Viết đoạn ngắn 50–80 từ rõ ý và đúng ngữ pháp cơ bản",
		],
	},
	{
		cefr: "A2",
		range: "45% – 64%",
		courseLabel: "Giao tiếp 2 (Sơ trung cấp)",
		audience:
			"Học viên đã giao tiếp cơ bản, muốn mở rộng vốn từ và diễn đạt tự nhiên trong công việc.",
		goals: [
			"Thảo luận tự tin về thói quen, kế hoạch, kinh nghiệm",
			"Đọc hiểu email ngắn, thông báo và bài báo đơn giản",
			"Liên kết ý khi nói và viết đoạn văn trôi chảy",
		],
	},
	{
		cefr: "A2+ / B1",
		range: "65% – 84%",
		courseLabel: "Giao tiếp 3 / Pre-IELTS",
		audience:
			"Học viên có nền tảng khá, muốn chuẩn bị bước sang luyện thi IELTS học thuật.",
		goals: [
			"Thành thạo mệnh đề quan hệ, câu điều kiện, bị động",
			"Đọc hiểu văn bản dài, suy luận ý tác giả",
			"Nói và viết bày tỏ quan điểm có dẫn chứng thuyết phục",
		],
	},
	{
		cefr: "B1+",
		range: "85% – 100%",
		courseLabel: "IELTS Foundation / Intensive",
		audience:
			"Học viên nắm chắc ngữ pháp – từ vựng cốt lõi, sẵn sàng luyện chiến thuật IELTS 4 kỹ năng.",
		goals: [
			"Luyện chiến thuật Listening & Reading chuẩn bài thi thật",
			"Phát triển bài viết Writing mạch lạc, từ vựng học thuật",
			"Phản xạ Speaking trôi chảy qua cả 3 phần IELTS Speaking",
		],
	},
];

function createCefrExplorer(snapshotBands) {
	const items =
		Array.isArray(snapshotBands) && snapshotBands.length > 0
			? snapshotBands.map((band, idx) => {
					const fallback =
						CEFR_EXPLORER_DATA.find(
							(d) =>
								d.cefr.toLowerCase() ===
								String(band.cefr ?? "")
									.trim()
									.toLowerCase(),
						) ??
						CEFR_EXPLORER_DATA[idx] ??
						CEFR_EXPLORER_DATA[0];
					const advice = String(band.advice ?? "").trim();
					return {
						cefr: String(band.cefr ?? "").trim() || fallback.cefr,
						range: `${band.min}% – ${band.max}%`,
						courseLabel:
							String(
								band.displayCourse || band.courseLabel || band.course || "",
							).trim() || fallback.courseLabel,
						audience: advice || fallback.audience,
						goals: fallback.goals,
					};
				})
			: CEFR_EXPLORER_DATA;

	let activeIndex = 0;

	const details = el("details", {
		id: "cefrExplorerBox",
		className: "cefr-explorer",
	});
	details.appendChild(
		el("summary", {}, [
			"Tham khảo khung CEFR & các khóa học của cô Đỗ Thục Mỹ",
		]),
	);

	const tabsWrap = el("div", {
		className: "cefr-tabs",
		role: "tablist",
		"aria-label": "Khung tham chiếu CEFR",
	});
	const panel = el("div", {
		id: "cefrDetailPanel",
		className: "cefr-detail-panel",
		role: "tabpanel",
	});

	function renderPanel() {
		const item = items[activeIndex] ?? items[0];
		for (const [idx, btn] of [...tabsWrap.children].entries()) {
			btn.setAttribute("aria-selected", idx === activeIndex ? "true" : "false");
		}
		panel.replaceChildren(
			el("div", { className: "cefr-stat-cell" }, [
				el("span", { className: "cefr-stat-label", textContent: "Cấp độ" }),
				el("strong", {
					className: "cefr-stat-value",
					textContent: `${item.cefr} (${item.range})`,
				}),
				el("span", { className: "cefr-stat-sub", textContent: item.audience }),
			]),
			el("div", { className: "cefr-stat-cell" }, [
				el("span", {
					className: "cefr-stat-label",
					textContent: "Khóa học gợi ý",
				}),
				el("strong", {
					className: "cefr-stat-value",
					textContent: item.courseLabel,
				}),
				el(
					"ul",
					{ className: "cefr-ref-goals" },
					item.goals.map((g) => el("li", { textContent: g })),
				),
			]),
		);
	}

	items.forEach((item, idx) => {
		const tabBtn = el(
			"button",
			{
				type: "button",
				className: "cefr-tab-btn",
				role: "tab",
				"aria-selected": idx === 0 ? "true" : "false",
			},
			[item.cefr],
		);
		tabBtn.addEventListener("click", () => {
			activeIndex = idx;
			renderPanel();
		});
		tabsWrap.appendChild(tabBtn);
	});

	renderPanel();
	details.appendChild(tabsWrap);
	details.appendChild(panel);
	return details;
}

function resolveApiBase() {
	const meta = document.querySelector('meta[name="lead-api"]');
	const raw = meta?.getAttribute("content")?.trim() || DEFAULT_API_BASE;
	return raw.replace(/\/+$/, "");
}

function resolveMediaUrl(apiBase, src) {
	const trimmed = String(src ?? "").trim();
	if (!trimmed) return "";
	if (/^https?:\/\//i.test(trimmed)) return trimmed;
	if (trimmed.startsWith("/")) return `${apiBase}${trimmed}`;
	return `${apiBase}/${trimmed}`;
}

function formatClock(totalSeconds) {
	const clamped = Math.max(0, Math.floor(Number(totalSeconds) || 0));
	const mins = Math.floor(clamped / 60);
	const secs = clamped % 60;
	return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function el(tag, attrs = {}, children = []) {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (v === undefined || v === null || v === false) continue;
		if (k === "className") {
			node.className = v;
		} else if (k === "textContent") {
			node.textContent = v;
		} else if (k === "dataset") {
			for (const [dk, dv] of Object.entries(v)) {
				if (dv !== undefined && dv !== null) node.dataset[dk] = String(dv);
			}
		} else if (v === true) {
			node.setAttribute(k, "");
		} else {
			node.setAttribute(k, String(v));
		}
	}
	const list = Array.isArray(children) ? children : [children];
	for (const child of list) {
		if (child === undefined || child === null || child === false) continue;
		if (typeof child === "string" || typeof child === "number") {
			node.appendChild(document.createTextNode(String(child)));
		} else {
			node.appendChild(child);
		}
	}
	return node;
}

function normalizeSnapshot(raw) {
	if (!raw || typeof raw !== "object" || !Array.isArray(raw.parts)) {
		throw new Error("Cấu trúc đề kiểm tra đầu vào không hợp lệ.");
	}
	const parts = raw.parts;
	const listening = parts.find((p) => p?.id === "listening") ?? parts[0];
	const vocabGrammar = parts.find((p) => p?.id === "vocab-grammar") ?? parts[1];
	const reading = parts.find((p) => p?.id === "reading") ?? parts[2];
	const writing = parts.find((p) => p?.id === "writing") ?? parts[3];
	const speaking = parts.find((p) => p?.id === "speaking") ?? parts[4];

	if (
		!listening ||
		!Array.isArray(listening.clips) ||
		!vocabGrammar ||
		!Array.isArray(vocabGrammar.questions) ||
		!reading ||
		!Array.isArray(reading.passages) ||
		!writing ||
		!speaking ||
		!Array.isArray(speaking.tasks)
	) {
		throw new Error("Đề kiểm tra chưa đủ 5 kỹ năng.");
	}

	return {
		version: Number(raw.version) || 1,
		bands: Array.isArray(raw.bands) ? raw.bands : [],
		parts: [listening, vocabGrammar, reading, writing, speaking],
		listening,
		vocabGrammar,
		reading,
		writing,
		speaking,
	};
}

function sanitizeObjectiveAnswers(snapshot, answers) {
	const listeningOut = {};
	for (const clip of snapshot.listening.clips) {
		for (const q of clip.questions ?? []) {
			const val = answers?.listening?.[q.id];
			if (q.type === "gap") {
				listeningOut[q.id] =
					typeof val === "string" ? val.trim().slice(0, 120) : "";
			} else if (
				typeof val === "number" &&
				Number.isInteger(val) &&
				val >= 0 &&
				val <= 3
			) {
				listeningOut[q.id] = val;
			} else {
				listeningOut[q.id] = null;
			}
		}
	}

	const vocabGrammarOut = {};
	for (const q of snapshot.vocabGrammar.questions) {
		const val = answers?.vocabGrammar?.[q.id];
		vocabGrammarOut[q.id] =
			typeof val === "number" && Number.isInteger(val) && val >= 0 && val <= 3
				? val
				: null;
	}

	const readingOut = {};
	for (const passage of snapshot.reading.passages) {
		for (const q of passage.questions ?? []) {
			const val = answers?.reading?.[q.id];
			readingOut[q.id] =
				typeof val === "number" && Number.isInteger(val) && val >= 0 && val <= 3
					? val
					: null;
		}
	}

	return {
		listening: listeningOut,
		vocabGrammar: vocabGrammarOut,
		reading: readingOut,
	};
}

function createEmptyLead() {
	return {
		name: "",
		phone: "",
		email: "",
		birthDate: "",
		course: "",
		studyMode: "",
		note: "",
	};
}

function createInitialState() {
	return {
		step: "intro",
		lead: createEmptyLead(),
		answers: {
			listening: {},
			vocabGrammar: {},
			reading: {},
		},
		plays: {},
		writingText: "",
		speakingMode: "none",
		speakingDurationSec: null,
		knownReadingCount: null,
		timerStartedAt: null,
		submission: null,
	};
}

function loadLeadDraft() {
	try {
		const raw = localStorage.getItem(LEAD_DRAFT_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return null;
		return parsed;
	} catch {
		return null;
	}
}

function saveLeadDraft(lead, placementSummary = "", course = "") {
	try {
		const existing = loadLeadDraft() ?? {};
		const next = {
			...existing,
			name: lead.name || existing.name || "",
			phone: lead.phone || existing.phone || "",
			email: lead.email || existing.email || "",
			birthDate: lead.birthDate || existing.birthDate || "",
			course: course || lead.course || existing.course || "",
			studyMode: lead.studyMode || existing.studyMode || "",
			note: lead.note || existing.note || "",
			placement: placementSummary || existing.placement || "",
			updatedAt: new Date().toISOString(),
		};
		localStorage.setItem(LEAD_DRAFT_KEY, JSON.stringify(next));
	} catch {
		// Ignore localStorage quota/privacy errors
	}
}

function loadAttemptState(testVersion) {
	const base = createInitialState();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			const draft = loadLeadDraft();
			if (draft) {
				base.lead = { ...base.lead, ...draft };
			}
			return base;
		}
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return base;
		if (parsed.testVersion !== testVersion) {
			const draft = loadLeadDraft();
			if (draft) base.lead = { ...base.lead, ...draft };
			return base;
		}
		const merged = {
			...base,
			...parsed,
			lead: { ...base.lead, ...(parsed.lead ?? {}) },
			answers: {
				listening: parsed.answers?.listening ?? {},
				vocabGrammar: parsed.answers?.vocabGrammar ?? {},
				reading: parsed.answers?.reading ?? {},
			},
			plays: parsed.plays ?? {},
			writingText:
				typeof parsed.writingText === "string" ? parsed.writingText : "",
			speakingMode: parsed.speakingMode === "skipped" ? "skipped" : "none",
			speakingDurationSec: null,
			knownReadingCount:
				typeof parsed.knownReadingCount === "number" &&
				Number.isInteger(parsed.knownReadingCount) &&
				parsed.knownReadingCount >= 0
					? parsed.knownReadingCount
					: null,
			timerStartedAt:
				typeof parsed.timerStartedAt === "number"
					? parsed.timerStartedAt
					: null,
			submission: parsed.submission ?? null,
		};
		const validSteps = new Set([
			"intro",
			"info",
			"listening",
			"vocab-grammar",
			"reading",
			"writing",
			"speaking",
			"result",
		]);
		if (!validSteps.has(merged.step)) merged.step = "intro";
		if (merged.step === "result" && !merged.submission) merged.step = "intro";
		return merged;
	} catch {
		return base;
	}
}

function saveAttemptState(testVersion, state) {
	try {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				testVersion,
				step: state.step,
				lead: state.lead,
				answers: state.answers,
				plays: state.plays,
				writingText: state.writingText,
				speakingMode: state.speakingMode === "skipped" ? "skipped" : "none",
				knownReadingCount:
					typeof state.knownReadingCount === "number" &&
					Number.isInteger(state.knownReadingCount) &&
					state.knownReadingCount >= 0
						? state.knownReadingCount
						: null,
				timerStartedAt: state.timerStartedAt,
				submission: state.submission,
			}),
		);
	} catch {
		// Ignore localStorage failures
	}
}

function buildQuestionNumberMap(snapshot) {
	const map = new Map();
	let index = 1;
	for (const clip of snapshot.listening.clips) {
		for (const q of clip.questions ?? []) {
			map.set(q.id, index++);
		}
	}
	for (const q of snapshot.vocabGrammar.questions) {
		map.set(q.id, index++);
	}
	for (const passage of snapshot.reading.passages) {
		for (const q of passage.questions ?? []) {
			map.set(q.id, index++);
		}
	}
	return map;
}

function createApp() {
	const appRoot = document.getElementById("appRoot");
	if (!appRoot) return;

	const apiBase = resolveApiBase();
	const pageOpenedAt = Date.now();

	let snapshot = null;
	let state = createInitialState();
	let questionNumbers = new Map();

	// Runtime-only state (not persisted)
	let activeAudio = null;
	let activeClipId = null;
	let timerInterval = null;
	let mediaStream = null;
	let mediaRecorder = null;
	let recordedChunks = [];
	let recordedBlob = null;
	let recordedBlobUrl = "";
	let speakingSession = createInitialSpeakingSession(0);
	let speakingPhaseInterval = null;
	let readingSafetyTimeout = null;
	let activePromptAudio = null;
	let promptPlaybackToken = 0;
	let isPromptReplaying = false;
	let preferredRecorderMime = "";
	let isRequestingMic = false;
	let speakingStartToken = 0;
	let isStoppingMediaStream = false;
	let activeAnswerMs = 0;
	let answerStartedAt = 0;
	let hasRecordedAnyAnswer = false;
	let speakingDiscardOnStop = false;
	let isFinalizingRecording = false;
	let speakingMediaError = "";
	let speakingUploadError = "";
	let isUploadingSpeaking = false;
	let submitError = "";
	let isSubmitting = false;
	let readingBackfillNotice = false;
	let unansweredConfirmState = null;
	let consultSavedMessage = "";
	let consultSaving = false;

	function persist() {
		if (!snapshot) return;
		state.knownReadingCount = countReadingQuestions(snapshot);
		saveAttemptState(snapshot.version, state);
	}

	function stopActiveAudio() {
		if (activeAudio) {
			try {
				activeAudio.pause();
				activeAudio.currentTime = 0;
			} catch {
				// Ignore pause errors
			}
			activeAudio = null;
		}
		activeClipId = null;
	}

	function isSpeakingBusy() {
		return speakingSession.status === "active" || isFinalizingRecording;
	}

	function teardownSpeakingPromptPlayback() {
		promptPlaybackToken += 1;
		isPromptReplaying = false;
		if (readingSafetyTimeout) {
			clearTimeout(readingSafetyTimeout);
			readingSafetyTimeout = null;
		}
		if (activePromptAudio) {
			try {
				activePromptAudio.onloadedmetadata = null;
				activePromptAudio.ondurationchange = null;
				activePromptAudio.onplaying = null;
				activePromptAudio.onended = null;
				activePromptAudio.onerror = null;
				activePromptAudio.pause();
				activePromptAudio.src = "";
			} catch {
				// Ignore prompt audio stop errors
			}
			activePromptAudio = null;
		}
		try {
			window.speechSynthesis?.cancel();
		} catch {
			// Ignore speechSynthesis cancel errors
		}
	}

	function stopSpeakingIntervals() {
		if (speakingPhaseInterval) {
			clearInterval(speakingPhaseInterval);
			speakingPhaseInterval = null;
		}
		teardownSpeakingPromptPlayback();
	}

	function stopMediaStream() {
		if (mediaStream) {
			isStoppingMediaStream = true;
			try {
				for (const track of mediaStream.getTracks()) {
					try {
						track.stop();
					} catch {
						// Ignore track stop errors
					}
				}
			} finally {
				mediaStream = null;
				isStoppingMediaStream = false;
			}
		}
	}

	function abortSpeakingSessionWithError(message) {
		speakingStartToken += 1;
		isRequestingMic = false;
		isFinalizingRecording = false;
		stopSpeakingIntervals();
		mediaRecorder = null;
		stopMediaStream();
		speakingSession = createInitialSpeakingSession(
			snapshot?.speaking?.tasks?.length ?? 0,
		);
		activeAnswerMs = 0;
		answerStartedAt = 0;
		hasRecordedAnyAnswer = false;
		recordedChunks = [];
		speakingMediaError = message;
		render();
	}

	function revokeRecordedUrl() {
		if (recordedBlobUrl) {
			try {
				URL.revokeObjectURL(recordedBlobUrl);
			} catch {
				// Ignore revoke errors
			}
			recordedBlobUrl = "";
		}
	}

	function stopPageTimer() {
		if (timerInterval) {
			clearInterval(timerInterval);
			timerInterval = null;
		}
	}

	function computeRemainingTimerSeconds() {
		if (!state.timerStartedAt) return RECOMMENDED_TIMER_SECONDS;
		const elapsedSec = Math.floor((Date.now() - state.timerStartedAt) / 1000);
		return Math.max(0, RECOMMENDED_TIMER_SECONDS - elapsedSec);
	}

	function updateTimerDom() {
		const badge = document.getElementById("testTimerBadge");
		if (!badge) return;
		if (!OBJECTIVE_AND_WRITING_STEPS.has(state.step)) {
			badge.textContent = "Speaking · Không tính vào 40 phút";
			badge.classList.remove("is-warning", "is-expired");
			return;
		}
		const remaining = computeRemainingTimerSeconds();
		badge.textContent =
			remaining > 0 ? `Gợi ý: ${formatClock(remaining)}` : "Đã hết 40:00 gợi ý";
		badge.classList.toggle("is-warning", remaining > 0 && remaining <= 300);
		badge.classList.toggle("is-expired", remaining === 0);

		const notice = document.getElementById("timerExpiredNotice");
		if (notice) {
			notice.hidden = remaining > 0;
		}
	}

	function ensurePageTimerRunning() {
		stopPageTimer();
		if (!OBJECTIVE_AND_WRITING_STEPS.has(state.step)) return;
		if (!state.timerStartedAt) {
			state.timerStartedAt = Date.now();
			persist();
		}
		updateTimerDom();
		timerInterval = setInterval(updateTimerDom, 1000);
	}

	function updateProgressCounterDom() {
		const node = document.querySelector(".progress-counter");
		if (!node || !snapshot) return;
		const progress = countObjectiveProgress(snapshot, state.answers);
		node.textContent = `Đã trả lời ${progress.answered}/${progress.total} câu khách quan`;
	}

	function navigateToStep(nextStep) {
		if (isSpeakingBusy()) {
			speakingMediaError =
				"Vui lòng hoàn thành hoặc bấm Kết thúc sớm phần ghi âm trước khi chuyển phần khác.";
			render();
			return;
		}
		speakingStartToken += 1;
		isRequestingMic = false;
		stopActiveAudio();
		stopMediaStream();
		stopSpeakingIntervals();
		speakingSession = createInitialSpeakingSession(
			snapshot?.speaking?.tasks?.length ?? 0,
		);
		activeAnswerMs = 0;
		answerStartedAt = 0;
		hasRecordedAnyAnswer = false;
		isFinalizingRecording = false;
		unansweredConfirmState = null;
		submitError = "";
		speakingMediaError = "";
		if (nextStep !== "reading") {
			readingBackfillNotice = false;
		}
		state.step = nextStep;
		if (OBJECTIVE_AND_WRITING_STEPS.has(nextStep) && !state.timerStartedAt) {
			state.timerStartedAt = Date.now();
		}
		persist();
		render();
		window.scrollTo({ top: 0, behavior: "smooth" });
	}

	function renderTestHeader(activeSkillId) {
		const progress = countObjectiveProgress(snapshot, state.answers);
		const remaining = computeRemainingTimerSeconds();
		const isTimedSkill = OBJECTIVE_AND_WRITING_STEPS.has(activeSkillId);

		const stepperItems = SKILL_STEPS.map((skill) => {
			const isActive = skill.id === activeSkillId;
			return el(
				"button",
				{
					type: "button",
					className: `skill-step-pill${isActive ? " is-active" : ""}`,
					dataset: { skillStep: skill.id },
					"aria-current": isActive ? "step" : undefined,
				},
				[skill.shortLabel],
			);
		});

		for (const btn of stepperItems) {
			btn.addEventListener("click", () => {
				const target = btn.dataset.skillStep;
				if (target && target !== state.step) {
					navigateToStep(target);
				}
			});
		}

		const topMeta = el("div", { className: "test-topbar-meta" }, [
			el("div", { className: "test-student-pill" }, [
				el("span", {}, [
					"Thí sinh: ",
					el("strong", { textContent: state.lead.name || "Chưa nhập" }),
				]),
				el(
					"button",
					{
						type: "button",
						id: "changeLeadInfoBtn",
						className: "link-inline-btn",
					},
					["Đổi thông tin"],
				),
			]),
			el("div", { className: "test-topbar-stats" }, [
				el("span", { className: "progress-counter" }, [
					`Đã trả lời ${progress.answered}/${progress.total} câu khách quan`,
				]),
				el(
					"span",
					{
						id: "testTimerBadge",
						className: `timer-badge${isTimedSkill && remaining <= 300 && remaining > 0 ? " is-warning" : ""}${isTimedSkill && remaining === 0 ? " is-expired" : ""}`,
						dataset: { testid: "test-timer" },
					},
					[
						isTimedSkill
							? remaining > 0
								? `Gợi ý: ${formatClock(remaining)}`
								: "Đã hết 40:00 gợi ý"
							: "Speaking · Không tính vào 40 phút",
					],
				),
			]),
		]);

		topMeta
			.querySelector("#changeLeadInfoBtn")
			?.addEventListener("click", () => navigateToStep("info"));

		const expiredNotice = el(
			"div",
			{
				id: "timerExpiredNotice",
				className: "timer-expired-notice",
				hidden: !(isTimedSkill && remaining === 0),
				role: "status",
			},
			[
				"Đã hết 40 phút gợi ý cho 4 phần đầu — bạn vẫn có thể hoàn thành câu trả lời và nộp bài bình thường.",
			],
		);

		return el("header", { className: "test-topbar" }, [
			topMeta,
			el(
				"nav",
				{
					className: "skill-stepper",
					"aria-label": "Tiến độ 5 kỹ năng",
				},
				stepperItems,
			),
			expiredNotice,
		]);
	}

	function renderMcqQuestionFieldset(q, currentValue, onSelect) {
		const num = questionNumbers.get(q.id) ?? 1;
		const options = Array.isArray(q.options) ? q.options : [];
		const promptText = String(q.prompt ?? "").trim();

		const fieldset = el("fieldset", {
			className: "question-card",
			dataset: { questionId: q.id },
		});

		const legendChildren = [
			el("span", { className: "question-num", textContent: `Câu ${num}` }),
		];
		if (q.kind === "grammar" || q.kind === "vocab") {
			legendChildren.push(
				el("span", {
					className: "question-tag",
					textContent: q.kind === "vocab" ? "Từ vựng" : "Ngữ pháp",
				}),
			);
		}
		const legend = el("legend", { className: "question-legend" }, [
			el("span", { className: "question-meta-row" }, legendChildren),
			promptText
				? el("span", { className: "question-prompt", textContent: promptText })
				: el("span", {
						className: "question-prompt is-subtle",
						textContent: "Chọn đáp án đúng nhất:",
					}),
		]);
		fieldset.appendChild(legend);

		const optionsGrid = el("div", { className: "options-list" });
		options.forEach((optText, optIdx) => {
			const inputId = `opt-${q.id}-${optIdx}`;
			const isSelected = currentValue === optIdx;
			const radio = el("input", {
				type: "radio",
				id: inputId,
				name: `q-${q.id}`,
				value: String(optIdx),
				checked: isSelected,
				dataset: { questionId: q.id, optionIndex: String(optIdx) },
			});
			radio.addEventListener("change", () => {
				onSelect(optIdx);
				for (const item of optionsGrid.querySelectorAll(".option-item")) {
					item.classList.remove("is-selected");
				}
				label.classList.add("is-selected");
				updateProgressCounterDom();
			});

			const letter = OPTION_LETTERS[optIdx] ?? String(optIdx + 1);
			const label = el(
				"label",
				{
					for: inputId,
					className: `option-item${isSelected ? " is-selected" : ""}`,
				},
				[
					radio,
					el("span", { className: "option-letter", textContent: letter }),
					el("span", { className: "option-text", textContent: optText }),
				],
			);
			optionsGrid.appendChild(label);
		});

		fieldset.appendChild(optionsGrid);
		return fieldset;
	}

	function renderGapQuestionFieldset(q, currentValue, onInput) {
		const num = questionNumbers.get(q.id) ?? 1;
		const fieldset = el("fieldset", {
			className: "question-card is-gap",
			dataset: { questionId: q.id },
		});

		const meta = el("span", { className: "question-meta-row" }, [
			el("span", { className: "question-num", textContent: `Câu ${num}` }),
			el("span", { className: "question-tag", textContent: "Điền từ / số" }),
		]);

		fieldset.appendChild(
			el("legend", { className: "question-legend" }, [
				meta,
				el("span", {
					className: "question-prompt",
					textContent: q.prompt || "Điền thông tin nghe được vào chỗ trống:",
				}),
			]),
		);

		const inputId = `gap-${q.id}`;
		const input = el("input", {
			type: "text",
			id: inputId,
			className: "gap-input",
			value: typeof currentValue === "string" ? currentValue : "",
			maxlength: "120",
			autocomplete: "off",
			spellcheck: "false",
			placeholder: "Nhập từ hoặc số bạn nghe được...",
			dataset: { gapInput: q.id, questionId: q.id },
		});
		input.addEventListener("input", () => {
			onInput(input.value);
			updateProgressCounterDom();
		});

		fieldset.appendChild(
			el("div", { className: "gap-input-wrap" }, [
				el("label", {
					for: inputId,
					className: "sr-only",
					textContent: `Câu ${num}: ${q.prompt || "Điền đáp án"}`,
				}),
				input,
				el(
					"p",
					{ className: "gap-hint" },
					"Gợi ý: Viết ngắn gọn (không cần viết hoa hay ký tự phụ như $, p.m.).",
				),
			]),
		);
		return fieldset;
	}

	function renderIntroStep() {
		const objectiveStats = countObjectiveProgress(snapshot, {});
		const writing = snapshot.writing;
		const speakingCount = snapshot.speaking.tasks.length;

		return el("section", { className: "card intro-card" }, [
			el("p", { className: "kicker-pill" }, [
				"Đánh giá năng lực 5 kỹ năng · Miễn phí",
			]),
			el("h1", { className: "display-title" }, [
				"Bài Kiểm Tra Đầu Vào Tiếng Anh (5 Kỹ Năng)",
			]),
			el("p", { className: "lead-copy" }, [
				"Bài kiểm tra đánh giá toàn diện 5 kỹ năng để cô Đỗ Thục Mỹ xếp đúng lớp CEFR / IELTS và thiết kế lộ trình học sát năng lực thực tế của bạn.",
			]),
			el("div", { className: "intro-grid" }, [
				el("div", { className: "intro-stat" }, [
					el("strong", {}, [`${objectiveStats.total} câu khách quan`]),
					el("span", {}, [
						"Listening (có giới hạn lượt nghe), Grammar & Vocabulary, và Reading.",
					]),
				]),
				el("div", { className: "intro-stat" }, [
					el("strong", {}, [
						speakingCount > 0
							? "Writing & Speaking thực tế"
							: "Writing thực tế",
					]),
					el("span", {}, [
						speakingCount > 0
							? `1 bài viết (${writing.minWords}–${writing.maxWords} từ) và ${speakingCount} câu hỏi Speaking ghi âm qua micro (hoặc bỏ qua nếu thiếu mic).`
							: `1 bài viết (${writing.minWords}–${writing.maxWords} từ).`,
					]),
				]),
				el("div", { className: "intro-stat" }, [
					el("strong", {}, ["Đồng hồ gợi ý 40 phút"]),
					el("span", {}, [
						"Áp dụng nhẹ nhàng cho 4 phần đầu; khi hết giờ hệ thống chỉ nhắc nhẹ, không làm mất bài.",
					]),
				]),
			]),
			el("div", { className: "provisional-notice-box" }, [
				el("strong", {}, ["Cách tính kết quả & xếp lớp chính thức: "]),
				"Sau khi nộp bài, bạn nhận ngay ",
				el("strong", {}, ["Kết quả tạm tính"]),
				" cho 3 phần trắc nghiệm/điền từ. Cô Đỗ Thục Mỹ sẽ trực tiếp chấm phần Writing & Speaking và gửi kết quả xếp lớp CEFR chính thức kèm lộ trình chi tiết qua Zalo.",
			]),
			el("div", { className: "intro-actions" }, [
				el(
					"button",
					{
						type: "button",
						id: "startTestBtn",
						className: "btn btn-primary btn-lg",
					},
					["Bắt đầu kiểm tra ngay →"],
				),
				el("a", { href: "../", className: "btn btn-ghost" }, [
					"← Về trang chủ",
				]),
			]),
		]);
	}

	function renderInfoStep() {
		const values = { ...createEmptyLead(), ...state.lead };
		const hasOptionalValue = Boolean(
			values.birthDate || values.course || values.studyMode || values.note,
		);

		const card = el("section", {
			id: "leadGateCard",
			className: "card lead-gate-card",
		});

		card.appendChild(
			el("p", { className: "kicker-pill" }, [
				"Bước 1 · Thông tin nhận kết quả",
			]),
		);
		card.appendChild(
			el("h1", { className: "section-title" }, [
				"Nhập thông tin trước khi vào làm bài",
			]),
		);
		card.appendChild(
			el("p", { className: "muted-copy" }, [
				"Cô Đỗ Thục Mỹ sẽ dùng SĐT và Email này để gửi kết quả xếp lớp CEFR chính thức sau khi chấm phần Writing & Speaking.",
			]),
		);

		const formError = el("div", {
			id: "leadFormError",
			className: "form-error-banner",
			role: "alert",
			hidden: true,
		});
		card.appendChild(formError);

		const form = el("form", {
			id: "leadGateForm",
			className: "lead-form",
			novalidate: true,
		});

		const fieldErrors = {};
		function makeField(
			id,
			name,
			labelText,
			required,
			inputNode,
			hintText = "",
		) {
			const errNode = el("p", {
				id: `${id}Error`,
				className: "field-error",
				hidden: true,
			});
			fieldErrors[name] = { input: inputNode, error: errNode };
			return el("div", { className: "form-field" }, [
				el("label", { for: id, className: "field-label" }, [
					labelText,
					required ? el("span", { className: "req-mark" }, [" *"]) : null,
				]),
				inputNode,
				hintText ? el("p", { className: "field-hint" }, [hintText]) : null,
				errNode,
			]);
		}

		const nameInput = el("input", {
			type: "text",
			id: "leadName",
			name: "name",
			required: true,
			maxlength: String(LEAD_NAME_MAX),
			autocomplete: "name",
			placeholder: "Ví dụ: Nguyễn Minh Anh",
			value: values.name,
		});

		const phoneInput = el("input", {
			type: "tel",
			id: "leadPhone",
			name: "phone",
			required: true,
			inputmode: "tel",
			autocomplete: "tel",
			placeholder: "Ví dụ: 0912345678 hoặc +84912345678",
			value: values.phone,
		});

		const emailInput = el("input", {
			type: "email",
			id: "leadEmail",
			name: "email",
			required: true,
			autocomplete: "email",
			placeholder: "Ví dụ: minhanh@gmail.com",
			value: values.email,
		});

		const birthDateInput = el("input", {
			type: "date",
			id: "leadBirthDate",
			name: "birthDate",
			value: values.birthDate,
		});

		const courseSelect = el("select", { id: "leadCourse", name: "course" }, [
			el("option", { value: "" }, ["-- Chọn khóa học quan tâm (tuỳ chọn) --"]),
			...PLACEMENT_COURSE_GROUPS.map((group) =>
				el(
					"optgroup",
					{ label: group.label },
					group.options.map((opt) =>
						el(
							"option",
							{
								value: opt.value,
								selected: values.course === opt.value,
							},
							[opt.label],
						),
					),
				),
			),
		]);

		const studyModeSelect = el(
			"select",
			{ id: "leadStudyMode", name: "studyMode" },
			[
				el("option", { value: "" }, ["-- Chọn hình thức học (tuỳ chọn) --"]),
				...PLACEMENT_STUDY_MODES.map((mode) =>
					el(
						"option",
						{
							value: mode.value,
							selected: values.studyMode === mode.value,
						},
						[mode.label],
					),
				),
			],
		);

		const noteInput = el("textarea", {
			id: "leadNote",
			name: "note",
			rows: "3",
			maxlength: "500",
			placeholder:
				"Ví dụ: Mục tiêu IELTS 6.5 trong 6 tháng hoặc muốn cải thiện giao tiếp...",
			textContent: values.note,
		});

		// Honeypot anti-bot field (kept offscreen cleanly)
		const websiteTrap = el("div", {
			className: "honeypot-field",
			"aria-hidden": "true",
		});
		const websiteInput = el("input", {
			type: "text",
			id: "leadWebsite",
			name: "website",
			tabindex: "-1",
			autocomplete: "off",
		});
		websiteTrap.appendChild(websiteInput);

		form.appendChild(
			el("div", { className: "form-grid-2" }, [
				makeField("leadName", "name", "Họ và tên", true, nameInput),
				makeField(
					"leadPhone",
					"phone",
					"Số điện thoại (Zalo)",
					true,
					phoneInput,
					"Chuẩn 10 số Việt Nam (0xxxxxxxxx hoặc +84...).",
				),
			]),
		);

		form.appendChild(
			makeField("leadEmail", "email", "Email nhận lộ trình", true, emailInput),
		);

		const optionalDetails = el(
			"details",
			{
				id: "leadOptionalDetails",
				className: "optional-details",
				open: hasOptionalValue,
			},
			[
				el("summary", {}, [
					"Thông tin bổ sung (Ngày sinh, Khóa quan tâm, Ghi chú)",
				]),
				el("div", { className: "optional-fields-body" }, [
					el("div", { className: "form-grid-2" }, [
						makeField(
							"leadBirthDate",
							"birthDate",
							"Ngày sinh",
							false,
							birthDateInput,
						),
						makeField(
							"leadCourse",
							"course",
							"Khóa học quan tâm",
							false,
							courseSelect,
						),
					]),
					makeField(
						"leadStudyMode",
						"studyMode",
						"Hình thức học mong muốn",
						false,
						studyModeSelect,
					),
					makeField(
						"leadNote",
						"note",
						"Ghi chú / Mục tiêu học",
						false,
						noteInput,
					),
				]),
			],
		);
		form.appendChild(optionalDetails);
		form.appendChild(websiteTrap);

		const submitBtn = el(
			"button",
			{
				type: "submit",
				id: "submitLeadGateBtn",
				className: "btn btn-primary btn-lg",
			},
			["Xác nhận & Vào Phần 1: Listening →"],
		);

		form.appendChild(
			el("div", { className: "form-actions" }, [
				el(
					"button",
					{
						type: "button",
						className: "btn btn-ghost",
						id: "backToIntroBtn",
					},
					["← Quay lại giới thiệu"],
				),
				submitBtn,
			]),
		);

		function clearFieldErrors() {
			formError.hidden = true;
			formError.textContent = "";
			for (const entry of Object.values(fieldErrors)) {
				entry.input.removeAttribute("aria-invalid");
				entry.error.hidden = true;
				entry.error.textContent = "";
			}
		}

		function applyErrors(errorsMap, topMessage = "") {
			let firstInvalid = null;
			for (const [field, msg] of Object.entries(errorsMap)) {
				const entry = fieldErrors[field];
				if (!entry) continue;
				if (!firstInvalid) firstInvalid = entry.input;
				entry.input.setAttribute("aria-invalid", "true");
				entry.error.textContent = msg;
				entry.error.hidden = false;
			}
			if (topMessage) {
				formError.textContent = topMessage;
				formError.hidden = false;
			}
			if (firstInvalid) {
				if (optionalDetails?.contains(firstInvalid) && !optionalDetails.open) {
					optionalDetails.open = true;
				}
				firstInvalid.focus();
			}
		}

		form
			.querySelector("#backToIntroBtn")
			?.addEventListener("click", () => navigateToStep("intro"));

		form.addEventListener("submit", async (e) => {
			e.preventDefault();
			clearFieldErrors();

			const rawValues = {
				name: nameInput.value,
				phone: phoneInput.value,
				email: emailInput.value,
				birthDate: birthDateInput.value,
				course: courseSelect.value,
				studyMode: studyModeSelect.value,
				note: noteInput.value,
			};

			const validated = validateLeadForm(rawValues);
			if (!validated.ok) {
				applyErrors(
					validated.errors,
					"Vui lòng kiểm tra lại các thông tin bắt buộc được đánh dấu.",
				);
				return;
			}

			submitBtn.disabled = true;
			submitBtn.textContent = "Đang lưu thông tin...";

			try {
				const payload = buildLeadPayload({
					lead: validated.normalized,
					elapsedMs: Date.now() - pageOpenedAt,
					website: websiteInput.value,
				});

				const res = await fetch(`${apiBase}/public/leads`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
					},
					body: JSON.stringify(payload),
				});

				let body = null;
				try {
					body = await res.json();
				} catch {
					body = null;
				}

				if (!res.ok) {
					const mapped = leadErrorMessage(res.status, body);
					const fieldMap = {};
					for (const f of mapped.fields) {
						if (fieldErrors[f]) {
							fieldMap[f] = "Giá trị chưa hợp lệ, vui lòng kiểm tra lại.";
						}
					}
					applyErrors(fieldMap, mapped.message);
					return;
				}

				state.lead = { ...validated.normalized };
				saveLeadDraft(state.lead);
				if (!state.timerStartedAt) {
					state.timerStartedAt = Date.now();
				}
				state.step = "listening";
				persist();
				render();
				window.scrollTo({ top: 0, behavior: "smooth" });
			} catch {
				applyErrors(
					{},
					"Không thể kết nối máy chủ để lưu thông tin. Vui lòng kiểm tra mạng và thử lại.",
				);
			} finally {
				submitBtn.disabled = false;
				submitBtn.textContent = "Xác nhận & Vào Phần 1: Listening →";
			}
		});

		card.appendChild(form);
		return card;
	}

	function renderListeningStep() {
		const listening = snapshot.listening;
		const wrapper = el("div", {
			className: "skill-view",
			dataset: { skill: "listening" },
		});
		wrapper.appendChild(renderTestHeader("listening"));

		wrapper.appendChild(
			el("section", { className: "card skill-intro-card" }, [
				el("p", { className: "kicker-pill" }, ["Phần 1 / 5 · Nghe hiểu"]),
				el("h1", { className: "section-title" }, [
					listening.title || "Listening Comprehension",
				]),
				el("p", { className: "muted-copy" }, [
					"Mỗi đoạn âm thanh có số lượt nghe giới hạn. Hãy đọc nhanh câu hỏi trước khi bấm phát âm thanh.",
				]),
			]),
		);

		for (const clip of listening.clips) {
			const maxPlays = Number(clip.maxPlays) > 0 ? Number(clip.maxPlays) : 2;
			const playsUsed = Number(state.plays[clip.id] ?? 0);
			const remaining = Math.max(0, maxPlays - playsUsed);
			const audioSrc = resolveMediaUrl(apiBase, clip.src);

			const clipCard = el("section", {
				className: "card listening-clip-card",
				dataset: { clipId: clip.id },
			});

			const partLabel = stripInlineCefrLabel(clip.partLabel);
			const displayClipTitle = stripInlineCefrLabel(clip.title);
			const displayNotesTitle = stripInlineCefrLabel(clip.notesTitle);

			clipCard.appendChild(
				el("div", { className: "clip-header" }, [
					partLabel
						? el("div", { className: "clip-badges" }, [
								el("span", {
									className: "part-badge",
									textContent: partLabel,
								}),
							])
						: null,
					displayClipTitle
						? el("h2", {
								className: "clip-title",
								textContent: displayClipTitle,
							})
						: null,
					clip.instruction
						? el("p", {
								className: "clip-instruction",
								textContent: clip.instruction,
							})
						: null,
				]),
			);

			const audioNode = el("audio", {
				preload: "metadata",
				src: audioSrc,
				dataset: { audioClip: clip.id },
			});

			const playBtn = el(
				"button",
				{
					type: "button",
					className: "btn btn-teal clip-play-btn",
					disabled: remaining <= 0,
					dataset: { playClip: clip.id },
				},
				[remaining > 0 ? "▶ Nghe đoạn âm thanh" : "Đã hết lượt nghe"],
			);

			const statusSpan = el(
				"span",
				{
					className: `clip-status${remaining <= 0 ? " is-exhausted" : ""}`,
					dataset: { clipStatus: clip.id },
				},
				[`Còn ${remaining}/${maxPlays} lượt nghe`],
			);

			const progressFill = el("div", {
				className: "clip-progress-fill",
				dataset: { clipProgress: clip.id },
			});
			const timeText = el(
				"span",
				{
					className: "clip-time",
					dataset: { clipTime: clip.id },
				},
				["00:00 / 00:00"],
			);
			const audioErr = el("p", {
				className: "clip-error-msg",
				hidden: true,
			});

			function syncClipUi(isPlayingNow = false) {
				const used = Number(state.plays[clip.id] ?? 0);
				const left = Math.max(0, maxPlays - used);
				statusSpan.textContent = `Còn ${left}/${maxPlays} lượt nghe`;
				statusSpan.classList.toggle("is-exhausted", left <= 0);
				if (isPlayingNow) {
					playBtn.disabled = true;
					playBtn.textContent = "Đang phát âm thanh...";
				} else if (left <= 0) {
					playBtn.disabled = true;
					playBtn.textContent = "Đã hết lượt nghe";
				} else {
					playBtn.disabled = false;
					playBtn.textContent = "▶ Nghe đoạn âm thanh";
				}
			}

			audioNode.addEventListener("loadedmetadata", () => {
				if (Number.isFinite(audioNode.duration) && audioNode.duration > 0) {
					timeText.textContent = `00:00 / ${formatClock(audioNode.duration)}`;
				}
			});

			audioNode.addEventListener("timeupdate", () => {
				const dur = Number.isFinite(audioNode.duration)
					? audioNode.duration
					: 0;
				const cur = Number.isFinite(audioNode.currentTime)
					? audioNode.currentTime
					: 0;
				const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;
				progressFill.style.width = `${pct}%`;
				timeText.textContent = `${formatClock(cur)} / ${formatClock(dur)}`;
			});

			audioNode.addEventListener("ended", () => {
				if (activeAudio === audioNode) {
					activeAudio = null;
					activeClipId = null;
				}
				progressFill.style.width = "100%";
				syncClipUi(false);
			});

			let attemptRefunded = false;
			function refundAttemptOnce() {
				if (attemptRefunded) return;
				attemptRefunded = true;
				const curUsed = Number(state.plays[clip.id] ?? 0);
				if (curUsed > 0) {
					state.plays[clip.id] = curUsed - 1;
					persist();
				}
			}

			audioNode.addEventListener("error", () => {
				if (activeAudio === audioNode) {
					refundAttemptOnce();
					activeAudio = null;
					activeClipId = null;
					audioErr.textContent =
						"Không thể tải file âm thanh. Lượt nghe đã được hoàn lại, vui lòng thử lại.";
					audioErr.hidden = false;
					syncClipUi(false);
				}
			});

			playBtn.addEventListener("click", async () => {
				audioErr.hidden = true;
				const curUsed = Number(state.plays[clip.id] ?? 0);
				if (curUsed >= maxPlays || activeClipId === clip.id) return;

				stopActiveAudio();
				// Re-enable previously playing button if another clip was playing
				for (const otherBtn of wrapper.querySelectorAll(".clip-play-btn")) {
					const cid = otherBtn.getAttribute("data-play-clip");
					if (cid && cid !== clip.id) {
						const otherClip = listening.clips.find((c) => c.id === cid);
						const otherMax = Number(otherClip?.maxPlays) || 2;
						const otherLeft = Math.max(
							0,
							otherMax - Number(state.plays[cid] ?? 0),
						);
						otherBtn.disabled = otherLeft <= 0;
						otherBtn.textContent =
							otherLeft > 0 ? "▶ Nghe đoạn âm thanh" : "Đã hết lượt nghe";
					}
				}

				attemptRefunded = false;
				state.plays[clip.id] = curUsed + 1;
				persist();
				activeAudio = audioNode;
				activeClipId = clip.id;
				syncClipUi(true);

				try {
					audioNode.currentTime = 0;
					await audioNode.play();
				} catch (err) {
					if (activeAudio === audioNode) {
						activeAudio = null;
						activeClipId = null;
						syncClipUi(false);
					}
					if (err?.name !== "AbortError") {
						refundAttemptOnce();
						audioErr.textContent =
							"Trình duyệt không phát được âm thanh. Lượt nghe đã được hoàn lại, vui lòng thử bấm nghe lại.";
						audioErr.hidden = false;
						syncClipUi(false);
					}
				}
			});

			clipCard.appendChild(
				el("div", { className: "clip-player-box" }, [
					audioNode,
					el("div", { className: "clip-player-row" }, [playBtn, statusSpan]),
					el("div", { className: "clip-progress-row" }, [
						el("div", { className: "clip-progress", "aria-hidden": "true" }, [
							progressFill,
						]),
						timeText,
					]),
					audioErr,
				]),
			);

			if (displayNotesTitle) {
				clipCard.appendChild(
					el("div", { className: "clip-notes-header" }, [
						el("span", { className: "notes-kicker" }, ["Phiếu ghi chú"]),
						el("strong", { textContent: displayNotesTitle }),
					]),
				);
			}

			const qList = el("div", { className: "questions-stack" });
			for (const q of clip.questions ?? []) {
				if (q.type === "gap") {
					qList.appendChild(
						renderGapQuestionFieldset(
							q,
							state.answers.listening[q.id],
							(val) => {
								state.answers.listening[q.id] = val;
								persist();
							},
						),
					);
				} else {
					qList.appendChild(
						renderMcqQuestionFieldset(
							q,
							state.answers.listening[q.id],
							(optIdx) => {
								state.answers.listening[q.id] = optIdx;
								persist();
							},
						),
					);
				}
			}
			clipCard.appendChild(qList);
			wrapper.appendChild(clipCard);
		}

		const navBar = el("div", { className: "step-nav-bar" }, [
			el(
				"button",
				{
					type: "button",
					className: "btn btn-ghost",
					id: "prevToInfoBtn",
				},
				["← Thông tin cá nhân"],
			),
			el(
				"button",
				{
					type: "button",
					id: "nextToVocabBtn",
					className: "btn btn-primary btn-lg",
				},
				["Tiếp tục: Grammar & Vocabulary →"],
			),
		]);
		navBar
			.querySelector("#prevToInfoBtn")
			?.addEventListener("click", () => navigateToStep("info"));
		navBar
			.querySelector("#nextToVocabBtn")
			?.addEventListener("click", () => navigateToStep("vocab-grammar"));
		wrapper.appendChild(navBar);

		return wrapper;
	}

	function renderVocabGrammarStep() {
		const vg = snapshot.vocabGrammar;
		const wrapper = el("div", {
			className: "skill-view",
			dataset: { skill: "vocab-grammar" },
		});
		wrapper.appendChild(renderTestHeader("vocab-grammar"));

		wrapper.appendChild(
			el("section", { className: "card skill-intro-card" }, [
				el("p", { className: "kicker-pill" }, [
					"Phần 2 / 5 · Ngữ pháp & Từ vựng",
				]),
				el("h1", { className: "section-title" }, [
					vg.title || "Grammar & Vocabulary",
				]),
				el("p", { className: "muted-copy" }, [
					"Chọn một đáp án đúng nhất để hoàn thành câu hoặc chọn nghĩa/cách dùng phù hợp.",
				]),
			]),
		);

		const stack = el("div", { className: "questions-stack" });
		for (const q of vg.questions) {
			stack.appendChild(
				renderMcqQuestionFieldset(
					q,
					state.answers.vocabGrammar[q.id],
					(optIdx) => {
						state.answers.vocabGrammar[q.id] = optIdx;
						persist();
					},
				),
			);
		}
		wrapper.appendChild(el("div", { className: "card" }, [stack]));

		const navBar = el("div", { className: "step-nav-bar" }, [
			el(
				"button",
				{
					type: "button",
					className: "btn btn-ghost",
					id: "prevToListeningBtn",
				},
				["← Quay lại Listening"],
			),
			el(
				"button",
				{
					type: "button",
					id: "nextToReadingBtn",
					className: "btn btn-primary btn-lg",
				},
				["Tiếp tục: Reading →"],
			),
		]);
		navBar
			.querySelector("#prevToListeningBtn")
			?.addEventListener("click", () => navigateToStep("listening"));
		navBar
			.querySelector("#nextToReadingBtn")
			?.addEventListener("click", () => navigateToStep("reading"));
		wrapper.appendChild(navBar);

		return wrapper;
	}

	function renderReadingBody(passage) {
		const bodyText = String(passage.body ?? "");
		const container = el("div", {
			className: `reading-body kind-${passage.kind || "passage"}`,
		});

		if (passage.kind === "cloze") {
			const paragraphs = bodyText.split(/\n{2,}/);
			for (const para of paragraphs) {
				const pNode = el("p", { className: "reading-paragraph" });
				const segments = para.split(/(\[\d+\])/g);
				for (const seg of segments) {
					const match = /^\[(\d+)\]$/.exec(seg);
					if (match) {
						pNode.appendChild(
							el("span", {
								className: "cloze-blank-badge",
								textContent: `(${match[1]})`,
							}),
						);
					} else {
						pNode.appendChild(document.createTextNode(seg));
					}
				}
				container.appendChild(pNode);
			}
			return container;
		}

		const blocks = bodyText.split(/\n{2,}/);
		for (const block of blocks) {
			const lines = block.split("\n");
			const pNode = el("p", { className: "reading-paragraph" });
			lines.forEach((line, idx) => {
				if (idx > 0) pNode.appendChild(document.createElement("br"));
				pNode.appendChild(document.createTextNode(line));
			});
			container.appendChild(pNode);
		}
		return container;
	}

	function renderReadingStep() {
		const reading = snapshot.reading;
		const wrapper = el("div", {
			className: "skill-view",
			dataset: { skill: "reading" },
		});
		wrapper.appendChild(renderTestHeader("reading"));

		wrapper.appendChild(
			el("section", { className: "card skill-intro-card" }, [
				el("p", { className: "kicker-pill" }, ["Phần 3 / 5 · Đọc hiểu"]),
				el("h1", { className: "section-title" }, [
					reading.title || "Reading Comprehension",
				]),
				el("p", { className: "muted-copy" }, [
					"Đọc kỹ từng biển báo, tin nhắn, bài đọc và đoạn điền từ bên dưới rồi chọn đáp án đúng.",
				]),
			]),
		);

		if (readingBackfillNotice) {
			wrapper.appendChild(
				el(
					"div",
					{
						id: "readingBackfillBanner",
						className: "provisional-notice-box",
						role: "status",
					},
					[
						el("strong", {}, ["Phần Reading vừa được cập nhật bổ sung"]),
						el("p", {}, [
							"Hệ thống vừa bổ sung đầy đủ các bài đọc hiểu cho bài kiểm tra. Vui lòng hoàn thành phần Reading trước khi chuyển sang bước tiếp theo.",
						]),
					],
				),
			);
		}

		const readingState = resolveReadingRenderState(reading);
		if (!readingState.hasPassages) {
			wrapper.appendChild(
				el("section", { id: "readingEmptyNotice", className: "card" }, [
					el("div", { className: "provisional-notice-box" }, [
						el("p", {}, [readingState.emptyMessage]),
					]),
				]),
			);
		}

		for (const passage of reading.passages) {
			const card = el("section", {
				className: "card reading-passage-card",
				dataset: {
					passageId: passage.id,
					passageKind: passage.kind || "passage",
				},
			});

			const displayPartLabel = stripInlineCefrLabel(passage.partLabel);
			const displayPassageTitle = stripInlineCefrLabel(passage.title);

			card.appendChild(
				el("div", { className: "passage-header" }, [
					el("div", { className: "clip-badges" }, [
						displayPartLabel
							? el("span", {
									className: "part-badge",
									textContent: displayPartLabel,
								})
							: null,
						el("span", {
							className: "question-tag",
							textContent: READING_KIND_LABELS[passage.kind] ?? "Bài đọc hiểu",
						}),
					]),
					displayPassageTitle
						? el("h2", {
								className: "clip-title",
								textContent: displayPassageTitle,
							})
						: null,
					passage.instruction
						? el("p", {
								className: "clip-instruction",
								textContent: passage.instruction,
							})
						: null,
				]),
			);

			card.appendChild(renderReadingBody(passage));

			const qList = el("div", { className: "questions-stack" });
			for (const q of passage.questions ?? []) {
				qList.appendChild(
					renderMcqQuestionFieldset(
						q,
						state.answers.reading[q.id],
						(optIdx) => {
							state.answers.reading[q.id] = optIdx;
							persist();
						},
					),
				);
			}
			card.appendChild(qList);
			wrapper.appendChild(card);
		}

		const navBar = el("div", { className: "step-nav-bar" }, [
			el(
				"button",
				{
					type: "button",
					className: "btn btn-ghost",
					id: "prevToVocabBtn",
				},
				["← Quay lại Grammar & Vocabulary"],
			),
			el(
				"button",
				{
					type: "button",
					id: "nextToWritingBtn",
					className: "btn btn-primary btn-lg",
				},
				["Tiếp tục: Writing →"],
			),
		]);
		navBar
			.querySelector("#prevToVocabBtn")
			?.addEventListener("click", () => navigateToStep("vocab-grammar"));
		navBar
			.querySelector("#nextToWritingBtn")
			?.addEventListener("click", () => navigateToStep("writing"));
		wrapper.appendChild(navBar);

		return wrapper;
	}

	function renderWritingStep() {
		const writingState = resolveWritingPromptState(snapshot.writing);
		const minWords = writingState.minWords;
		const maxWords = writingState.maxWords;

		const wrapper = el("div", {
			className: "skill-view",
			dataset: { skill: "writing" },
		});
		wrapper.appendChild(renderTestHeader("writing"));

		const card = el("section", { className: "card writing-card" }, [
			el("p", { className: "kicker-pill" }, ["Phần 4 / 5 · Viết (Writing)"]),
			el("h1", {
				className: "section-title",
				textContent: writingState.promptTitle,
			}),
		]);

		const promptBox = el("div", { className: "writing-prompt-box" });
		for (const line of writingState.lines) {
			promptBox.appendChild(el("p", { textContent: line }));
		}
		promptBox.appendChild(
			el("p", { className: "writing-range-hint" }, [
				`Độ dài gợi ý: ${minWords}–${maxWords} từ. Cô Đỗ Thục Mỹ sẽ chấm trực tiếp bài viết của bạn.`,
			]),
		);
		card.appendChild(promptBox);

		const textarea = el("textarea", {
			id: "writingTextarea",
			className: "writing-textarea",
			rows: "9",
			maxlength: "10000",
			placeholder: "Viết câu trả lời tiếng Anh của bạn tại đây...",
			textContent: state.writingText,
			dataset: { testid: "writing-textarea" },
		});

		const wordCountBadge = el("span", {
			id: "writingWordCount",
			className: "word-count-badge",
			dataset: { testid: "writing-word-count" },
		});
		const wordStatusHint = el("span", {
			id: "writingWordHint",
			className: "word-count-hint",
		});

		function syncWordCounter() {
			const count = countWords(textarea.value);
			wordCountBadge.textContent = `${count} / ${minWords}–${maxWords} từ`;
			wordCountBadge.classList.remove("is-ok", "is-under", "is-over");
			if (count === 0) {
				wordStatusHint.textContent = "Bạn chưa nhập nội dung.";
			} else if (count < minWords) {
				wordCountBadge.classList.add("is-under");
				wordStatusHint.textContent = `Cần thêm khoảng ${minWords - count} từ để đạt mốc gợi ý.`;
			} else if (count > maxWords) {
				wordCountBadge.classList.add("is-over");
				wordStatusHint.textContent =
					"Bài hơi dài hơn gợi ý, vẫn hợp lệ để nộp.";
			} else {
				wordCountBadge.classList.add("is-ok");
				wordStatusHint.textContent = "Đạt độ dài gợi ý.";
			}
		}

		syncWordCounter();
		textarea.addEventListener("input", () => {
			state.writingText = textarea.value;
			persist();
			syncWordCounter();
		});

		card.appendChild(
			el("div", { className: "writing-editor-wrap" }, [
				el("label", {
					for: "writingTextarea",
					className: "field-label",
					textContent: "Bài viết của bạn",
				}),
				textarea,
				el("div", { className: "writing-meta-row" }, [
					wordCountBadge,
					wordStatusHint,
				]),
			]),
		);

		wrapper.appendChild(card);

		const navBar = el("div", { className: "step-nav-bar" }, [
			el(
				"button",
				{
					type: "button",
					className: "btn btn-ghost",
					id: "prevToReadingBtn",
				},
				["← Quay lại Reading"],
			),
			el(
				"button",
				{
					type: "button",
					id: "nextToSpeakingBtn",
					className: "btn btn-primary btn-lg",
				},
				["Tiếp tục: Speaking & Nộp bài →"],
			),
		]);
		navBar
			.querySelector("#prevToReadingBtn")
			?.addEventListener("click", () => navigateToStep("reading"));
		navBar
			.querySelector("#nextToSpeakingBtn")
			?.addEventListener("click", () => navigateToStep("speaking"));
		wrapper.appendChild(navBar);

		return wrapper;
	}

	function buildSubmissionPayload(finalSpeakingMode) {
		return {
			lead: buildPlacementSubmissionLead(state.lead),
			answers: sanitizeObjectiveAnswers(snapshot, state.answers),
			writingText: state.writingText.slice(0, 10000),
			speakingMode: finalSpeakingMode,
			speakingDurationSec:
				finalSpeakingMode === "upload" && state.speakingDurationSec !== null
					? Math.min(3600, Math.max(0, Math.round(state.speakingDurationSec)))
					: null,
		};
	}

	async function uploadSpeakingMedia(
		submissionId,
		uploadToken,
		blob,
		durationSec,
	) {
		const meta = resolveSpeakingUploadMeta(blob.type);
		const headers = {
			"X-Upload-Token": uploadToken,
			"Content-Type": meta.contentType,
			"X-Media-Filename": meta.filename,
			"X-Speaking-Duration": String(Math.max(0, Math.round(durationSec ?? 0))),
		};
		const res = await fetch(
			`${apiBase}/public/placement-test/submissions/${encodeURIComponent(submissionId)}/speaking-media`,
			{
				method: "PUT",
				headers,
				body: blob,
			},
		);
		let body = null;
		try {
			body = await res.json();
		} catch {
			body = null;
		}
		if (!res.ok) {
			const errCode = body?.error || `HTTP ${res.status}`;
			throw new Error(`Tải file Speaking chưa thành công (${errCode}).`);
		}
		return body;
	}

	async function executeSubmission(finalSpeakingMode) {
		if (isSubmitting) return;
		isSubmitting = true;
		submitError = "";
		speakingUploadError = "";
		render();

		try {
			const payload = buildSubmissionPayload(finalSpeakingMode);
			const res = await fetch(`${apiBase}/public/placement-test/submissions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
				},
				body: JSON.stringify(payload),
			});

			let body = null;
			try {
				body = await res.json();
			} catch {
				body = null;
			}

			if (!res.ok) {
				if (res.status === 429) {
					submitError =
						body?.error === "PLACEMENT_DAILY_CAP"
							? "Số điện thoại này đã đạt giới hạn lượt nộp hôm nay. Vui lòng nhắn Zalo cô Mỹ nếu cần làm lại."
							: "Bạn thao tác quá nhanh. Vui lòng đợi ít phút rồi thử nộp lại.";
				} else if (res.status === 400) {
					submitError =
						"Dữ liệu bài làm hoặc thông tin liên hệ chưa hợp lệ. Vui lòng kiểm tra lại SĐT / Họ tên rồi thử nộp lại.";
				} else if (res.status === 404 || res.status === 503) {
					submitError =
						"Hệ thống nộp bài tạm thời bảo trì. Vui lòng thử lại sau hoặc nhắn Zalo cô Mỹ.";
				} else {
					submitError =
						"Hệ thống đang bận, chưa thể nộp bài. Vui lòng thử nộp lại sau giây lát.";
				}
				return;
			}

			const objective =
				body.objective ?? scoreObjectiveTest(snapshot, state.answers);
			const summaryText =
				objective.provisionalSummary || buildProvisionalSummary(objective);

			state.speakingMode = finalSpeakingMode;
			state.submission = {
				submissionId: body.submissionId,
				leadId: body.leadId,
				uploadToken: body.uploadToken ?? null,
				speakingStatus: body.speakingStatus ?? "none",
				objective,
				writingWordCount: countWords(state.writingText),
				submittedAt: new Date().toISOString(),
			};

			saveLeadDraft(
				state.lead,
				summaryText,
				objective.provisionalBand?.course || state.lead.course,
			);

			if (
				finalSpeakingMode === "upload" &&
				recordedBlob &&
				body.uploadToken &&
				body.submissionId
			) {
				try {
					await uploadSpeakingMedia(
						body.submissionId,
						body.uploadToken,
						recordedBlob,
						state.speakingDurationSec ?? 0,
					);
					state.submission.speakingStatus = "uploaded";
					state.submission.uploadToken = null;
				} catch (uploadErr) {
					state.submission.speakingStatus = "pending_upload";
					speakingUploadError =
						uploadErr instanceof Error
							? uploadErr.message
							: "Không thể tải file Speaking lên máy chủ. Bài làm vẫn đã được lưu — bạn có thể bấm Thử tải lại bên dưới.";
				}
			}

			stopPageTimer();
			stopActiveAudio();
			stopMediaStream();
			stopSpeakingIntervals();
			unansweredConfirmState = null;
			state.step = "result";
			persist();
		} catch {
			submitError =
				"Không thể kết nối máy chủ để nộp bài. Vui lòng kiểm tra kết nối mạng và thử lại.";
		} finally {
			isSubmitting = false;
			render();
			window.scrollTo({ top: 0, behavior: "smooth" });
		}
	}

	function handleRequestSubmit() {
		if (isSpeakingBusy()) {
			speakingMediaError =
				"Vui lòng hoàn thành hoặc bấm Kết thúc sớm phần ghi âm trước khi nộp bài.";
			render();
			return;
		}
		if (recordedBlob && recordedBlob.size > SPEAKING_MAX_BYTES) {
			speakingMediaError =
				"File Speaking vượt quá giới hạn 50 MB. Vui lòng ghi lại ngắn hơn hoặc chọn Bỏ qua phần Speaking.";
			render();
			return;
		}

		const progress = countObjectiveProgress(snapshot, state.answers);
		const words = countWords(state.writingText);
		const hasValidBlob = Boolean(
			recordedBlob &&
				recordedBlob.size > 0 &&
				recordedBlob.size <= SPEAKING_MAX_BYTES,
		);
		const speakingState = resolveSpeakingStepState(snapshot.speaking);
		const speakingDecision = resolveSpeakingSubmitDecision({
			hasSpeakingTasks: speakingState.hasTasks,
			hasValidBlob,
			speakingMode: state.speakingMode,
		});
		const speakingFinalMode = speakingDecision.finalMode;
		const needsSpeakingDecision = speakingDecision.needsSpeakingDecision;

		if (progress.unanswered > 0 || words === 0 || needsSpeakingDecision) {
			unansweredConfirmState = {
				unansweredObjective: progress.unanswered,
				writingEmpty: words === 0,
				speakingUnrecorded: needsSpeakingDecision,
				resolvedSpeakingMode: speakingFinalMode,
			};
			render();
			document
				.getElementById("unansweredConfirmBox")
				?.scrollIntoView({ behavior: "smooth", block: "center" });
			return;
		}

		void executeSubmission(speakingFinalMode);
	}

	function playSpeakingPrompt(task, { onFinished } = {}) {
		teardownSpeakingPromptPlayback();
		const token = ++promptPlaybackToken;
		let finished = false;
		const finishOnce = () => {
			if (finished || token !== promptPlaybackToken) return;
			finished = true;
			teardownSpeakingPromptPlayback();
			onFinished?.();
		};
		const scheduleReadingTimeout = (ms) => {
			if (readingSafetyTimeout) {
				clearTimeout(readingSafetyTimeout);
			}
			readingSafetyTimeout = setTimeout(finishOnce, ms);
		};

		const playTtsFallback = () => {
			if (finished || token !== promptPlaybackToken) return;
			const synth =
				typeof window !== "undefined" ? window.speechSynthesis : null;
			const Utter =
				typeof window !== "undefined" ? window.SpeechSynthesisUtterance : null;
			if (!synth || typeof synth.speak !== "function" || !Utter) {
				scheduleReadingTimeout(1200);
				return;
			}
			scheduleReadingTimeout(computeSpeechFallbackTimeoutMs(task?.prompt));
			try {
				synth.cancel();
				const utter = new Utter(String(task?.prompt ?? ""));
				utter.lang = "en-US";
				utter.rate = 0.95;
				utter.onend = () => finishOnce();
				utter.onerror = () => finishOnce();
				synth.speak(utter);
			} catch {
				finishOnce();
			}
		};

		const taskAudioUrl = resolveMediaUrl(apiBase, task?.src ?? "");
		if (taskAudioUrl) {
			const audio = new Audio(taskAudioUrl);
			activePromptAudio = audio;
			let durationApplied = false;
			const applyDurationTimeout = () => {
				if (finished || token !== promptPlaybackToken) return;
				if (Number.isFinite(audio.duration) && audio.duration > 0) {
					durationApplied = true;
					scheduleReadingTimeout(
						Math.min(240_000, Math.ceil(audio.duration * 1000) + 5_000),
					);
				} else if (!durationApplied) {
					scheduleReadingTimeout(30_000);
				}
			};
			// Chờ tải/play tối đa 10s trước khi fallback sang TTS; khi biết duration thực thì gia hạn đúng theo file audio.
			scheduleReadingTimeout(10_000);
			audio.onloadedmetadata = applyDurationTimeout;
			audio.ondurationchange = applyDurationTimeout;
			audio.onplaying = applyDurationTimeout;
			audio.onended = () => finishOnce();
			audio.onerror = () => playTtsFallback();
			const playPromise = audio.play?.();
			if (playPromise && typeof playPromise.catch === "function") {
				playPromise.catch(() => playTtsFallback());
			}
			return;
		}
		playTtsFallback();
	}

	function ensureRecorderRecordingForAnswer() {
		answerStartedAt = Date.now();
		hasRecordedAnyAnswer = true;
		if (!mediaRecorder) return;
		if (mediaRecorder.state === "inactive") {
			try {
				mediaRecorder.start(250);
			} catch {
				abortSpeakingSessionWithError(
					"Không thể bắt đầu ghi âm qua Micro. Vui lòng thử lại hoặc chọn Bỏ qua phần Speaking.",
				);
			}
			return;
		}
		if (
			mediaRecorder.state === "paused" &&
			typeof mediaRecorder.resume === "function"
		) {
			try {
				mediaRecorder.resume();
			} catch {
				// Keep existing recorder if resume fails
			}
		}
	}

	function pauseRecorderBetweenTasks() {
		if (answerStartedAt > 0) {
			activeAnswerMs += Math.max(0, Date.now() - answerStartedAt);
			answerStartedAt = 0;
		}
		if (
			mediaRecorder &&
			mediaRecorder.state === "recording" &&
			typeof mediaRecorder.pause === "function"
		) {
			try {
				mediaRecorder.pause();
			} catch {
				// Ignore pause errors on browsers lacking pause support
			}
		}
	}

	function clearSpeakingPhaseTimer() {
		if (speakingPhaseInterval) {
			clearInterval(speakingPhaseInterval);
			speakingPhaseInterval = null;
		}
	}

	function finalizeSpeakingRecording({ discard = false } = {}) {
		stopSpeakingIntervals();
		if (answerStartedAt > 0) {
			activeAnswerMs += Math.max(0, Date.now() - answerStartedAt);
			answerStartedAt = 0;
		}
		speakingDiscardOnStop = discard;
		if (mediaRecorder && mediaRecorder.state !== "inactive") {
			try {
				isFinalizingRecording = true;
				render();
				mediaRecorder.stop();
				return;
			} catch {
				// Fall through to cleanup if stop() throws on dead stream/recorder
			}
		}
		stopMediaStream();
		mediaRecorder = null;
		isFinalizingRecording = false;
		const totalTasks = snapshot?.speaking?.tasks?.length ?? 0;
		speakingSession = createInitialSpeakingSession(totalTasks);
		activeAnswerMs = 0;
		hasRecordedAnyAnswer = false;
		recordedChunks = [];
		render();
	}

	function startPhaseCountdown(tasks) {
		clearSpeakingPhaseTimer();
		if (
			speakingSession.status !== "active" ||
			(speakingSession.phase !== "prep" && speakingSession.phase !== "answer")
		) {
			return;
		}
		speakingPhaseInterval = setInterval(() => {
			if (speakingSession.status !== "active") {
				clearSpeakingPhaseTimer();
				return;
			}
			if (speakingSession.secondsLeft > 1) {
				speakingSession = {
					...speakingSession,
					secondsLeft: speakingSession.secondsLeft - 1,
				};
				const timerEl = document.getElementById("speakingTimerValue");
				if (timerEl) {
					timerEl.textContent = formatClock(speakingSession.secondsLeft);
				}
				return;
			}
			clearSpeakingPhaseTimer();
			if (speakingSession.phase === "prep") {
				enterAnswerPhase(tasks);
			} else if (speakingSession.phase === "answer") {
				completeCurrentTaskAnswer(tasks);
			}
		}, 1000);
	}

	function advanceAfterReading(tasks) {
		if (
			speakingSession.status !== "active" ||
			speakingSession.phase !== "reading"
		) {
			return;
		}
		teardownSpeakingPromptPlayback();
		speakingSession = transitionSpeakingAfterReading(speakingSession, tasks);
		if (speakingSession.phase === "answer") {
			ensureRecorderRecordingForAnswer();
		}
		if (speakingSession.status === "active") {
			startPhaseCountdown(tasks);
		}
		render();
	}

	function enterAnswerPhase(tasks) {
		if (
			speakingSession.status !== "active" ||
			(speakingSession.phase !== "prep" && speakingSession.phase !== "reading")
		) {
			return;
		}
		stopSpeakingIntervals();
		speakingSession = transitionSpeakingToAnswer(speakingSession, tasks);
		if (speakingSession.status === "active") {
			ensureRecorderRecordingForAnswer();
			startPhaseCountdown(tasks);
		}
		render();
	}

	function beginTaskReadingPhase(taskIndex, tasks) {
		clearSpeakingPhaseTimer();
		speakingSession = startSpeakingTaskReading(
			speakingSession,
			taskIndex,
			tasks,
		);
		render();
		const activeTask = tasks[speakingSession.taskIndex];
		if (activeTask) {
			playSpeakingPrompt(activeTask, {
				onFinished: () => advanceAfterReading(tasks),
			});
		}
	}

	function completeCurrentTaskAnswer(tasks) {
		stopSpeakingIntervals();
		pauseRecorderBetweenTasks();
		const next = transitionSpeakingNextTask(speakingSession, tasks);
		if (next.status === "completed") {
			speakingSession = next;
			finalizeSpeakingRecording({ discard: false });
			return;
		}
		beginTaskReadingPhase(next.taskIndex, tasks);
	}

	function renderSpeakingStep() {
		const speaking = snapshot.speaking;
		const speakingState = resolveSpeakingStepState(speaking);
		const tasks = speaking.tasks;
		const hasMediaApi = Boolean(
			navigator.mediaDevices &&
				typeof navigator.mediaDevices.getUserMedia === "function" &&
				typeof window.MediaRecorder === "function",
		);
		const isSpeakingActive =
			speakingSession.status === "active" || isFinalizingRecording;
		const hasValidBlob = Boolean(
			recordedBlob && state.speakingMode === "upload" && !isSpeakingActive,
		);

		const wrapper = el("div", {
			className: "skill-view",
			dataset: { skill: "speaking" },
		});
		wrapper.appendChild(renderTestHeader("speaking"));

		const introCard = el("section", { className: "card skill-intro-card" }, [
			el("p", { className: "kicker-pill" }, ["Phần 5 / 5 · Nói (Speaking)"]),
			el("h1", { className: "section-title" }, [
				"Kiểm tra Speaking — Hệ thống đọc từng câu hỏi & thu âm qua Micro",
			]),
			el("p", { className: "muted-copy" }, [
				speakingState.hasTasks
					? "Hệ thống sẽ tự động đọc lần lượt từng câu hỏi, cho bạn thời gian chuẩn bị rồi ghi âm bằng micro (chỉ thu âm thanh, không cần camera) và ghép thành một bản ghi duy nhất."
					: "Bài kiểm tra hiện tại chưa bao gồm câu hỏi Speaking. Bạn có thể kiểm tra lại các phần đã làm hoặc bấm Nộp bài ngay bên dưới.",
			]),
		]);
		wrapper.appendChild(introCard);

		if (!speakingState.hasTasks) {
			wrapper.appendChild(
				el(
					"section",
					{ id: "speakingEmptyNotice", className: "card speaking-tasks-card" },
					[
						el("div", { className: "provisional-notice-box" }, [
							el("p", {}, [speakingState.emptyMessage]),
						]),
					],
				),
			);
		} else {
			const recorderCard = el("section", {
				id: "speakingRecorderCard",
				className: "card speaking-recorder-card",
			});

			if (speakingMediaError) {
				recorderCard.appendChild(
					el(
						"div",
						{
							id: "speakingErrorBanner",
							className: "form-error-banner",
							role: "alert",
						},
						[speakingMediaError],
					),
				);
			}

			if (!hasMediaApi) {
				recorderCard.appendChild(
					el("div", { className: "provisional-notice-box" }, [
						"Trình duyệt hoặc thiết bị hiện tại không hỗ trợ API ghi âm (MediaRecorder). Bạn có thể bấm ",
						el("strong", {}, ["Bỏ qua phần Speaking"]),
						" bên dưới để hoàn tất nộp bài ngay.",
					]),
				);
			}

			if (isSpeakingActive) {
				const taskIdx = Math.min(
					Math.max(0, speakingSession.taskIndex),
					tasks.length - 1,
				);
				const activeTask = tasks[taskIdx] ?? tasks[0];
				const timings = resolveTaskTimings(activeTask);
				const progressPct = Math.round(((taskIdx + 1) / tasks.length) * 100);
				const phase = speakingSession.phase;

				const phaseLabels = {
					reading: "🔊 Hệ thống đang đọc câu hỏi...",
					prep: "⏳ Thời gian chuẩn bị",
					answer: "🔴 Đang ghi âm câu trả lời (Micro)",
				};
				const phaseLabel = phaseLabels[phase] ?? "⏳ Đang xử lý phần ghi âm...";
				const timerDisplay = isFinalizingRecording
					? "Đang hoàn tất..."
					: phase === "reading"
						? "Đang phát đề"
						: formatClock(speakingSession.secondsLeft);

				const activePartLabel = stripInlineCefrLabel(activeTask?.partLabel);
				const sessionCard = el("div", {
					id: "speakingSessionCard",
					className: "speaking-session-card",
				});

				sessionCard.appendChild(
					el("div", { className: "speaking-progress-header" }, [
						el("div", { className: "speaking-task-meta" }, [
							el("strong", { className: "speaking-progress-title" }, [
								`Câu ${taskIdx + 1} / ${tasks.length}`,
							]),
							activePartLabel
								? el("span", {
										className: "part-badge",
										textContent: activePartLabel,
									})
								: null,
							el("span", {
								className: "speaking-timing-hint",
								textContent: `Chuẩn bị ${timings.prepSeconds}s · Trả lời ${timings.answerSeconds}s`,
							}),
						]),
						el(
							"div",
							{
								className: "speaking-progress-track",
								role: "progressbar",
								"aria-valuemin": "1",
								"aria-valuemax": String(tasks.length),
								"aria-valuenow": String(taskIdx + 1),
							},
							[
								el("div", {
									className: "speaking-progress-fill",
									style: `width: ${progressPct}%`,
								}),
							],
						),
					]),
				);

				sessionCard.appendChild(
					el(
						"div",
						{
							id: "speakingPhaseBanner",
							className: `speaking-phase-banner is-${phase}`,
						},
						[
							el("div", { className: "speaking-phase-label-wrap" }, [
								phase === "answer"
									? el("span", {
											className: "rec-dot is-pulsing",
											"aria-hidden": "true",
										})
									: null,
								el(
									"span",
									{
										id: "speakingPhaseBadge",
										className: "speaking-phase-pill",
									},
									[phaseLabel],
								),
							]),
							el(
								"span",
								{
									id: "speakingTimerValue",
									className: "speaking-timer-pill",
									"aria-live": "polite",
								},
								[timerDisplay],
							),
						],
					),
				);

				if (activeTask) {
					sessionCard.appendChild(
						el(
							"div",
							{ id: "speakingActiveTask", className: "speaking-teleprompter" },
							[
								el("p", { className: "teleprompter-label" }, [
									`Câu hỏi ${taskIdx + 1}/${tasks.length}${activePartLabel ? ` · ${activePartLabel}` : ""}`,
								]),
								el("p", {
									id: "speakingActivePrompt",
									className: "teleprompter-prompt",
									textContent: activeTask.prompt,
								}),
							],
						),
					);
				}

				const controls = el("div", { className: "speaking-actions-row" });

				if (phase === "reading" && !isFinalizingRecording) {
					const skipReadBtn = el(
						"button",
						{
							type: "button",
							id: "speakingSkipReadingBtn",
							className: "btn btn-teal",
						},
						["Chuẩn bị ngay →"],
					);
					skipReadBtn.addEventListener("click", () =>
						advanceAfterReading(tasks),
					);
					controls.appendChild(skipReadBtn);
				}

				if (phase === "prep" && !isFinalizingRecording) {
					const replayAllowed = canReplaySpeakingPrompt(speakingSession);
					const replayBtn = el(
						"button",
						{
							type: "button",
							id: "speakingReplayPromptBtn",
							className: "btn btn-ghost",
							disabled: !replayAllowed,
						},
						[
							speakingSession.replayUsedForCurrentTask
								? "Đã nghe lại (1/1)"
								: "🔊 Nghe lại câu hỏi",
						],
					);
					replayBtn.addEventListener("click", () => {
						if (!canReplaySpeakingPrompt(speakingSession) || !activeTask)
							return;
						speakingSession = {
							...speakingSession,
							replayUsedForCurrentTask: true,
						};
						isPromptReplaying = true;
						render();
						playSpeakingPrompt(activeTask, {
							onFinished: () => {
								isPromptReplaying = false;
								const statusEl = document.getElementById(
									"speakingReplayStatus",
								);
								if (statusEl) {
									statusEl.textContent = "Đã phát lại câu hỏi (1/1)";
								}
							},
						});
					});
					controls.appendChild(replayBtn);

					const startAnswerNowBtn = el(
						"button",
						{
							type: "button",
							id: "speakingStartAnswerNowBtn",
							className: "btn btn-teal",
						},
						["🎙️ Trả lời ngay →"],
					);
					startAnswerNowBtn.addEventListener("click", () =>
						enterAnswerPhase(tasks),
					);
					controls.appendChild(startAnswerNowBtn);
				}

				if (phase === "answer" && !isFinalizingRecording) {
					const nextTaskBtn = el(
						"button",
						{
							type: "button",
							id: "speakingNextTaskBtn",
							className: "btn btn-teal",
						},
						[
							taskIdx < tasks.length - 1
								? "✓ Xong câu này → Câu tiếp theo"
								: "✓ Hoàn thành phần Speaking",
						],
					);
					nextTaskBtn.addEventListener("click", () =>
						completeCurrentTaskAnswer(tasks),
					);
					controls.appendChild(nextTaskBtn);
				}

				const finishEarlyBtn = el(
					"button",
					{
						type: "button",
						id: "speakingFinishEarlyBtn",
						className: "btn btn-danger",
						disabled: isFinalizingRecording,
					},
					[isFinalizingRecording ? "Đang lưu bài nói..." : "■ Kết thúc sớm"],
				);
				finishEarlyBtn.addEventListener("click", () => {
					const shouldDiscard =
						!hasRecordedAnyAnswer && speakingSession.phase !== "answer";
					finalizeSpeakingRecording({ discard: shouldDiscard });
				});
				controls.appendChild(finishEarlyBtn);

				sessionCard.appendChild(controls);
				if (phase === "prep") {
					sessionCard.appendChild(
						el(
							"p",
							{
								id: "speakingReplayStatus",
								className: "speaking-timing-hint",
								"aria-live": "polite",
							},
							[
								isPromptReplaying
									? "Đang phát lại câu hỏi..."
									: speakingSession.replayUsedForCurrentTask
										? "Đã dùng lượt nghe lại cho câu này (1/1)."
										: "Bạn có thể bấm Nghe lại câu hỏi tối đa 1 lần trước khi trả lời.",
							],
						),
					);
				}
				recorderCard.appendChild(sessionCard);
			} else if (hasValidBlob) {
				const sizeMb = (recordedBlob.size / (1024 * 1024)).toFixed(2);
				const isTooLarge = recordedBlob.size > SPEAKING_MAX_BYTES;

				const reviewBox = el("div", {
					id: "speakingReviewBox",
					className: "speaking-review-box",
				});
				reviewBox.appendChild(
					el("div", { className: "speaking-review-meta" }, [
						el("span", { className: "status-pill is-ok" }, [
							"Đã ghi âm hoàn tất (sẵn sàng nộp)",
						]),
						el("span", {}, [
							`Thời lượng trả lời: ${state.speakingDurationSec ?? 0}s · Dung lượng: ${sizeMb} MB / 50 MB`,
						]),
					]),
				);

				if (isTooLarge) {
					reviewBox.appendChild(
						el("p", { className: "form-error-banner", role: "alert" }, [
							"Bản ghi vượt quá giới hạn 50 MB. Vui lòng bấm Ghi lại ngắn hơn hoặc chọn Bỏ qua phần Speaking.",
						]),
					);
				}

				if (recordedBlobUrl) {
					reviewBox.appendChild(
						el("audio", {
							id: "speakingPlaybackAudio",
							className: "speaking-playback-audio",
							controls: true,
							preload: "metadata",
							src: recordedBlobUrl,
						}),
					);
				}

				const retakeBtn = el(
					"button",
					{
						type: "button",
						id: "retakeSpeakingBtn",
						className: "btn btn-ghost",
					},
					["↺ Ghi lại từ đầu"],
				);
				retakeBtn.addEventListener("click", () => {
					speakingStartToken += 1;
					isRequestingMic = false;
					stopSpeakingIntervals();
					stopMediaStream();
					revokeRecordedUrl();
					recordedBlob = null;
					recordedChunks = [];
					speakingSession = createInitialSpeakingSession(tasks.length);
					activeAnswerMs = 0;
					answerStartedAt = 0;
					hasRecordedAnyAnswer = false;
					state.speakingMode = "none";
					state.speakingDurationSec = null;
					speakingMediaError = "";
					persist();
					render();
				});
				reviewBox.appendChild(
					el("div", { className: "speaking-actions-row" }, [retakeBtn]),
				);
				recorderCard.appendChild(reviewBox);
			} else {
				const estimatedTotalSec = tasks.reduce((acc, task) => {
					const { prepSeconds, answerSeconds } = resolveTaskTimings(task);
					return acc + prepSeconds + answerSeconds + 5;
				}, 0);
				const estimatedMinutes = Math.max(1, Math.ceil(estimatedTotalSec / 60));

				if (state.speakingMode === "skipped") {
					recorderCard.appendChild(
						el("div", { className: "speaking-skipped-box" }, [
							el("span", { className: "status-pill is-muted" }, [
								"Đã chọn bỏ qua phần Speaking",
							]),
							el("p", {}, [
								"Bạn có thể bấm Nộp bài ngay bên dưới (chỉ chấm 4 kỹ năng đã làm), hoặc bấm Bắt đầu làm bài Speaking nếu đổi ý.",
							]),
						]),
					);
				}

				const overviewCard = el("div", {
					id: "speakingOverviewCard",
					className: "speaking-overview-card",
				});
				overviewCard.appendChild(
					el("div", { className: "speaking-overview-grid" }, [
						el("div", { className: "speaking-overview-stat" }, [
							el("span", { className: "speaking-stat-label" }, ["Số câu hỏi"]),
							el("strong", {}, [`${tasks.length} câu tuần tự`]),
						]),
						el("div", { className: "speaking-overview-stat" }, [
							el("span", { className: "speaking-stat-label" }, [
								"Thời lượng ước tính",
							]),
							el("strong", {}, [`~${estimatedMinutes} phút`]),
						]),
						el("div", { className: "speaking-overview-stat" }, [
							el("span", { className: "speaking-stat-label" }, ["Phương thức"]),
							el("strong", {}, ["Audio-only (chỉ Micro)"]),
						]),
					]),
				);
				overviewCard.appendChild(
					el("ol", { className: "speaking-overview-steps" }, [
						el("li", {}, [
							"Cấp quyền micro một lần. Nội dung từng câu hỏi sẽ lần lượt xuất hiện khi bắt đầu thi (không hiện trước đề).",
						]),
						el("li", {}, [
							`Hệ thống đọc từng câu từ câu 1 đến câu ${tasks.length}, đếm ngược chuẩn bị rồi tự bật ghi âm câu trả lời của bạn.`,
						]),
						el("li", {}, [
							"Giữa các câu máy tự tạm dừng ghi và ghép thành một file âm thanh duy nhất khi hoàn thành.",
						]),
					]),
				);
				recorderCard.appendChild(overviewCard);

				const actionRow = el("div", { className: "speaking-actions-row" });
				const startBtn = el(
					"button",
					{
						type: "button",
						id: "startSpeakingBtn",
						className: "btn btn-teal",
						disabled: !hasMediaApi || isRequestingMic,
					},
					[
						isRequestingMic
							? "⏳ Đang xin quyền micro..."
							: "🎙️ Bắt đầu làm bài Speaking",
					],
				);

				startBtn.addEventListener("click", async () => {
					if (!hasMediaApi || isRequestingMic || isSpeakingBusy()) return;
					speakingMediaError = "";
					unansweredConfirmState = null;
					isRequestingMic = true;
					const startToken = ++speakingStartToken;
					render();

					try {
						const stream = await navigator.mediaDevices.getUserMedia({
							audio: true,
							video: false,
						});
						if (
							startToken !== speakingStartToken ||
							state.step !== "speaking" ||
							state.speakingMode === "skipped"
						) {
							for (const track of stream.getTracks()) {
								try {
									track.stop();
								} catch {
									// Ignore stale stream cleanup errors
								}
							}
							isRequestingMic = false;
							render();
							return;
						}

						isRequestingMic = false;
						stopMediaStream();
						mediaStream = stream;

						preferredRecorderMime = pickSupportedRecorderMime(
							window.MediaRecorder,
						);
						const recorder = preferredRecorderMime
							? new window.MediaRecorder(stream, {
									mimeType: preferredRecorderMime,
								})
							: new window.MediaRecorder(stream);
						mediaRecorder = recorder;

						recordedChunks = [];
						activeAnswerMs = 0;
						answerStartedAt = 0;
						hasRecordedAnyAnswer = false;
						speakingDiscardOnStop = false;
						isFinalizingRecording = false;

						for (const track of stream.getAudioTracks()) {
							track.addEventListener("ended", () => {
								if (isStoppingMediaStream || mediaRecorder !== recorder) return;
								if (
									speakingSession.status === "active" ||
									isFinalizingRecording
								) {
									abortSpeakingSessionWithError(
										"Kết nối Micro bị gián đoạn giữa chừng. Vui lòng thử ghi lại hoặc chọn Bỏ qua phần Speaking.",
									);
								}
							});
						}

						recorder.addEventListener("dataavailable", (evt) => {
							if (evt.data && evt.data.size > 0) {
								recordedChunks.push(evt.data);
							}
						});

						recorder.addEventListener("error", () => {
							if (mediaRecorder !== recorder) return;
							abortSpeakingSessionWithError(
								"Trình duyệt gặp lỗi khi thu âm Micro. Vui lòng thử lại hoặc chọn Bỏ qua phần Speaking.",
							);
						});

						recorder.addEventListener("stop", () => {
							if (mediaRecorder !== recorder) return;
							mediaRecorder = null;
							const discardNow = speakingDiscardOnStop;
							speakingDiscardOnStop = false;
							isFinalizingRecording = false;
							stopSpeakingIntervals();
							stopMediaStream();

							if (discardNow) {
								speakingSession = createInitialSpeakingSession(tasks.length);
								activeAnswerMs = 0;
								answerStartedAt = 0;
								hasRecordedAnyAnswer = false;
								recordedChunks = [];
								render();
								return;
							}

							const finalDuration = Math.max(
								1,
								Math.round(activeAnswerMs / 1000),
							);
							const rawMime =
								recorder.mimeType || preferredRecorderMime || "audio/webm";
							const normalizedMime =
								resolveSpeakingUploadMeta(rawMime).contentType;

							const blob = new Blob(recordedChunks, { type: normalizedMime });
							if (blob.size > 0) {
								revokeRecordedUrl();
								recordedBlob = blob;
								recordedBlobUrl = URL.createObjectURL(blob);
								state.speakingMode = "upload";
								state.speakingDurationSec = finalDuration;
								speakingSession = {
									...speakingSession,
									status: "completed",
									phase: "done",
									secondsLeft: 0,
								};
							} else {
								speakingSession = createInitialSpeakingSession(tasks.length);
								speakingMediaError =
									"Không thu được dữ liệu âm thanh. Vui lòng thử ghi lại hoặc chọn Bỏ qua.";
							}
							persist();
							render();
						});

						beginTaskReadingPhase(0, tasks);
					} catch {
						isRequestingMic = false;
						mediaRecorder = null;
						stopMediaStream();
						speakingSession = createInitialSpeakingSession(tasks.length);
						speakingMediaError =
							"Không thể truy cập Micro (thiếu quyền hoặc không có micro). Bạn có thể cấp quyền lại hoặc chọn Bỏ qua phần Speaking.";
						render();
					}
				});

				const skipBtn = el(
					"button",
					{
						type: "button",
						id: "skipSpeakingBtn",
						className: "btn btn-ghost",
					},
					["Bỏ qua phần Speaking (nộp bài không kèm ghi âm)"],
				);
				skipBtn.addEventListener("click", () => {
					speakingStartToken += 1;
					isRequestingMic = false;
					stopSpeakingIntervals();
					stopMediaStream();
					revokeRecordedUrl();
					recordedBlob = null;
					recordedChunks = [];
					speakingSession = createInitialSpeakingSession(tasks.length);
					activeAnswerMs = 0;
					answerStartedAt = 0;
					hasRecordedAnyAnswer = false;
					state.speakingMode = "skipped";
					state.speakingDurationSec = null;
					speakingMediaError = "";
					unansweredConfirmState = null;
					persist();
					render();
				});

				actionRow.appendChild(startBtn);
				actionRow.appendChild(skipBtn);
				recorderCard.appendChild(actionRow);
			}

			wrapper.appendChild(recorderCard);
		}

		if (submitError) {
			wrapper.appendChild(
				el(
					"div",
					{
						id: "submitErrorBanner",
						className: "form-error-banner",
						role: "alert",
					},
					[submitError],
				),
			);
		}

		if (unansweredConfirmState) {
			const reminders = [];
			if (unansweredConfirmState.unansweredObjective > 0) {
				reminders.push(
					`còn ${unansweredConfirmState.unansweredObjective} câu khách quan chưa trả lời`,
				);
			}
			if (unansweredConfirmState.writingEmpty) {
				reminders.push("phần Writing đang để trống");
			}
			if (unansweredConfirmState.speakingUnrecorded) {
				reminders.push("phần Speaking chưa ghi âm");
			}

			const confirmBox = el(
				"div",
				{
					id: "unansweredConfirmBox",
					className: "confirm-submit-box",
					role: "alertdialog",
					"aria-labelledby": "confirmTitle",
				},
				[
					el("strong", { id: "confirmTitle" }, [
						"Một số phần vẫn đang bỏ trống",
					]),
					el("p", {}, [
						`Hiện tại bài làm của bạn ${reminders.join(", ")}. Bạn vẫn muốn nộp bài ngay chứ?`,
					]),
					el("div", { className: "confirm-actions" }, [
						el(
							"button",
							{
								type: "button",
								id: "cancelSubmitBtn",
								className: "btn btn-ghost",
							},
							["Quay lại kiểm tra"],
						),
						el(
							"button",
							{
								type: "button",
								id: "confirmSubmitBtn",
								className: "btn btn-primary",
								disabled: isSubmitting,
							},
							[isSubmitting ? "Đang nộp bài..." : "Vẫn nộp bài ngay"],
						),
					]),
				],
			);

			confirmBox
				.querySelector("#cancelSubmitBtn")
				?.addEventListener("click", () => {
					unansweredConfirmState = null;
					render();
				});
			confirmBox
				.querySelector("#confirmSubmitBtn")
				?.addEventListener("click", () => {
					void executeSubmission(unansweredConfirmState.resolvedSpeakingMode);
				});
			wrapper.appendChild(confirmBox);
		}

		const navBar = el("div", { className: "step-nav-bar" }, [
			el(
				"button",
				{
					type: "button",
					className: "btn btn-ghost",
					id: "prevToWritingBtn",
				},
				["← Quay lại Writing"],
			),
			el(
				"button",
				{
					type: "button",
					id: "submitTestBtn",
					className: "btn btn-primary btn-lg",
					disabled: isSubmitting || isSpeakingBusy(),
				},
				[isSubmitting ? "Đang nộp bài..." : "Hoàn thành & Nộp bài 5 kỹ năng"],
			),
		]);
		navBar
			.querySelector("#prevToWritingBtn")
			?.addEventListener("click", () => navigateToStep("writing"));
		navBar
			.querySelector("#submitTestBtn")
			?.addEventListener("click", handleRequestSubmit);
		wrapper.appendChild(navBar);

		return wrapper;
	}

	function renderResultStep() {
		const submission = state.submission;
		const objective =
			submission?.objective ?? scoreObjectiveTest(snapshot, state.answers);
		const summaryText =
			objective.provisionalSummary || buildProvisionalSummary(objective);
		const writingWordCount =
			submission?.writingWordCount ?? countWords(state.writingText);
		const speakingStatus = submission?.speakingStatus ?? "skipped";

		const resultCard = el("section", {
			id: "testResultCard",
			className: "card result-card",
		});

		resultCard.appendChild(
			el(
				"span",
				{
					className: "provisional-badge",
					dataset: { testid: "provisional-badge" },
				},
				["Kết quả tạm tính — Chờ chấm Writing & Speaking"],
			),
		);

		resultCard.appendChild(
			el("h1", { className: "display-title" }, [
				"Kết quả tạm tính — Chờ chấm Writing & Speaking",
			]),
		);

		resultCard.appendChild(
			el("div", { className: "teacher-grading-callout" }, [
				el("strong", {}, ["Thông báo chấm bài chính thức: "]),
				"Cô Đỗ Thục Mỹ sẽ trực tiếp chấm phần Writing & Speaking và gửi kết quả xếp lớp CEFR chính thức kèm lộ trình chi tiết qua Zalo.",
			]),
		);

		// Objective headline score card (NO final official CEFR label claimed!)
		resultCard.appendChild(
			el("div", { className: "provisional-hero-grid" }, [
				el("div", { className: "provisional-score-box" }, [
					el("span", { className: "score-label" }, [
						"Trung bình 3 phần khách quan",
					]),
					el(
						"strong",
						{
							className: "score-big",
							dataset: { testid: "objective-average-pct" },
						},
						[`${objective.averagePct}%`],
					),
					el("span", { className: "score-sub" }, [
						`Đúng ${objective.totalCorrect}/${objective.totalQuestions} câu (chưa bao gồm Writing & Speaking)`,
					]),
				]),
				el("div", { className: "provisional-score-box is-pending" }, [
					el("span", { className: "score-label" }, ["Xếp lớp CEFR chính thức"]),
					el("strong", { className: "score-pending-title" }, [
						"Đang chờ chấm Writing & Speaking",
					]),
					el("span", { className: "score-sub" }, [
						"Sau khi chấm đủ kỹ năng nói & viết, cô Mỹ sẽ chốt mức lớp phù hợp nhất.",
					]),
				]),
			]),
		);

		// 3 Objective skills + Writing + Speaking status cards
		const listeningPct =
			objective.listening.pct === null ? "—" : `${objective.listening.pct}%`;
		const vgPct =
			objective.vocabGrammar.pct === null
				? "—"
				: `${objective.vocabGrammar.pct}%`;
		const readingPct =
			objective.reading.pct === null ? "—" : `${objective.reading.pct}%`;

		const { label: speakingLabel, badgeClass: speakingBadgeClass } =
			resolveSpeakingStatusDisplay(speakingStatus);

		resultCard.appendChild(
			el("div", { className: "result-skills-grid" }, [
				el(
					"div",
					{
						className: "skill-score-tile",
						dataset: { skillResult: "listening" },
					},
					[
						el("span", { className: "tile-label" }, ["1. Listening"]),
						el("strong", { className: "tile-value" }, [
							`${objective.listening.correct}/${objective.listening.total} (${listeningPct})`,
						]),
					],
				),
				el(
					"div",
					{
						className: "skill-score-tile",
						dataset: { skillResult: "vocab-grammar" },
					},
					[
						el("span", { className: "tile-label" }, [
							"2. Grammar & Vocabulary",
						]),
						el("strong", { className: "tile-value" }, [
							`${objective.vocabGrammar.correct}/${objective.vocabGrammar.total} (${vgPct})`,
						]),
					],
				),
				el(
					"div",
					{
						className: "skill-score-tile",
						dataset: { skillResult: "reading" },
					},
					[
						el("span", { className: "tile-label" }, ["3. Reading"]),
						el("strong", { className: "tile-value" }, [
							`${objective.reading.correct}/${objective.reading.total} (${readingPct})`,
						]),
					],
				),
				el(
					"div",
					{
						className: "skill-score-tile",
						dataset: { skillResult: "writing" },
					},
					[
						el("span", { className: "tile-label" }, ["4. Writing"]),
						el("strong", { className: "tile-value-sm" }, [
							writingWordCount > 0
								? `${writingWordCount} từ · Chờ cô chấm`
								: "Chưa viết nội dung",
						]),
					],
				),
				el(
					"div",
					{
						className: "skill-score-tile",
						dataset: { skillResult: "speaking" },
					},
					[
						el("span", { className: "tile-label" }, ["5. Speaking"]),
						el("strong", { className: `tile-value-sm ${speakingBadgeClass}` }, [
							speakingLabel,
						]),
					],
				),
			]),
		);

		// Retry Speaking Media Upload box if upload failed
		if (speakingStatus === "pending_upload") {
			const retryBox = el("div", {
				id: "speakingUploadRetryBox",
				className: "speaking-retry-box",
				role: "alert",
			});
			retryBox.appendChild(
				el("strong", {}, ["File Speaking chưa tải lên hoàn tất"]),
			);
			retryBox.appendChild(
				el("p", {}, [
					speakingUploadError ||
						"Bài làm 4 kỹ năng còn lại đã được lưu an toàn. Bạn có thể thử tải lại bản ghi Speaking ngay bây giờ.",
				]),
			);
			const canRetryUpload = Boolean(
				recordedBlob && submission?.submissionId && submission?.uploadToken,
			);
			if (canRetryUpload) {
				const retryUploadBtn = el(
					"button",
					{
						type: "button",
						id: "retrySpeakingUploadBtn",
						className: "btn btn-teal",
						disabled: isUploadingSpeaking,
					},
					[
						isUploadingSpeaking
							? "Đang tải lại..."
							: "Thử tải lại audio Speaking",
					],
				);
				retryUploadBtn.addEventListener("click", async () => {
					if (isUploadingSpeaking) return;
					isUploadingSpeaking = true;
					speakingUploadError = "";
					render();
					try {
						await uploadSpeakingMedia(
							submission.submissionId,
							submission.uploadToken,
							recordedBlob,
							state.speakingDurationSec ?? 0,
						);
						state.submission.speakingStatus = "uploaded";
						state.submission.uploadToken = null;
						persist();
					} catch (err) {
						speakingUploadError =
							err instanceof Error
								? err.message
								: "Thử tải lại chưa thành công. Vui lòng thử lại hoặc nhắn Zalo cô Mỹ.";
					} finally {
						isUploadingSpeaking = false;
						render();
					}
				});
				retryBox.appendChild(retryUploadBtn);
			} else {
				retryBox.appendChild(
					el("p", { className: "muted-copy" }, [
						"Bản ghi tạm trên trình duyệt không còn khả dụng sau khi tải lại trang. Vui lòng nhắn Zalo cô Mỹ để được hỗ trợ hẹn lịch Speaking ngắn.",
					]),
				);
			}
			resultCard.appendChild(retryBox);
		}

		// Breakdown by CEFR level
		if (Array.isArray(objective.byLevel) && objective.byLevel.length > 0) {
			const sortedLevels = [...objective.byLevel].sort((a, b) => {
				const ia = CEFR_ORDER.indexOf(a.level);
				const ib = CEFR_ORDER.indexOf(b.level);
				return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
			});

			resultCard.appendChild(
				el("div", { className: "level-breakdown-section" }, [
					el("h2", { className: "subsection-title" }, [
						"Phân tích theo từng cấp độ câu hỏi",
					]),
					el(
						"div",
						{ className: "level-bars-grid" },
						sortedLevels.map((item) =>
							el("div", { className: "level-bar-card" }, [
								el("div", { className: "level-bar-head" }, [
									el("strong", { textContent: item.level }),
									el("span", {
										textContent: `${item.correct}/${item.total} (${item.pct}%)`,
									}),
								]),
								el("div", { className: "level-bar-track" }, [
									el("div", {
										className: "level-bar-fill",
										style: `width: ${Math.max(0, Math.min(100, item.pct))}%`,
									}),
								]),
							]),
						),
					),
				]),
			);
		}

		// CTAs: Zalo + #registerWithResultBtn + Retry
		const params = new URLSearchParams({
			ketqua: summaryText,
			khoa: objective.provisionalBand?.course || state.lead.course || "",
		});
		const consultHref = `../?${params.toString()}#dang-ky-tu-van`;

		const registerBtn = el(
			"button",
			{
				type: "button",
				id: "registerWithResultBtn",
				className: "btn btn-primary btn-lg",
				disabled: consultSaving,
			},
			[
				consultSaving
					? "Đang lưu yêu cầu tư vấn..."
					: "Đăng ký tư vấn lộ trình kèm kết quả tạm tính",
			],
		);

		registerBtn.addEventListener("click", async () => {
			if (consultSaving) return;
			consultSaving = true;
			consultSavedMessage = "";
			render();

			saveLeadDraft(
				state.lead,
				summaryText,
				objective.provisionalBand?.course || state.lead.course,
			);

			try {
				const payload = buildLeadPayload({
					lead: {
						...state.lead,
						course:
							state.lead.course || objective.provisionalBand?.course || "",
					},
					placement: summaryText,
					elapsedMs: Date.now() - pageOpenedAt,
				});
				const res = await fetch(`${apiBase}/public/leads`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
					},
					body: JSON.stringify(payload),
				});
				if (res.ok) {
					consultSavedMessage = `Đã lưu yêu cầu tư vấn kèm kết quả tạm tính cho SĐT ${state.lead.phone}. Cô Đỗ Thục Mỹ sẽ chấm Writing & Speaking và gửi lộ trình chi tiết qua Zalo!`;
				} else {
					consultSavedMessage =
						"Thông tin kết quả tạm tính đã được lưu sẵn. Bạn có thể bấm nhắn Zalo hoặc mở biểu mẫu trang chủ bên dưới để gửi thêm ghi chú.";
				}
			} catch {
				consultSavedMessage =
					"Thông tin kết quả tạm tính đã được lưu tạm trên máy. Bạn có thể bấm nhắn Zalo cô Mỹ hoặc mở biểu mẫu trang chủ bên dưới.";
			} finally {
				consultSaving = false;
				render();
			}
		});

		const ctaRow = el("div", { className: "result-cta-row" }, [
			el(
				"a",
				{
					id: "zaloResultCta",
					href: ZALO_URL,
					target: "_blank",
					rel: "noopener noreferrer",
					className: "btn btn-teal btn-lg",
				},
				["Nhắn Zalo cô Đỗ Thục Mỹ (0929 060 994)"],
			),
			registerBtn,
			el(
				"button",
				{
					type: "button",
					id: "retryTestBtn",
					className: "btn btn-ghost",
				},
				["Làm lại bài mới"],
			),
		]);

		ctaRow.querySelector("#retryTestBtn")?.addEventListener("click", () => {
			stopActiveAudio();
			stopMediaStream();
			stopSpeakingIntervals();
			stopPageTimer();
			revokeRecordedUrl();
			recordedBlob = null;
			recordedChunks = [];
			speakingSession = createInitialSpeakingSession(
				snapshot?.speaking?.tasks?.length ?? 0,
			);
			activeAnswerMs = 0;
			answerStartedAt = 0;
			hasRecordedAnyAnswer = false;
			isFinalizingRecording = false;
			speakingUploadError = "";
			speakingMediaError = "";
			consultSavedMessage = "";
			const preservedLead = { ...state.lead };
			state = createInitialState();
			state.lead = preservedLead;
			persist();
			render();
			window.scrollTo({ top: 0, behavior: "smooth" });
		});

		resultCard.appendChild(ctaRow);

		if (consultSavedMessage) {
			resultCard.appendChild(
				el(
					"div",
					{
						id: "registerConsultFeedback",
						className: "consult-feedback-box",
						role: "status",
					},
					[
						el("p", { textContent: consultSavedMessage }),
						el(
							"a",
							{
								id: "openHomepageConsultLink",
								href: consultHref,
								className: "link-inline-btn",
							},
							["Mở biểu mẫu tư vấn chi tiết trên trang chủ →"],
						),
					],
				),
			);
		}

		// CEFR Reference Explorer
		resultCard.appendChild(createCefrExplorer(snapshot?.bands));

		return resultCard;
	}

	function renderLoadError(message) {
		appRoot.replaceChildren(
			el("section", { className: "card error-card", role: "alert" }, [
				el("p", { className: "kicker-pill" }, ["Không thể tải đề kiểm tra"]),
				el("h1", { className: "section-title" }, [
					"Hệ thống tạm thời chưa tải được đề",
				]),
				el("p", { className: "muted-copy", textContent: message }),
				el("div", { className: "intro-actions" }, [
					el(
						"button",
						{
							type: "button",
							id: "reloadTestBtn",
							className: "btn btn-primary",
						},
						["Thử tải lại đề"],
					),
					el("a", { href: ZALO_URL, className: "btn btn-teal" }, [
						"Nhắn Zalo cô Mỹ",
					]),
				]),
			]),
		);
		document
			.getElementById("reloadTestBtn")
			?.addEventListener("click", () => void init());
	}

	function render() {
		if (!snapshot) return;
		stopPageTimer();

		let content = null;
		switch (state.step) {
			case "intro":
				content = renderIntroStep();
				content
					.querySelector("#startTestBtn")
					?.addEventListener("click", () => navigateToStep("info"));
				break;
			case "info":
				content = renderInfoStep();
				break;
			case "listening":
				content = renderListeningStep();
				ensurePageTimerRunning();
				break;
			case "vocab-grammar":
				content = renderVocabGrammarStep();
				ensurePageTimerRunning();
				break;
			case "reading":
				content = renderReadingStep();
				ensurePageTimerRunning();
				break;
			case "writing":
				content = renderWritingStep();
				ensurePageTimerRunning();
				break;
			case "speaking":
				content = renderSpeakingStep();
				break;
			case "result":
				content = renderResultStep();
				break;
			default:
				content = renderIntroStep();
				break;
		}

		appRoot.replaceChildren(content);
	}

	async function init() {
		try {
			const res = await fetch(`${apiBase}/public/placement-test`, {
				headers: { Accept: "application/json" },
			});
			if (!res.ok) {
				throw new Error(
					res.status === 404 || res.status === 503
						? "Bài kiểm tra hiện đang được cập nhật, vui lòng thử lại sau ít phút."
						: `Không thể tải đề kiểm tra (mã lỗi ${res.status}).`,
				);
			}
			const raw = await res.json();
			snapshot = normalizeSnapshot(raw);
			questionNumbers = buildQuestionNumberMap(snapshot);
			state = loadAttemptState(snapshot.version);
			const currentReadingCount = countReadingQuestions(snapshot);
			const restored = resolveRestoredAttemptStep(
				state.step,
				snapshot,
				state.answers,
				state.knownReadingCount,
			);
			state.knownReadingCount = currentReadingCount;
			if (restored.redirectedToReading) {
				state.step = restored.step;
				readingBackfillNotice = true;
				saveAttemptState(snapshot.version, state);
			}
			render();
		} catch (err) {
			renderLoadError(
				err instanceof Error
					? err.message
					: "Không thể kết nối máy chủ để tải đề kiểm tra.",
			);
		}
	}

	window.addEventListener("pagehide", () => {
		speakingStartToken += 1;
		isRequestingMic = false;
		stopActiveAudio();
		stopSpeakingIntervals();
		stopMediaStream();
		stopPageTimer();
	});

	void init();
}

createApp();
