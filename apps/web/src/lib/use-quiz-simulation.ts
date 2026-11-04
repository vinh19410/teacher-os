import { gradeQuiz, type QuizGrade } from "@teacher-os/api/lib/grade-quiz";
import { useCallback, useState } from "react";
import type { QuizSimulation } from "@/lib/assignment-quiz-sim";

export interface QuizSimulationApi {
	/** Bài làm keyed theo `q` 0-based — giữ nguyên khi đổi tab. */
	answers: Record<number, string>;
	/** Kết quả chấm client-side — null = đang ở take (chưa nộp). */
	grade: QuizGrade | null;
	onAnswer: (q: number, value: string) => void;
	essay: string;
	onEssayChange: (value: string) => void;
	submit: () => void;
	reset: () => void;
}

/**
 * State simulation sống ở route component: đổi tab không mất bài làm, "Làm
 * lại" là reset duy nhất bởi user. Đổi đề (`?id=A` → `?id=B`, draft đổi) là
 * search-only navigation nên route KHÔNG remount — reset bằng so sánh
 * `simKey` (string ổn định, không dùng object identity vì draft map tạo
 * object mới mỗi render). Reset chạy ngay trong render (pattern "adjust
 * state when a prop changes" của React) để không còn frame stale hiển thị
 * grade đề cũ trên đề mới.
 */
export function useQuizSimulation(
	sim: QuizSimulation | null,
): QuizSimulationApi {
	const [answers, setAnswers] = useState<Record<number, string>>({});
	const [grade, setGrade] = useState<QuizGrade | null>(null);
	const [essay, setEssay] = useState("");
	const simKey = sim?.simKey ?? "";
	const [lastKey, setLastKey] = useState(simKey);
	if (lastKey !== simKey) {
		setLastKey(simKey);
		setAnswers({});
		setGrade(null);
		setEssay("");
	}
	const onAnswer = useCallback((q: number, value: string) => {
		setAnswers((prev) => ({ ...prev, [q]: value }));
	}, []);
	const submit = useCallback(() => {
		if (!sim || grade) return;
		setGrade(
			gradeQuiz(sim.fullQuestions, Object.fromEntries(Object.entries(answers))),
		);
	}, [sim, answers, grade]);
	const reset = useCallback(() => {
		setAnswers({});
		setGrade(null);
		setEssay("");
	}, []);
	return {
		answers,
		grade,
		onAnswer,
		essay,
		onEssayChange: setEssay,
		submit,
		reset,
	};
}
