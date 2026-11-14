import {
	buildPlacementSummary,
	flattenQuestions,
	gradeAttempt,
} from "./grading.js";
import {
	buildLeadPayload,
	LEAD_EMAIL_MAX,
	LEAD_NAME_MAX,
	LEAD_NOTE_MAX,
	leadErrorMessage,
	PLACEMENT_COURSE_GROUPS,
	PLACEMENT_STUDY_MODES,
	validateLeadForm,
} from "./lead-gate.js";

const STORAGE_KEY = "msmy_placement_attempt_v1";
const DRAFT_STORAGE_KEY = "msmy_lead_draft_v1";
const ZALO_URL = "https://zalo.me/0929060994";
function getLeadApiBase() {
	if (typeof document === "undefined") return "http://localhost:8000";
	const meta = document.querySelector('meta[name="lead-api"]');
	const raw = meta?.getAttribute("content")?.trim() || "http://localhost:8000";
	return raw.replace(/\/+$/, "");
}

function resolveAudioUrl(src) {
	const raw = String(src ?? "").trim();
	if (!raw) return "";
	if (/^https?:\/\//i.test(raw)) return raw;
	const base = getLeadApiBase();
	return `${base}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

function getPartCounts(test) {
	const part1 = test?.parts?.find((p) => p.id === "vocab-grammar");
	const part2 = test?.parts?.find((p) => p.id === "listening");
	const vgCount = Array.isArray(part1?.questions) ? part1.questions.length : 0;
	const clips = Array.isArray(part2?.clips) ? part2.clips : [];
	const clipCount = clips.length;
	const listeningCount = clips.reduce(
		(sum, c) => sum + (Array.isArray(c?.questions) ? c.questions.length : 0),
		0,
	);
	return {
		vgCount,
		listeningCount,
		clipCount,
		totalQuestions: vgCount + listeningCount,
	};
}
const VALID_STEPS = new Set(["intro", "info", "part1", "part2", "result"]);
const OPTION_LETTERS = ["A", "B", "C", "D"];

let pageLoadedAt = Date.now();
let leadRequestGeneration = 0;
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

const SVG_NS = "http://www.w3.org/2000/svg";
const ICON_SHAPES = {
	"message-circle": [["path", { d: "M7.9 20A9 9 0 1 0 4 16.1L2 22Z" }]],
	"clipboard-list": [
		["rect", { width: "8", height: "4", x: "8", y: "2", rx: "1", ry: "1" }],
		[
			"path",
			{
				d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
			},
		],
		["path", { d: "M12 11h4" }],
		["path", { d: "M12 16h4" }],
		["path", { d: "M8 11h.01" }],
		["path", { d: "M8 16h.01" }],
	],
	play: [["polygon", { points: "6 3 20 12 6 21 6 3" }]],
	"volume-2": [
		[
			"path",
			{
				d: "M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z",
			},
		],
		["path", { d: "M16 9a5 5 0 0 1 0 6" }],
		["path", { d: "M19.364 18.364a9 9 0 0 0 0-12.728" }],
	],
	lock: [
		["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2" }],
		["path", { d: "M7 11V7a5 5 0 0 1 10 0v4" }],
	],
	"check-circle-2": [
		["circle", { cx: "12", cy: "12", r: "10" }],
		["path", { d: "m9 12 2 2 4-4" }],
	],
	gift: [
		["rect", { x: "3", y: "8", width: "18", height: "4", rx: "1" }],
		["path", { d: "M12 8v13" }],
		["path", { d: "M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" }],
		[
			"path",
			{
				d: "M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5",
			},
		],
	],
	"graduation-cap": [
		[
			"path",
			{
				d: "M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z",
			},
		],
		["path", { d: "M22 10v6" }],
		["path", { d: "M6 12.5V16a6 3 0 0 0 12 0v-3.5" }],
	],
	"rotate-ccw": [
		["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }],
		["path", { d: "M3 3v5h5" }],
	],
	"bar-chart-3": [
		["path", { d: "M3 3v16a2 2 0 0 0 2 2h16" }],
		["path", { d: "M18 17V9" }],
		["path", { d: "M13 17V5" }],
		["path", { d: "M8 17v-3" }],
	],
};

function createIconSvg(name) {
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("class", "ml-icon");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "1.9");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	svg.setAttribute("aria-hidden", "true");
	for (const [tag, attrs] of ICON_SHAPES[name] ?? []) {
		const child = document.createElementNS(SVG_NS, tag);
		for (const [k, v] of Object.entries(attrs)) {
			child.setAttribute(k, v);
		}
		svg.appendChild(child);
	}
	return svg;
}

function setButtonLabel(btn, iconName, text) {
	btn.replaceChildren(createIconSvg(iconName), createEl("span", "", text));
}

function createTitleBanner({ kicker, title, description, mascotSrc }) {
	const row = createEl("div", "ml-title-row");
	const main = createEl("div", "ml-title-main");
	main.appendChild(createEl("span", "kicker-pill", kicker));
	main.appendChild(createEl("h1", "", title));
	if (description) {
		main.appendChild(createEl("p", "muted-copy", description));
	}
	row.appendChild(main);
	if (mascotSrc) {
		const img = document.createElement("img");
		img.src = mascotSrc;
		img.alt = "";
		img.setAttribute("aria-hidden", "true");
		img.className = "step-mascot";
		row.appendChild(img);
	}
	return row;
}

function parseSavedLead(rawLead) {
	if (!rawLead || typeof rawLead !== "object") return null;
	const candidate = {
		name: typeof rawLead.name === "string" ? rawLead.name : "",
		phone: typeof rawLead.phone === "string" ? rawLead.phone : "",
		email: typeof rawLead.email === "string" ? rawLead.email : "",
		birthDate: typeof rawLead.birthDate === "string" ? rawLead.birthDate : "",
		course: typeof rawLead.course === "string" ? rawLead.course : "",
		studyMode: typeof rawLead.studyMode === "string" ? rawLead.studyMode : "",
		note: typeof rawLead.note === "string" ? rawLead.note : "",
		registered: Boolean(rawLead.registered),
		syncedPlacement:
			typeof rawLead.syncedPlacement === "string"
				? rawLead.syncedPlacement
				: "",
	};
	if (candidate.registered) {
		const check = validateLeadForm(candidate);
		if (!check.ok) {
			candidate.registered = false;
			candidate.syncedPlacement = "";
		} else {
			Object.assign(candidate, check.normalized);
		}
	}
	const hasAnyValue =
		candidate.name ||
		candidate.phone ||
		candidate.email ||
		candidate.birthDate ||
		candidate.course ||
		candidate.studyMode ||
		candidate.note ||
		candidate.registered;
	return hasAnyValue ? candidate : null;
}

function syncHomepageLeadDraft(lead) {
	if (!lead || typeof lead !== "object") return;
	try {
		const existingRaw = localStorage.getItem(DRAFT_STORAGE_KEY);
		const existing =
			existingRaw && typeof JSON.parse(existingRaw) === "object"
				? JSON.parse(existingRaw)
				: {};
		const merged = {
			...existing,
			name: lead.name || existing?.name || "",
			phone: lead.phone || existing?.phone || "",
			email: lead.email || existing?.email || "",
			birthDate: lead.birthDate || existing?.birthDate || "",
			course: lead.course || existing?.course || "",
			studyMode: lead.studyMode || existing?.studyMode || "",
			note: lead.note || existing?.note || "",
		};
		localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(merged));
	} catch {
		// Ignore storage errors
	}
}

function clearHomepageLeadDraft() {
	try {
		localStorage.removeItem(DRAFT_STORAGE_KEY);
	} catch {
		// Ignore storage errors
	}
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
		lead: null,
	};

	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return fresh;
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return fresh;
		const savedLead = parseSavedLead(parsed.lead);
		if (savedLead || (parsed.step && parsed.step !== "intro")) {
			pageLoadedAt = Math.min(pageLoadedAt, Date.now() - 3500);
		}
		if (parsed.version !== test.version) {
			if (savedLead) {
				const preserved = {
					...fresh,
					lead: { ...savedLead, syncedPlacement: "" },
				};
				saveAttempt(preserved);
				return preserved;
			}
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

		let step = VALID_STEPS.has(parsed.step) ? parsed.step : "intro";
		const result =
			step === "result" || (parsed.result && typeof parsed.result === "object")
				? gradeAttempt(test, answers)
				: null;
		if (step === "result" && !result) {
			step = "intro";
		}
		if (
			(step === "part1" || step === "part2" || step === "result") &&
			!savedLead?.registered
		) {
			step = "info";
		}

		return {
			version: test.version,
			step,
			answers,
			plays,
			result,
			lead: savedLead,
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
				lead: state.lead ?? null,
			}),
		);
	} catch {
		// Storage blocked (e.g., strict private mode); attempt still works in memory
	}
}

function clearAttempt(test, options = {}) {
	const keepLead = Boolean(options?.keepLead);
	const currentLead =
		options?.currentLead && typeof options.currentLead === "object"
			? options.currentLead
			: null;
	leadRequestGeneration += 1;
	const nextLead =
		keepLead && currentLead ? { ...currentLead, syncedPlacement: "" } : null;
	const nextState = {
		version: test.version,
		step: keepLead ? "intro" : "info",
		answers: {},
		plays: {},
		result: null,
		lead: nextLead,
	};
	try {
		if (keepLead && nextLead) {
			saveAttempt(nextState);
		} else {
			localStorage.removeItem(STORAGE_KEY);
			clearHomepageLeadDraft();
		}
	} catch {
		// Ignore storage errors
	}
	return nextState;
}

function createLeadIdentityBar(test, state, rerender) {
	if (!state.lead?.registered) return null;
	const bar = createEl("div", "lead-identity-bar");
	const info = createEl(
		"span",
		"lead-identity-text",
		`Học viên: ${state.lead.name} (${state.lead.phone} • ${state.lead.email})`,
	);
	const changeBtn = createEl(
		"button",
		"btn-link-inline",
		"Không phải bạn? Đổi thông tin",
	);
	changeBtn.type = "button";
	changeBtn.id = "changeLeadInfoBtn";
	changeBtn.addEventListener("click", () => {
		const fresh = clearAttempt(test, { keepLead: false });
		state.step = fresh.step;
		state.answers = fresh.answers;
		state.plays = fresh.plays;
		state.result = fresh.result;
		state.lead = fresh.lead;
		rerender("info", { persist: false });
	});
	bar.append(info, changeBtn);
	return bar;
}

function renderMaintenance(root) {
	root.replaceChildren();
	const card = createEl("section", "error-card");
	card.id = "maintenanceCard";
	card.appendChild(createEl("span", "kicker-pill", "Thông báo hệ thống"));
	card.appendChild(createEl("h1", "", "Bài kiểm tra đang bảo trì"));
	card.appendChild(
		createEl(
			"p",
			"muted-copy",
			"Bộ đề kiểm tra đầu vào hiện đang được cô Thục Mỹ cập nhật. Bạn vui lòng quay lại sau ít phút hoặc quay về trang chủ để đăng ký tư vấn lộ trình 1-1.",
		),
	);

	const actions = createEl("div", "btn-row");
	const homeLink = createEl("a", "btn btn-primary", "← Quay Về Trang Chủ");
	homeLink.href = "../";

	const retryBtn = createEl("button", "btn btn-outline", "Thử Tải Lại Trang");
	retryBtn.type = "button";
	retryBtn.addEventListener("click", () => window.location.reload());

	const zaloLink = createEl("a", "btn btn-gold");
	setButtonLabel(zaloLink, "message-circle", "Nhắn Zalo Cô Mỹ: 0929.060.994");
	zaloLink.href = ZALO_URL;
	zaloLink.target = "_blank";
	zaloLink.rel = "noopener";

	actions.append(homeLink, retryBtn, zaloLink);
	card.appendChild(actions);
	root.appendChild(card);
}

function createStepperBar(test, state) {
	const bar = createEl("div", "stepper-bar");
	const pills = createEl("div", "stepper-pills");

	const { vgCount, listeningCount } = getPartCounts(test);
	const steps = [
		{ id: "intro", label: "1. Giới thiệu" },
		{ id: "info", label: "2. Thông tin của bạn" },
		{ id: "part1", label: `3. Phần 1: Vocab + Grammar (${vgCount} câu)` },
		{ id: "part2", label: `4. Phần 2: Listening (${listeningCount} câu)` },
		{ id: "result", label: "5. Kết quả & Lộ trình" },
	];

	const order = ["intro", "info", "part1", "part2", "result"];
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

	const rerender = (nextStep, { persist = true } = {}) => {
		cleanupActiveAudio();
		if (nextStep) {
			state.step = nextStep;
			if (persist) saveAttempt(state);
		}
		root.replaceChildren();
		root.appendChild(createStepperBar(test, state));

		if (state.step === "intro") {
			renderIntroStep(root, test, state, rerender);
		} else if (state.step === "info") {
			renderInfoStep(root, test, state, rerender);
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
	const { vgCount, listeningCount, clipCount, totalQuestions } =
		getPartCounts(test);
	const card = createEl("section", "intro-card");
	card.appendChild(
		createTitleBanner({
			kicker: "Bài Kiểm Tra Đầu Vào Chẩn Đoán Trình Độ (Miễn Phí 100%)",
			title: `Đánh Giá Năng Lực Tiếng Anh Đầu Vào (${totalQuestions} Câu • Vocab, Grammar & Listening)`,
			description:
				"Bài kiểm tra giúp xác định mức CEFR hiện tại của bạn (A1 – B2+) và gợi ý lộ trình học phù hợp nhất cùng cô Đỗ Thục Mỹ. Bạn chỉ cần để lại họ tên, email và số điện thoại trước khi bắt đầu để nhận kết quả CEFR và lộ trình học cá nhân hóa.",
			mascotSrc: "../assets/mascots/mascot-checklist.png",
		}),
	);

	const identityBar = createLeadIdentityBar(test, state, rerender);
	if (identityBar) {
		card.appendChild(identityBar);
	}

	const hasSavedProgress =
		Object.keys(state.answers).length > 0 ||
		Object.values(state.plays).some((n) => Number(n) > 0);

	if (hasSavedProgress) {
		const banner = createEl("div", "resume-banner");
		banner.appendChild(
			createEl(
				"span",
				"resume-banner-text",
				`Bạn đang có bài làm dở (${Object.keys(state.answers).length}/${totalQuestions} câu đã chọn). Bạn có thể tiếp tục hoặc xóa để làm lại từ đầu.`,
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
		resumeBtn.addEventListener("click", () =>
			rerender(state.lead?.registered ? "part1" : "info"),
		);

		const resetBtn = createEl(
			"button",
			"btn btn-outline btn-sm",
			"Làm Lại Từ Đầu",
		);
		resetBtn.type = "button";
		resetBtn.id = "resetAttemptBtn";
		resetBtn.addEventListener("click", () => {
			const fresh = clearAttempt(test, {
				keepLead: true,
				currentLead: state.lead,
			});
			state.step = fresh.step;
			state.answers = fresh.answers;
			state.plays = fresh.plays;
			state.result = fresh.result;
			state.lead = fresh.lead;
			rerender("intro");
		});
		bannerActions.append(resumeBtn, resetBtn);
		banner.appendChild(bannerActions);
		card.appendChild(banner);
	}

	const grid = createEl("div", "intro-grid");
	const features = [
		{
			title: `Phần 1: Vocab + Grammar (${vgCount} câu)`,
			desc: "Các câu hỏi ngữ pháp bản chất và từ vựng học thuật trải đều từ mức A1 đến C1.",
		},
		{
			title: `Phần 2: Listening (${clipCount} đoạn • ${listeningCount} câu)`,
			desc: `${clipCount} đoạn nghe độc thoại và hội thoại thực tế (A2 – C1) kèm câu hỏi trắc nghiệm.`,
		},
		{
			title: "Quy định làm bài & Lưu tự động",
			desc: "Không giới hạn thời gian. Mỗi đoạn âm thanh có số lượt nghe quy định riêng. Câu trả lời tự động lưu khi tải lại trang.",
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
	const startBtn = createEl("button", "btn btn-primary");
	setButtonLabel(startBtn, "clipboard-list", "Bắt Đầu Làm Bài Kiểm Tra");
	startBtn.type = "button";
	startBtn.id = "startTestBtn";
	startBtn.addEventListener("click", () =>
		rerender(state.lead?.registered ? "part1" : "info"),
	);

	const homeLink = createEl("a", "btn btn-outline", "← Quay Lại Trang Chủ");
	homeLink.href = "../";

	actions.append(startBtn, homeLink);
	card.appendChild(actions);
	root.appendChild(card);
}

function renderInfoStep(root, _test, state, rerender) {
	const card = createEl("section", "step-card");
	card.id = "leadGateCard";
	card.appendChild(
		createTitleBanner({
			kicker: "Bước 2 / 5 • Thông Tin Học Viên",
			title: "Thông Tin Của Bạn Trước Khi Làm Bài",
			description:
				"Vui lòng điền họ tên, email và số điện thoại Zalo để hệ thống lưu tiến độ bài làm, chấm điểm CEFR và gợi ý lộ trình học phù hợp nhất cùng cô Thục Mỹ.",
			mascotSrc: "../assets/mascots/mascot-give-opinion.png",
		}),
	);

	const form = createEl("form", "lead-gate-form");
	form.id = "leadGateForm";
	form.noValidate = true;

	const honeypotWrap = createEl("div", "honeypot-field");
	honeypotWrap.setAttribute("aria-hidden", "true");
	const honeypotLabel = createEl("label", "", "Website");
	honeypotLabel.htmlFor = "leadWebsite";
	const websiteInput = createEl("input", "");
	websiteInput.type = "text";
	websiteInput.id = "leadWebsite";
	websiteInput.name = "website";
	websiteInput.tabIndex = -1;
	websiteInput.autocomplete = "off";
	honeypotWrap.append(honeypotLabel, websiteInput);
	form.appendChild(honeypotWrap);

	const saved = state.lead ?? {};
	const requiredGrid = createEl("div", "info-form-grid");

	const makeRequiredLabel = (forId, labelText) => {
		const lbl = createEl("label", "", `${labelText} `);
		lbl.htmlFor = forId;
		const star = createEl("span", "required-star", "*");
		star.setAttribute("aria-hidden", "true");
		lbl.appendChild(star);
		return lbl;
	};

	// 1. Họ và tên
	const fieldName = createEl("div", "field");
	fieldName.id = "fieldLeadName";
	const nameInput = createEl("input", "input-control");
	nameInput.type = "text";
	nameInput.id = "leadName";
	nameInput.name = "name";
	nameInput.required = true;
	nameInput.setAttribute("aria-required", "true");
	nameInput.maxLength = LEAD_NAME_MAX;
	nameInput.autocomplete = "name";
	nameInput.placeholder = "Ví dụ: Nguyễn Minh Anh";
	nameInput.value = saved.name ?? "";
	nameInput.setAttribute("aria-describedby", "helpLeadName errLeadName");
	const helpName = createEl(
		"span",
		"field-help",
		"Tên để cô Mỹ xưng hô và lưu kết quả bài kiểm tra.",
	);
	helpName.id = "helpLeadName";
	const errName = createEl("span", "field-error", "");
	errName.id = "errLeadName";
	fieldName.append(
		makeRequiredLabel("leadName", "Họ và tên học viên"),
		nameInput,
		helpName,
		errName,
	);

	// 2. Email
	const fieldEmail = createEl("div", "field");
	fieldEmail.id = "fieldLeadEmail";
	const emailInput = createEl("input", "input-control");
	emailInput.type = "email";
	emailInput.id = "leadEmail";
	emailInput.name = "email";
	emailInput.required = true;
	emailInput.setAttribute("aria-required", "true");
	emailInput.maxLength = LEAD_EMAIL_MAX;
	emailInput.inputMode = "email";
	emailInput.autocomplete = "email";
	emailInput.placeholder = "Ví dụ: minhanh@gmail.com";
	emailInput.value = saved.email ?? "";
	emailInput.setAttribute("aria-describedby", "helpLeadEmail errLeadEmail");
	const helpEmail = createEl(
		"span",
		"field-help",
		"Email để nhận báo cáo CEFR và bộ tài liệu tự học.",
	);
	helpEmail.id = "helpLeadEmail";
	const errEmail = createEl("span", "field-error", "");
	errEmail.id = "errLeadEmail";
	fieldEmail.append(
		makeRequiredLabel("leadEmail", "Email nhận kết quả & tài liệu"),
		emailInput,
		helpEmail,
		errEmail,
	);

	// 3. Số điện thoại Zalo
	const fieldPhone = createEl("div", "field");
	fieldPhone.id = "fieldLeadPhone";
	const phoneInput = createEl("input", "input-control");
	phoneInput.type = "tel";
	phoneInput.id = "leadPhone";
	phoneInput.name = "phone";
	phoneInput.required = true;
	phoneInput.setAttribute("aria-required", "true");
	phoneInput.inputMode = "tel";
	phoneInput.autocomplete = "tel";
	phoneInput.placeholder = "Ví dụ: 0909 123 456";
	phoneInput.value = saved.phone ?? "";
	phoneInput.setAttribute("aria-describedby", "helpLeadPhone errLeadPhone");
	const helpPhone = createEl(
		"span",
		"field-help",
		"Số Zalo 10 chữ số (bắt đầu bằng 0 hoặc +84) để cô Mỹ hỗ trợ lộ trình 1-1.",
	);
	helpPhone.id = "helpLeadPhone";
	const errPhone = createEl("span", "field-error", "");
	errPhone.id = "errLeadPhone";
	fieldPhone.append(
		makeRequiredLabel("leadPhone", "Số điện thoại Zalo"),
		phoneInput,
		helpPhone,
		errPhone,
	);

	requiredGrid.append(fieldName, fieldEmail, fieldPhone);
	form.appendChild(requiredGrid);

	// Khối Thông tin thêm (không bắt buộc)
	const detailsEl = createEl("details", "optional-details");
	detailsEl.id = "leadOptionalDetails";
	if (saved.birthDate || saved.course || saved.studyMode || saved.note) {
		detailsEl.open = true;
	}
	const summaryEl = createEl(
		"summary",
		"",
		"Thông tin thêm (không bắt buộc: ngày sinh, khóa học, hình thức lớp, ghi chú)",
	);
	detailsEl.appendChild(summaryEl);

	const optionalGrid = createEl("div", "info-form-grid optional-grid");

	// 4. Ngày sinh
	const fieldBirthDate = createEl("div", "field");
	fieldBirthDate.id = "fieldLeadBirthDate";
	const birthLabel = createEl("label", "", "Ngày sinh (không bắt buộc)");
	birthLabel.htmlFor = "leadBirthDate";
	const birthInput = createEl("input", "input-control");
	birthInput.type = "date";
	birthInput.id = "leadBirthDate";
	birthInput.name = "birthDate";
	birthInput.min = "1940-01-01";
	birthInput.value = saved.birthDate ?? "";
	birthInput.setAttribute("aria-describedby", "errLeadBirthDate");
	const errBirthDate = createEl("span", "field-error", "");
	errBirthDate.id = "errLeadBirthDate";
	fieldBirthDate.append(birthLabel, birthInput, errBirthDate);

	// 5. Khóa học quan tâm
	const fieldCourse = createEl("div", "field");
	fieldCourse.id = "fieldLeadCourse";
	const courseLabel = createEl(
		"label",
		"",
		"Khóa học bạn quan tâm (không bắt buộc)",
	);
	courseLabel.htmlFor = "leadCourse";
	const courseSelect = createEl("select", "input-control");
	courseSelect.id = "leadCourse";
	courseSelect.name = "course";
	courseSelect.setAttribute("aria-describedby", "errLeadCourse");
	const defaultCourseOpt = createEl("option", "", "Chọn khóa (không bắt buộc)");
	defaultCourseOpt.value = "";
	courseSelect.appendChild(defaultCourseOpt);
	for (const group of PLACEMENT_COURSE_GROUPS) {
		if (group.key === "other") {
			for (const opt of group.options) {
				const optEl = createEl("option", "", opt.label);
				optEl.value = opt.value;
				courseSelect.appendChild(optEl);
			}
		} else {
			const optgroup = createEl("optgroup", "");
			optgroup.label = group.label;
			for (const opt of group.options) {
				const optEl = createEl("option", "", opt.label);
				optEl.value = opt.value;
				optgroup.appendChild(optEl);
			}
			courseSelect.appendChild(optgroup);
		}
	}
	courseSelect.value = saved.course ?? "";
	const errCourse = createEl("span", "field-error", "");
	errCourse.id = "errLeadCourse";
	fieldCourse.append(courseLabel, courseSelect, errCourse);

	// 6. Hình thức lớp
	const fieldStudyMode = createEl("div", "field");
	fieldStudyMode.id = "fieldLeadStudyMode";
	const modeLabel = createEl(
		"label",
		"",
		"Hình thức & Quy mô lớp (không bắt buộc)",
	);
	modeLabel.htmlFor = "leadStudyMode";
	const modeSelect = createEl("select", "input-control");
	modeSelect.id = "leadStudyMode";
	modeSelect.name = "studyMode";
	modeSelect.setAttribute("aria-describedby", "errLeadStudyMode");
	const defaultModeOpt = createEl(
		"option",
		"",
		"Chọn hình thức (không bắt buộc)",
	);
	defaultModeOpt.value = "";
	modeSelect.appendChild(defaultModeOpt);
	for (const mode of PLACEMENT_STUDY_MODES) {
		const optEl = createEl("option", "", mode.label);
		optEl.value = mode.value;
		modeSelect.appendChild(optEl);
	}
	modeSelect.value = saved.studyMode ?? "";
	const errStudyMode = createEl("span", "field-error", "");
	errStudyMode.id = "errLeadStudyMode";
	fieldStudyMode.append(modeLabel, modeSelect, errStudyMode);

	// 7. Ghi chú
	const fieldNote = createEl("div", "field full-span");
	fieldNote.id = "fieldLeadNote";
	const noteLabel = createEl(
		"label",
		"",
		"Mục tiêu đầu ra & Ghi chú (không bắt buộc)",
	);
	noteLabel.htmlFor = "leadNote";
	const noteInput = createEl("textarea", "input-control");
	noteInput.id = "leadNote";
	noteInput.name = "note";
	noteInput.rows = 3;
	noteInput.maxLength = LEAD_NOTE_MAX;
	noteInput.placeholder = "Ví dụ: Cần IELTS 6.5 trong 6 tháng / Phỏng vấn IT";
	noteInput.value = saved.note ?? "";
	noteInput.setAttribute("aria-describedby", "errLeadNote");
	const errNote = createEl("span", "field-error", "");
	errNote.id = "errLeadNote";
	fieldNote.append(noteLabel, noteInput, errNote);

	optionalGrid.append(fieldBirthDate, fieldCourse, fieldStudyMode, fieldNote);
	detailsEl.appendChild(optionalGrid);
	form.appendChild(detailsEl);

	// Hộp báo lỗi mạng / 429 / 5xx
	const errorAlert = createEl("div", "gate-error-alert");
	errorAlert.id = "leadGateErrorBox";
	errorAlert.setAttribute("role", "alert");
	errorAlert.hidden = true;
	const errorAlertText = createEl("p", "gate-error-text", "");
	errorAlertText.id = "leadGateErrorText";
	const errorAlertActions = createEl("div", "header-actions");
	const retrySubmitBtn = createEl(
		"button",
		"btn btn-primary btn-sm",
		"Thử Gửi Lại",
	);
	retrySubmitBtn.type = "button";
	retrySubmitBtn.id = "retryLeadSubmitBtn";
	retrySubmitBtn.addEventListener("click", () => {
		form.requestSubmit();
	});
	const zaloAlertLink = createEl("a", "btn btn-gold btn-sm");
	setButtonLabel(
		zaloAlertLink,
		"message-circle",
		"Nhắn Zalo Cô Mỹ: 0929.060.994",
	);
	zaloAlertLink.id = "leadGateZaloLink";
	zaloAlertLink.href = ZALO_URL;
	zaloAlertLink.target = "_blank";
	zaloAlertLink.rel = "noopener";
	errorAlertActions.append(retrySubmitBtn, zaloAlertLink);
	errorAlert.append(errorAlertText, errorAlertActions);
	form.appendChild(errorAlert);

	const actions = createEl("div", "btn-row");
	const backBtn = createEl(
		"button",
		"btn btn-outline",
		"← Quay Lại Giới Thiệu",
	);
	backBtn.type = "button";
	backBtn.id = "backToIntroBtn";
	backBtn.addEventListener("click", () => rerender("intro"));

	const submitBtn = createEl(
		"button",
		"btn btn-primary",
		"Tiếp Tục Vào Phần 1 →",
	);
	submitBtn.type = "submit";
	submitBtn.id = "submitLeadGateBtn";
	actions.append(backBtn, submitBtn);
	form.appendChild(actions);

	const fieldRegistry = [
		{
			key: "name",
			wrapper: fieldName,
			input: nameInput,
			errEl: errName,
			inDetails: false,
			defaultErr:
				"Vui lòng nhập họ và tên của bạn (tối thiểu 2 ký tự, tối đa 80 ký tự).",
		},
		{
			key: "email",
			wrapper: fieldEmail,
			input: emailInput,
			errEl: errEmail,
			inDetails: false,
			defaultErr: "Vui lòng nhập địa chỉ email hợp lệ.",
		},
		{
			key: "phone",
			wrapper: fieldPhone,
			input: phoneInput,
			errEl: errPhone,
			inDetails: false,
			defaultErr:
				"Vui lòng nhập số điện thoại Việt Nam hợp lệ (10 chữ số, bắt đầu bằng 0 hoặc +84).",
		},
		{
			key: "birthDate",
			wrapper: fieldBirthDate,
			input: birthInput,
			errEl: errBirthDate,
			inDetails: true,
			defaultErr: "Ngày sinh không hợp lệ (năm từ 1940 đến năm hiện tại).",
		},
		{
			key: "course",
			wrapper: fieldCourse,
			input: courseSelect,
			errEl: errCourse,
			inDetails: true,
			defaultErr: "Khóa học đã chọn không hợp lệ.",
		},
		{
			key: "studyMode",
			wrapper: fieldStudyMode,
			input: modeSelect,
			errEl: errStudyMode,
			inDetails: true,
			defaultErr: "Hình thức lớp đã chọn không hợp lệ.",
		},
		{
			key: "note",
			wrapper: fieldNote,
			input: noteInput,
			errEl: errNote,
			inDetails: true,
			defaultErr: "Ghi chú không được vượt quá 500 ký tự.",
		},
	];

	const getFormValues = () => ({
		name: nameInput.value,
		email: emailInput.value,
		phone: phoneInput.value,
		birthDate: birthInput.value,
		course: courseSelect.value,
		studyMode: modeSelect.value,
		note: noteInput.value,
	});

	const setFieldError = (entry, message) => {
		const hasErr = Boolean(message);
		entry.wrapper.classList.toggle("has-error", hasErr);
		if (hasErr) {
			entry.input.setAttribute("aria-invalid", "true");
			entry.errEl.textContent = message;
		} else {
			entry.input.removeAttribute("aria-invalid");
			entry.errEl.textContent = "";
		}
	};

	const persistDraftLead = () => {
		const vals = getFormValues();
		state.lead = {
			name: vals.name.trim(),
			email: vals.email.trim(),
			phone: vals.phone.trim(),
			birthDate: vals.birthDate.trim(),
			course: vals.course.trim(),
			studyMode: vals.studyMode.trim(),
			note: vals.note.trim(),
			registered: Boolean(state.lead?.registered),
			syncedPlacement: state.lead?.syncedPlacement ?? "",
		};
		saveAttempt(state);
	};

	for (const entry of fieldRegistry) {
		entry.input.addEventListener("blur", () => {
			const check = validateLeadForm(getFormValues());
			setFieldError(entry, check.errors[entry.key] ?? "");
		});
		entry.input.addEventListener("input", () => {
			if (entry.wrapper.classList.contains("has-error")) {
				const check = validateLeadForm(getFormValues());
				if (!check.errors[entry.key]) {
					setFieldError(entry, "");
				}
			}
			persistDraftLead();
		});
		entry.input.addEventListener("change", persistDraftLead);
	}

	form.addEventListener("submit", async (e) => {
		e.preventDefault();
		errorAlert.hidden = true;
		errorAlertText.textContent = "";

		const check = validateLeadForm(getFormValues());
		let firstFailed = null;
		for (const entry of fieldRegistry) {
			const msg = check.errors[entry.key] ?? "";
			setFieldError(entry, msg);
			if (msg && !firstFailed) {
				firstFailed = entry;
			}
		}

		if (!check.ok && firstFailed) {
			if (firstFailed.inDetails) {
				detailsEl.open = true;
			}
			firstFailed.input.focus();
			return;
		}

		const payload = buildLeadPayload({
			lead: check.normalized,
			elapsedMs: Date.now() - pageLoadedAt,
			website: websiteInput.value,
		});

		submitBtn.disabled = true;
		submitBtn.setAttribute("aria-busy", "true");
		const reqGen = ++leadRequestGeneration;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10_000);

		try {
			const apiBase = getLeadApiBase();
			const res = await fetch(`${apiBase}/public/leads`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
				signal: controller.signal,
			});
			if (reqGen !== leadRequestGeneration) return;

			if (res.status === 200 || res.status === 201) {
				state.lead = {
					...check.normalized,
					registered: true,
					syncedPlacement: "",
				};
				saveAttempt(state);
				syncHomepageLeadDraft(state.lead);
				rerender("part1");
				return;
			}

			let body = null;
			try {
				body = await res.json();
			} catch {
				body = null;
			}
			const errInfo = leadErrorMessage(res.status, body);

			if (errInfo.kind === "field") {
				let firstServerField = null;
				for (const entry of fieldRegistry) {
					if (errInfo.fields.includes(entry.key)) {
						setFieldError(entry, entry.defaultErr);
						if (!firstServerField) firstServerField = entry;
					}
				}
				if (firstServerField) {
					if (firstServerField.inDetails) {
						detailsEl.open = true;
					}
					firstServerField.input.focus();
					return;
				}
			}

			errorAlertText.textContent = errInfo.message;
			errorAlert.hidden = false;
		} catch {
			if (reqGen !== leadRequestGeneration) return;
			const errInfo = leadErrorMessage(0, null);
			errorAlertText.textContent = errInfo.message;
			errorAlert.hidden = false;
		} finally {
			clearTimeout(timeoutId);
			submitBtn.disabled = false;
			submitBtn.removeAttribute("aria-busy");
		}
	});

	card.appendChild(form);
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
	const { vgCount, listeningCount } = getPartCounts(test);
	const card = createEl("section", "step-card");
	card.dataset.part = "vocabulary";
	card.appendChild(
		createTitleBanner({
			kicker: "Phần 1 / 2",
			title: "Phần 1: Ngữ Pháp & Từ Vựng (Vocab + Grammar)",
			description: `Chọn đáp án đúng nhất cho ${vgCount} câu bên dưới. Bạn có thể chuyển sang Phần 2 bất cứ lúc nào và quay lại chỉnh sửa trước khi nộp bài.`,
			mascotSrc: "../assets/mascots/mascot-chunks.png",
		}),
	);
	const identityBar = createLeadIdentityBar(test, state, rerender);
	if (identityBar) {
		card.appendChild(identityBar);
	}

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
		`Tiếp Tục Sang Phần 2: Listening (${listeningCount} câu) →`,
	);
	nextBtn.type = "button";
	nextBtn.id = "toPart2Btn";
	nextBtn.addEventListener("click", () => rerender("part2"));

	actions.append(backBtn, nextBtn);
	card.appendChild(actions);
	root.appendChild(card);
}

function renderPart2Step(root, test, state, rerender, activeClipsCleanup) {
	const part1 = test.parts.find((p) => p.id === "vocab-grammar");
	const part2 = test.parts.find((p) => p.id === "listening");
	const clips = part2?.clips ?? [];
	const card = createEl("section", "step-card");
	card.dataset.part = "listening";
	card.appendChild(
		createTitleBanner({
			kicker: "Phần 2 / 2",
			title: `Phần 2: Nghe Hiểu (Listening – ${clips.length} Đoạn Audio)`,
			description:
				"Mỗi đoạn âm thanh có giới hạn số lần phát và không thể tua. Hãy đọc trước các câu hỏi của từng đoạn rồi bấm nút Phát đoạn nghe.",
			mascotSrc: "../assets/mascots/mascot-listening.png",
		}),
	);
	const identityBar = createLeadIdentityBar(test, state, rerender);
	if (identityBar) {
		card.appendChild(identityBar);
	}

	let questionNumber = (part1?.questions?.length ?? 0) + 1;
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
		audio.src = resolveAudioUrl(clip.src);
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
				setButtonLabel(
					playBtn,
					remaining > 0 ? "play" : "lock",
					remaining > 0 ? "Phát đoạn nghe" : "Đã hết lượt nghe",
				);
				statusEl.textContent = errorMessage;
				statusEl.classList.add("is-error");
				return;
			}

			if (activeSession) {
				playBtn.disabled = true;
				setButtonLabel(playBtn, "volume-2", "Đang phát đoạn nghe...");
				statusEl.textContent = `Đang phát (còn ${remaining}/${maxPlays} lượt nghe sau lượt này)`;
				return;
			}

			if (remaining <= 0) {
				playBtn.disabled = true;
				setButtonLabel(playBtn, "lock", "Đã hết lượt nghe");
				statusEl.textContent = `Đã hết lượt nghe (0/${maxPlays} lượt còn lại)`;
				statusEl.classList.add("is-exhausted");
				return;
			}

			playBtn.disabled = false;
			setButtonLabel(
				playBtn,
				"play",
				used === 0 ? "Phát đoạn nghe" : "Phát lại đoạn nghe",
			);
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

	const submitBtn = createEl("button", "btn btn-gold");
	setButtonLabel(submitBtn, "check-circle-2", "Nộp Bài & Xem Kết Quả Xếp Lớp");
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
	if (state.lead?.registered) {
		syncHomepageLeadDraft(state.lead);
	}
	const summaryText = buildPlacementSummary(result);
	const courseCode = result.band.course;
	const courseLabel = result.band.courseLabel || courseCode;

	if (state.lead?.registered && state.lead.syncedPlacement !== summaryText) {
		const reqGen = ++leadRequestGeneration;
		const leadSnapshot = { ...state.lead };
		const payload = buildLeadPayload({
			lead: leadSnapshot,
			placement: summaryText,
			elapsedMs: Math.max(3500, Date.now() - pageLoadedAt),
		});
		const apiBase = getLeadApiBase();
		fetch(`${apiBase}/public/leads`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
			keepalive: true,
		})
			.then(async (res) => {
				if (res.status !== 200 && res.status !== 201) return;
				let body = null;
				try {
					body = await res.json();
				} catch {
					body = null;
				}
				if (
					typeof body?.submitCount === "number" &&
					reqGen === leadRequestGeneration &&
					state.lead &&
					state.lead.phone === leadSnapshot.phone
				) {
					state.lead.syncedPlacement = summaryText;
					saveAttempt(state);
				}
			})
			.catch(() => {
				// Best-effort sync; retry on next renderResultStep if failed
			});
	}

	const card = createEl("section", "result-card");
	card.id = "testResultCard";
	card.appendChild(
		createTitleBanner({
			kicker: "Hoàn Thành Bài Kiểm Tra Đầu Vào",
			title: "Kết Quả Đánh Giá Trình Độ & Lộ Trình Gợi Ý",
			description: summaryText,
			mascotSrc: "../assets/mascots/mascot-checklist.png",
		}),
	);
	const identityBar = createLeadIdentityBar(test, state, rerender);
	if (identityBar) {
		card.appendChild(identityBar);
	}
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
	const recNote = createEl("p", "recommendation-note");
	recNote.append(
		createIconSvg("gift"),
		createEl(
			"span",
			"",
			"Quyền lợi kèm theo: Bạn được tặng thêm 01 buổi Khám Bệnh Tiếng Anh 1-1 (30 phút qua Google Meet) trực tiếp cùng cô Thục Mỹ để kiểm tra kỹ năng Nói (Speaking) và chốt lộ trình cá nhân hóa.",
		),
	);
	recBox.appendChild(recNote);
	card.appendChild(recBox);

	const cefrExplorer = createCefrExplorer(result.band.cefr);
	card.appendChild(cefrExplorer);

	const actions = createEl("div", "btn-row");
	const registerParams = new URLSearchParams({
		ketqua: summaryText,
		khoa: courseCode,
	});
	const registerLink = createEl("a", "btn btn-gold");
	setButtonLabel(registerLink, "graduation-cap", "Đăng Ký Theo Kết Quả Này");
	registerLink.id = "registerWithResultBtn";
	registerLink.href = `../?${registerParams.toString()}#dang-ky-tu-van`;

	const zaloLink = createEl("a", "btn btn-primary");
	setButtonLabel(
		zaloLink,
		"message-circle",
		"Nhắn Kết Quả Qua Zalo Cô Mỹ: 0929.060.994",
	);
	zaloLink.href = ZALO_URL;
	zaloLink.target = "_blank";
	zaloLink.rel = "noopener";

	const retryBtn = createEl("button", "btn btn-outline");
	setButtonLabel(retryBtn, "rotate-ccw", "Làm Lại");
	retryBtn.type = "button";
	retryBtn.id = "retryTestBtn";
	retryBtn.addEventListener("click", () => {
		const fresh = clearAttempt(test, {
			keepLead: true,
			currentLead: state.lead,
		});
		state.step = fresh.step;
		state.answers = fresh.answers;
		state.plays = fresh.plays;
		state.result = fresh.result;
		state.lead = fresh.lead;
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
		const apiBase = getLeadApiBase();
		const res = await fetch(`${apiBase}/public/placement-test`, {
			cache: "no-cache",
		});
		if (!res.ok) {
			throw new Error(`HTTP ${res.status}`);
		}
		const test = await res.json();
		if (
			!test ||
			!Array.isArray(test.parts) ||
			!Array.isArray(test.bands) ||
			flattenQuestions(test).length === 0
		) {
			throw new Error("Invalid schema");
		}
		const state = loadSavedAttempt(test);
		renderApp(root, test, state);
	} catch {
		renderMaintenance(root);
	}
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
	init();
}

const CEFR_EXPLORER_DATA = {
	a1: {
		code: "A1 – A2",
		name: "Giai đoạn Xây nền Bản chất (Foundation)",
		band: "0.0 → 4.0+",
		bandSub: "Chuẩn hóa gốc ngữ pháp & phát âm",
		hours: "150 – 250 Giờ",
		vocab: "Tích lũy 1.500 – 2.500 từ vựng cốt lõi",
		outcome:
			"Nắm vững 8 Từ loại chức năng, chuẩn hóa 44 âm IPA & âm lướt Schwa /ə/, tự viết chuẩn xác câu đơn và câu ghép.",
	},
	b1: {
		code: "CEFR B1",
		name: "Giai đoạn Bước đệm Học thuật (Pre-IELTS)",
		band: "4.5 → 5.0+",
		bandSub: "Phát triển phản xạ & đọc hiểu câu dài",
		hours: "350 – 400 Giờ",
		vocab: "Tích lũy 3.000 – 3.500 từ & Collocations",
		outcome:
			"Làm chủ kỹ thuật đọc bắt Danh từ chính (Head-Noun), nghe bắt từ khóa MHKL 30p/ngày và phản xạ Speaking 3 nhịp A.R.E tự nhiên.",
	},
	b2: {
		code: "CEFR B2",
		name: "Giai đoạn Tăng tốc Thực chiến (IELTS Intensive)",
		band: "5.5 → 6.5",
		bandSub: "Làm chủ 4 kỹ năng học thuật chuẩn Giám khảo",
		hours: "500 – 600 Giờ",
		vocab: "Tích lũy 4.500+ Collocations học thuật",
		outcome:
			"Thành thạo Process Writing 5 bước (Task 1 & 2), xử lý trọn bộ đề Forecast Speaking theo Quý và nâng cấp cấu trúc câu học thuật.",
	},
	c1: {
		code: "CEFR C1",
		name: "Giai đoạn Bứt phá Toàn diện (Advanced Mastery)",
		band: "7.0 → 8.0+",
		bandSub: "Tư duy phản biện & bản ngữ hóa ngôn ngữ",
		hours: "750 – 900+ Giờ",
		vocab: "Tích lũy 7.000+ từ vựng & Idiomatic expressions",
		outcome:
			"Làm chủ Stylistic Writing, kiểm soát ngữ điệu và phát âm tự nhiên (Connected Speech), phản xạ tranh luận sắc bén.",
	},
};

function createCefrExplorer(currentCefr) {
	const box = createEl("div", "cefr-interactive-box");
	box.id = "cefrExplorerBox";
	const cefrHeading = createEl("h3", "");
	cefrHeading.append(
		createIconSvg("bar-chart-3"),
		createEl(
			"span",
			"",
			"Bảng Định Lượng Giờ Học & Quy Đổi Trình Độ CEFR (0 → 7.5+ IELTS)",
		),
	);
	box.appendChild(cefrHeading);
	box.appendChild(
		createEl(
			"p",
			"muted-copy",
			"Chọn từng cấp độ để xem mục tiêu band, thời lượng giờ học ước tính và năng lực đầu ra tương ứng.",
		),
	);

	let activeKey = "a1";
	if (currentCefr) {
		const norm = currentCefr.toLowerCase();
		if (norm.includes("b1")) activeKey = "b1";
		else if (norm.includes("b2")) activeKey = "b2";
		else if (norm.includes("c1") || norm.includes("c2")) activeKey = "c1";
		else if (norm.includes("a1") || norm.includes("a2")) activeKey = "a1";
	}

	const selectorRow = createEl("div", "cefr-selector-row");
	selectorRow.setAttribute("role", "tablist");
	selectorRow.setAttribute("aria-label", "Chọn cấp độ CEFR");

	const detailPanel = createEl("div", "cefr-detail-panel");
	detailPanel.id = "cefrDetailPanel";
	detailPanel.setAttribute("aria-live", "polite");

	const cell1 = createEl("div", "cefr-stat-cell");
	cell1.appendChild(createEl("span", "cefr-stat-label", "Khung Tham Chiếu"));
	const valCode = createEl("span", "cefr-stat-value", "");
	valCode.id = "cefrCode";
	const subName = createEl("span", "cefr-stat-sub", "");
	subName.id = "cefrName";
	cell1.append(valCode, subName);

	const cell2 = createEl("div", "cefr-stat-cell");
	cell2.appendChild(createEl("span", "cefr-stat-label", "Mục Tiêu Band IELTS"));
	const valBand = createEl("span", "cefr-stat-value", "");
	valBand.id = "cefrBand";
	const subBand = createEl("span", "cefr-stat-sub", "");
	subBand.id = "cefrBandSub";
	cell2.append(valBand, subBand);

	const cell3 = createEl("div", "cefr-stat-cell");
	cell3.appendChild(createEl("span", "cefr-stat-label", "Định Lượng Giờ Học"));
	const valHours = createEl("span", "cefr-stat-value", "");
	valHours.id = "cefrHours";
	const subVocab = createEl("span", "cefr-stat-sub", "");
	subVocab.id = "cefrVocab";
	cell3.append(valHours, subVocab);

	const cell4 = createEl("div", "cefr-stat-cell");
	cell4.appendChild(createEl("span", "cefr-stat-label", "Năng Lực Đầu Ra"));
	const subOutcome = createEl("span", "cefr-stat-sub", "");
	subOutcome.id = "cefrOutcome";
	subOutcome.style.fontWeight = "600";
	cell4.appendChild(subOutcome);

	detailPanel.append(cell1, cell2, cell3, cell4);

	function updatePanel(key) {
		const d = CEFR_EXPLORER_DATA[key];
		if (!d) return;
		valCode.textContent = d.code;
		subName.textContent = d.name;
		valBand.textContent = d.band;
		subBand.textContent = d.bandSub;
		valHours.textContent = d.hours;
		subVocab.textContent = d.vocab;
		subOutcome.textContent = d.outcome;
		selectorRow.querySelectorAll(".cefr-tab-btn").forEach((btn) => {
			btn.setAttribute(
				"aria-selected",
				String(btn.getAttribute("data-cefr-btn") === key),
			);
		});
	}

	const tabKeys = [
		{ key: "a1", label: "A1 – A2 (Mất gốc → 4.0+)" },
		{ key: "b1", label: "B1 (Pre-IELTS → 4.5–5.0+)" },
		{ key: "b2", label: "B2 (Intensive → 5.5–6.5)" },
		{ key: "c1", label: "C1 (Advanced → 7.0–7.5+)" },
	];

	for (const tab of tabKeys) {
		const btn = createEl("button", "cefr-tab-btn", tab.label);
		btn.type = "button";
		btn.setAttribute("role", "tab");
		btn.setAttribute("data-cefr-btn", tab.key);
		btn.setAttribute("aria-selected", String(tab.key === activeKey));
		btn.addEventListener("click", () => updatePanel(tab.key));
		selectorRow.appendChild(btn);
	}

	updatePanel(activeKey);
	box.append(selectorRow, detailPanel);
	return box;
}
