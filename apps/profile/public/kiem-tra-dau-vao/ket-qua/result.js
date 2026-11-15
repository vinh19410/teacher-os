import {
	buildHighlightSegments,
	categoryLabel,
	errorNumberLabel,
	numberErrors,
	PLACEMENT_ERROR_CATEGORIES,
	PLACEMENT_SPEAKING_RUBRIC,
	PLACEMENT_WRITING_RUBRIC,
} from "./highlight.js";

/**
 * Trang kết quả công khai (#730). Mọi dữ liệu từ server được render bằng DOM API
 * (createTextNode), không dùng API chèn HTML thô.
 */

const root = document.getElementById("resultRoot");
const WRITING_MAX = 15;
const SPEAKING_MAX = 20;

function el(tag, attrs = {}, children = []) {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (v === undefined || v === null || v === false) continue;
		if (k === "className") node.className = v;
		else if (v === true) node.setAttribute(k, "");
		else node.setAttribute(k, String(v));
	}
	for (const child of Array.isArray(children) ? children : [children]) {
		if (child === undefined || child === null || child === false) continue;
		node.appendChild(
			typeof child === "string" || typeof child === "number"
				? document.createTextNode(String(child))
				: child,
		);
	}
	return node;
}

function resolveApiBase() {
	const meta = document.querySelector('meta[name="lead-api"]');
	return (meta?.getAttribute("content") ?? "").trim().replace(/\/+$/, "");
}

function readToken() {
	const token = new URLSearchParams(window.location.search).get("t") ?? "";
	return token.trim();
}

function setView(...nodes) {
	root.replaceChildren(...nodes);
}

function messageCard({ kicker, title, text, action }) {
	return el(
		"div",
		{ className: "loading-card result-message", role: "status" },
		[
			el("p", { className: "kicker-pill" }, kicker),
			el("h1", {}, title),
			el("p", { className: "muted-copy" }, text),
			action ?? null,
		],
	);
}

function showLoading() {
	setView(
		messageCard({
			kicker: "Đang tải kết quả",
			title: "Kết quả bài kiểm tra đầu vào",
			text: "Vui lòng chờ trong giây lát...",
		}),
	);
}

function showNotReady() {
	setView(
		messageCard({
			kicker: "Chưa có kết quả",
			title: "Kết quả chưa sẵn sàng hoặc link không đúng",
			text: "Cô chưa chốt kết quả cho bài này, hoặc đường link bị thiếu/sai. Vui lòng kiểm tra lại link trong tin nhắn/email cô gửi, hoặc nhắn Zalo 0929.060.994 để được hỗ trợ.",
			action: el(
				"a",
				{ className: "btn btn-outline", href: "../" },
				"Về trang kiểm tra đầu vào",
			),
		}),
	);
}

function showNetworkError(retry) {
	const btn = el(
		"button",
		{ className: "btn btn-primary", type: "button" },
		"Thử lại",
	);
	btn.addEventListener("click", retry);
	setView(
		messageCard({
			kicker: "Lỗi kết nối",
			title: "Không tải được kết quả",
			text: "Có lỗi mạng hoặc máy chủ đang bận. Bạn hãy kiểm tra kết nối rồi thử lại.",
			action: btn,
		}),
	);
}

function formatDate(iso) {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	return d.toLocaleDateString("vi-VN", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	});
}

function sectionScoreText(score) {
	if (!score || !Number.isFinite(score.total) || score.total <= 0) return "—";
	const pct = Number.isFinite(score.pct) ? ` (${Math.round(score.pct)}%)` : "";
	return `${score.correct}/${score.total}${pct}`;
}

function statTile(label, value) {
	return el("div", { className: "result-stat" }, [
		el("dt", {}, label),
		el("dd", {}, value),
	]);
}

function rubricList(rubricDef, rubric) {
	if (!rubric) return null;
	return el(
		"dl",
		{ className: "result-rubric" },
		rubricDef.map(({ key, label }) =>
			statTile(label, `${Number.isFinite(rubric[key]) ? rubric[key] : "—"}/5`),
		),
	);
}

