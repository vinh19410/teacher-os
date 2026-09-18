export interface GenrePreset {
	id: string;
	label: string;
	title: string;
	prompt: string;
}

export interface TaskPreset {
	id: "task1" | "task2";
	label: string;
	words: number;
	minutes: number;
	help: string;
	genres: GenrePreset[];
}

/** Copy nguyên từ design v3 "Thêm đề vào ngân hàng" — preset phía client,
 * thêm dạng đề mới không cần migration (genre chỉ là id string). */
export const TASK_PRESETS: TaskPreset[] = [
	{
		id: "task1",
		label: "Task 1",
		words: 150,
		minutes: 20,
		help: "Mô tả biểu đồ, bảng, bản đồ hoặc quy trình. Ảnh biểu đồ chưa đính trong bản này.",
		genres: [
			{
				id: "chart",
				label: "Biểu đồ",
				title: "Writing Task 1 — Chart",
				prompt:
					"The charts below show the percentage of water used for different purposes in six areas of the world.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.",
			},
			{
				id: "table",
				label: "Bảng số liệu",
				title: "Writing Task 1 — Table",
				prompt:
					"The tables below give information about sales of Fairtrade-labelled coffee and bananas in 1999 and 2004.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.",
			},
			{
				id: "map",
				label: "Bản đồ",
				title: "Writing Task 1 — Map",
				prompt:
					"The maps below show an industrial area in the town of Norbiton, and planned future development of the site.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.",
			},
			{
				id: "process",
				label: "Quy trình",
				title: "Writing Task 1 — Process",
				prompt:
					"The diagram below shows how instant noodles are manufactured.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.",
			},
		],
	},
	{
		id: "task2",
		label: "Task 2",
		words: 250,
		minutes: 40,
		help: "Học viên thấy đúng đoạn văn này. Không cần đính ảnh cho Task 2.",
		genres: [
			{
				id: "discuss",
				label: "Discuss both views",
				title: "Writing Task 2 — Discuss both views",
				prompt:
					"Some people think that all university students should study whatever they like. Others believe that they should only be allowed to study subjects that will be useful in the future, such as those related to science and technology.\n\nDiscuss both these views and give your own opinion.",
			},
			{
				id: "opinion",
				label: "Opinion",
				title: "Writing Task 2 — Opinion",
				prompt:
					"Some people believe that unpaid community service should be a compulsory part of high school programmes.\n\nTo what extent do you agree or disagree?",
			},
			{
				id: "advantage",
				label: "Advantages",
				title: "Writing Task 2 — Advantages",
				prompt:
					"In some countries, young people are encouraged to work or travel for a year between finishing high school and starting university studies.\n\nDiscuss the advantages and disadvantages for young people who decide to do this.",
			},
			{
				id: "problem",
				label: "Problem / Solution",
				title: "Writing Task 2 — Problem",
				prompt:
					"In many cities the use of private cars is increasing and this is causing a range of problems.\n\nWhat are those problems? What measures could be taken to deal with them?",
			},
		],
	},
];

export function taskOf(taskId: string): TaskPreset {
	return TASK_PRESETS.find((t) => t.id === taskId) ?? TASK_PRESETS[1];
}

export function genreOf(taskId: string, genreId: string): GenrePreset {
	const task = taskOf(taskId);
	return task.genres.find((g) => g.id === genreId) ?? task.genres[0];
}

export function wordCount(text: string): number {
	const t = (text || "").trim();
	if (!t) return 0;
	return t.split(/\s+/).length;
}

/** Default-composition rule from the design: switching task/genre applies the
 * preset title/prompt unless the teacher already edited that field. */
export function compositionDefaults(
	taskId: string,
	genreId: string,
	dirtyTitle: boolean,
	dirtyPrompt: boolean,
): { title: string; prompt: string } {
	const genre = genreOf(taskId, genreId);
	return {
		title: dirtyTitle ? "" : genre.title,
		prompt: dirtyPrompt ? "" : genre.prompt,
	};
}
