import type { AiGrader } from "./ai-grading/grader";
import { createWorkersAiGrader } from "./ai-grading/workers-ai-grader";
import {
	createWorkersAiExtractor,
	type ExamExtractor,
	type WorkersAiBinding,
} from "./exam-import/extractor";

export interface AiGateEnv {
	AI?: WorkersAiBinding;
	AI_ENABLED?: string;
}

export function createAiProviders(env: AiGateEnv): {
	getExamExtractor(): ExamExtractor | undefined;
	getAiGrader(): AiGrader | undefined;
} {
	const binding = env.AI_ENABLED === "true" ? env.AI : undefined;
	return {
		getExamExtractor: () =>
			binding ? createWorkersAiExtractor(binding) : undefined,
		getAiGrader: () => (binding ? createWorkersAiGrader(binding) : undefined),
	};
}