function buildLegend() {
	return el(
		"div",
		{ className: "error-legend", "aria-label": "Chú giải loại lỗi" },
		[
			el("p", { className: "error-legend-title" }, "Chú giải loại lỗi:"),
			el(
				"ul",
				{ className: "error-legend-list" },
				PLACEMENT_ERROR_CATEGORIES.map(({ key, label }) =>
					el("li", {}, [
						el(
							"span",
							{ className: `err-mark err-${key}`, "aria-hidden": "true" },
							"Aa",
						),
						` ${label}`,
					]),
				),
			),
		],
	);
}

/** Văn bản có highlight + danh sách thẻ lỗi. `prefix` tách id giữa Writing/Speaking. */
function buildAnnotatedText({ prefix, text, errors }) {
	const numbered = numberErrors(errors);
	const textBox = el("p", { className: "annotated-text" });
	for (const seg of buildHighlightSegments(text, errors)) {
		if (!seg.error) {
			textBox.appendChild(document.createTextNode(seg.text));
			continue;
		}
		const e = seg.error;
		const mark = el(
			"mark",
			{
				className: `err-mark err-${e.category}`,
				id: `${prefix}-mark-${e.number}`,
			},
			[
				seg.text,
				el(
					"a",
					{
						className: "err-num",
						href: `#${prefix}-card-${e.number}`,
						"aria-label": `Lỗi ${e.number}, ${categoryLabel(e.category)}. Xem giải thích`,
					},
					errorNumberLabel(e.number),
				),
			],
		);
		textBox.appendChild(mark);
	}

	const cards =
		numbered.length === 0
			? el(
					"p",
					{ className: "muted-copy" },
					"Cô không ghi nhận lỗi nào cần đánh dấu.",
				)
			: el(
					"ol",
					{ className: "error-cards" },
					numbered.map((e) => {
						const located =
							Number.isInteger(e.start) && Number.isInteger(e.end);
						return el(
							"li",
							{
								className: `error-card err-border-${e.category}`,
								id: `${prefix}-card-${e.number}`,
								tabindex: "-1",
							},
							[
								el("div", { className: "error-card-head" }, [
									located
										? el(
												"a",
												{
													className: "err-num",
													href: `#${prefix}-mark-${e.number}`,
													"aria-label": `Lỗi ${e.number}. Về đoạn trong bài`,
												},
												errorNumberLabel(e.number),
											)
										: el(
												"span",
												{ className: "err-num" },
												errorNumberLabel(e.number),
											),
									el("strong", {}, categoryLabel(e.category)),
								]),
								el("p", { className: "error-fix" }, [
									el("span", { className: "error-quote" }, e.quote),
									e.correction ? " → " : null,
									e.correction
										? el(
												"span",
												{ className: "error-correction" },
												e.correction,
											)
										: null,
								]),
								e.explanation
									? el("p", { className: "error-explain" }, e.explanation)
									: null,
							],
						);
					}),
				);
	return [textBox, cards];
}

function section(title, children, id) {
	return el(
		"section",
		{ className: "card result-section", "aria-labelledby": id },
		[el("h2", { id }, title), ...children],
	);
}

function textBlock(title, text, id) {
	if (!text || !String(text).trim()) return null;
	return section(title, [el("p", { className: "result-prose" }, text)], id);
}

