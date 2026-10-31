/**
 * Module chấm điểm thuần cho trang kiểm tra đầu vào (/kiem-tra-dau-vao/).
 * Không phụ thuộc DOM hay trình duyệt; chạy được trực tiếp trên Node test runner và browser.
 */

export const LEAD_PLACEMENT_MAX = 300;

/**
 * Trải phẳng toàn bộ câu hỏi của bài kiểm tra theo thứ tự Phần 1 -> Phần 2.
 * @param {object} test Dữ liệu bộ đề kiểm tra đầu vào
 * @returns {Array<{id: string, partId: string, clipId?: string, level: string, prompt: string, options: string[], answer: number}>}
 */
export function flattenQuestions(test) {
	if (!test || !Array.isArray(test.parts)) return [];
	const items = [];
	for (const part of test.parts) {
		if (!part || typeof part !== "object") continue;
		if (Array.isArray(part.questions)) {
			for (const q of part.questions) {
				items.push({
					...q,
					partId: part.id,
				});
			}
		}
		if (Array.isArray(part.clips)) {
			for (const clip of part.clips) {
				if (!clip || !Array.isArray(clip.questions)) continue;
				for (const q of clip.questions) {
					items.push({
						...q,
						partId: part.id,
						clipId: clip.id,
					});
				}
			}
		}
	}
	return items;
}

/**
 * Chấm điểm bài làm và quy đổi sang CEFR + mã khóa học đề xuất theo bảng bands.
 * Câu bỏ trống hoặc đáp án không phải số nguyên hợp lệ được tính là 0 điểm.
 *
 * @param {object} test Dữ liệu bộ đề kiểm tra đầu vào
 * @param {Record<string, number | undefined | null>} answers Map id câu hỏi -> chỉ số đáp án (0..3)
 */
export function gradeAttempt(test, answers = {}) {
	const safeAnswers =
		answers && typeof answers === "object" ? answers : Object.create(null);
	const questions = flattenQuestions(test);

	let vgScore = 0;
	let vgTotal = 0;
	let listeningScore = 0;
	let listeningTotal = 0;

	for (const q of questions) {
		const picked = safeAnswers[q.id];
		const isCorrect =
			Number.isInteger(picked) && picked >= 0 && picked === q.answer;
		if (q.partId === "vocab-grammar") {
			vgTotal += 1;
			if (isCorrect) vgScore += 1;
		} else if (q.partId === "listening") {
			listeningTotal += 1;
			if (isCorrect) listeningScore += 1;
		}
	}

	const totalScore = vgScore + listeningScore;
	const maxScore = vgTotal + listeningTotal;

	const bands = Array.isArray(test?.bands) ? test.bands : [];
	const matchedBand = bands.find(
		(b) =>
			typeof b.min === "number" &&
			typeof b.max === "number" &&
			totalScore >= b.min &&
			totalScore <= b.max,
	) ??
		bands[0] ?? {
			min: 0,
			max: maxScore,
			cefr: "A1",
			course: "ielts-foundation",
			courseLabel: "",
		};

	return {
		totalScore,
		maxScore,
		vocabGrammar: {
			score: vgScore,
			total: vgTotal,
		},
		listening: {
			score: listeningScore,
			total: listeningTotal,
		},
		band: {
			min: matchedBand.min,
			max: matchedBand.max,
			cefr: matchedBand.cefr,
			course: matchedBand.course,
			courseLabel: matchedBand.courseLabel ?? "",
		},
	};
}

/**
 * Tạo chuỗi tóm tắt kết quả để đính kèm vào form đăng ký (tối đa 300 ký tự).
 * Ví dụ: "Kiểm tra đầu vào: 21/30 (Vocab + Grammar 11/15, Listening 10/15) – CEFR B1"
 *
 * @param {ReturnType<typeof gradeAttempt>} result
 * @returns {string}
 */
export function buildPlacementSummary(result) {
	if (!result || typeof result !== "object") return "";
	const totalScore = Number(result.totalScore ?? 0);
	const maxScore = Number(result.maxScore ?? 30);
	const vgScore = Number(result.vocabGrammar?.score ?? 0);
	const vgTotal = Number(result.vocabGrammar?.total ?? 15);
	const lScore = Number(result.listening?.score ?? 0);
	const lTotal = Number(result.listening?.total ?? 15);
	const cefr = String(result.band?.cefr ?? "A1").trim();

	const summary = `Kiểm tra đầu vào: ${totalScore}/${maxScore} (Vocab + Grammar ${vgScore}/${vgTotal}, Listening ${lScore}/${lTotal}) – CEFR ${cefr}`;
	return summary.slice(0, LEAD_PLACEMENT_MAX);
}
