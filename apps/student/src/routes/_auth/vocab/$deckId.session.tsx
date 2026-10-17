import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { StudentShell } from "@/components/layout/student-shell";
import Loader from "@/components/loader";
import { VocabSessionView } from "@/components/vocab/vocab-session-view";
import { useStudentMe } from "@/lib/repos/student";
import { useVocabSessionData } from "@/lib/repos/vocab";

export const Route = createFileRoute("/_auth/vocab/$deckId/session")({
	component: VocabSessionRoutePage,
});

function VocabSessionRoutePage() {
	const { deckId } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const meQuery = useStudentMe();
	const sessionQuery = useVocabSessionData(deckId);
	// Nonce ổn định suốt vòng đời mount (I2): refetch không được đổi key engine.
	const [sessionNonce] = useState(() => Date.now());

	if (meQuery.isLoading || sessionQuery.isLoading) {
		return <Loader />;
	}

	const me = meQuery.data;
	const data = sessionQuery.data;

	const handleExit = async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: ["student", "vocab-overview"] }),
			queryClient.invalidateQueries({
				queryKey: ["student", "vocab-session-data", deckId],
			}),
		]);
		void navigate({ to: "/vocab/$deckId", params: { deckId } });
	};

	if (!data) {
		return (
			<StudentShell userName={me?.student.name} userEmail={me?.user.email}>
				<div className="neu rounded-md p-6 text-center">
					<p className="text-meta text-sm">Không tìm thấy bộ từ vựng.</p>
				</div>
			</StudentShell>
		);
	}

	return (
		<StudentShell userName={me?.student.name} userEmail={me?.user.email}>
			{/* Nonce cố định mỗi lần MOUNT route — dataUpdatedAt đổi khi refetch
				sẽ tái tạo engine giữa phiên (F14), mất tiến độ đã chơi. */}
			<VocabSessionView
				sessionData={data}
				sessionNonce={sessionNonce}
				onExit={() => void handleExit()}
			/>
		</StudentShell>
	);
}