function renderResult(view) {
	const obj = view.objective ?? {};
	const parts = [];

	const heroFacts = [];
	if (view.finalBandLevel) {
		heroFacts.push(statTile("Trình độ (CEFR)", view.finalBandLevel));
	}
	if (view.finalDisplayCourse) {
		heroFacts.push(statTile("Khoá đề xuất", view.finalDisplayCourse));
	}
	if (Number.isFinite(view.finalScorePct)) {
		heroFacts.push(statTile("Điểm tổng", `${Math.round(view.finalScorePct)}%`));
	}
	const submitted = formatDate(view.submittedAt);
	parts.push(
		el("div", { className: "card result-hero" }, [
			el("p", { className: "kicker-pill" }, "Kết quả đã được cô chốt"),
			el(
				"h1",
				{ id: "resultTitle" },
				`Kết quả của ${view.studentName || "bạn"}`,
			),
			submitted
				? el("p", { className: "muted-copy" }, `Bài làm ngày ${submitted}`)
				: null,
			heroFacts.length
				? el("dl", { className: "result-rubric" }, heroFacts)
				: null,
		]),
	);

	parts.push(
		section(
			"Điểm các kỹ năng",
			[
				el("dl", { className: "result-rubric" }, [
					statTile("Listening", sectionScoreText(obj.listening)),
					statTile("Grammar & Vocabulary", sectionScoreText(obj.vocabGrammar)),
					statTile("Reading", sectionScoreText(obj.reading)),
				]),
			],
			"secObjective",
		),
	);

	const writingChildren = [];
	if (Number.isFinite(view.writingScore)) {
		writingChildren.push(
			el(
				"p",
				{ className: "result-total" },
				`Writing: ${view.writingScore}/${WRITING_MAX}`,
			),
		);
	}
	const writingRubric = rubricList(
		PLACEMENT_WRITING_RUBRIC,
		view.writingRubric,
	);
	if (writingRubric) writingChildren.push(writingRubric);
	if (view.writingText) {
		writingChildren.push(
			el("h3", {}, "Bài viết của bạn"),
			buildLegend(),
			...buildAnnotatedText({
				prefix: "w",
				text: view.writingText,
				errors: view.writingErrors,
			}),
		);
	}
	if (writingChildren.length) {
		parts.push(section("Writing", writingChildren, "secWriting"));
	}

	const speakingChildren = [];
	if (view.speakingStatus === "skipped") {
		speakingChildren.push(
			el("p", { className: "muted-copy" }, "Bạn đã bỏ qua phần Speaking."),
		);
	}
	if (Number.isFinite(view.speakingScore)) {
		speakingChildren.push(
			el(
				"p",
				{ className: "result-total" },
				`Speaking: ${view.speakingScore}/${SPEAKING_MAX}`,
			),
		);
	}
	const speakingRubric = rubricList(
		PLACEMENT_SPEAKING_RUBRIC,
		view.speakingRubric,
	);
	if (speakingRubric) speakingChildren.push(speakingRubric);
	if (view.speakingTranscript) {
		speakingChildren.push(
			el("h3", {}, "Transcript bài nói của bạn"),
			buildLegend(),
			...buildAnnotatedText({
				prefix: "s",
				text: view.speakingTranscript,
				errors: view.speakingErrors,
			}),
		);
	}
	if (speakingChildren.length) {
		parts.push(section("Speaking", speakingChildren, "secSpeaking"));
	}

	for (const block of [
		textBlock("Nhận xét của cô", view.teacherFeedback, "secFeedback"),
		textBlock("Lời khuyên theo trình độ", view.bandAdvice, "secAdvice"),
		textBlock("Ghi chú thêm", view.finalNote, "secNote"),
	]) {
		if (block) parts.push(block);
	}

	parts.push(
		el("div", { className: "result-cta" }, [
			el(
				"a",
				{ className: "btn btn-gold btn-lg", href: "../../#dang-ky-tu-van" },
				"🎓 Đăng ký tư vấn lộ trình",
			),
		]),
	);
	setView(...parts);
}

async function load() {
	const token = readToken();
	if (!token) {
		showNotReady();
		return;
	}
	showLoading();
	let response;
	try {
		response = await fetch(
			`${resolveApiBase()}/public/placement-test/results/${encodeURIComponent(token)}`,
			{
				method: "GET",
				headers: { accept: "application/json" },
				credentials: "omit",
				referrerPolicy: "no-referrer",
				cache: "no-store",
			},
		);
	} catch {
		showNetworkError(load);
		return;
	}
	if (response.status === 404 || response.status === 400) {
		showNotReady();
		return;
	}
	if (!response.ok) {
		showNetworkError(load);
		return;
	}
	let view;
	try {
		view = await response.json();
	} catch {
		showNetworkError(load);
		return;
	}
	renderResult(view);
}

load();
