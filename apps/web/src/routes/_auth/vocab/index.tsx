import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHead } from "@/components/ui/page-head";
import { Tabs } from "@/components/ui/tabs";
import { VocabHubDecks } from "@/components/vocab/vocab-hub-decks";
import { VocabProgressTab } from "@/components/vocab/vocab-progress-tab";
import { useData } from "@/lib/data-store";

export const Route = createFileRoute("/_auth/vocab/")({
	component: VocabHubRoute,
});

export function VocabHubRoute() {
	const { data } = useData();
	const [tab, setTab] = useState<"decks" | "progress">("decks");

	const independentCount = data.vocabDecks.filter(
		(d) => d.classId === null,
	).length;
	const pendingSuggestionsCount = (data.vocabSuggestions ?? []).length;

	return (
		<div>
			<PageHead
				kicker={`${data.vocabDecks.length} BỘ TỪ · ${independentCount} RIÊNG · ${pendingSuggestionsCount} GỢI Ý CHỜ`}
				title="Từ vựng"
			/>

			<Tabs
				tabs={[
					{ id: "decks", label: "Bộ từ vựng" },
					{ id: "progress", label: "Tiến độ" },
				]}
				active={tab}
				onChange={(id) => setTab(id === "progress" ? "progress" : "decks")}
			/>

			{tab === "decks" ? <VocabHubDecks /> : <VocabProgressTab />}
		</div>
	);
}
