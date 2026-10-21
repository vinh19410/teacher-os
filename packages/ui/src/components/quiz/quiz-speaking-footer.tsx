/**
 * Footer sticky của take screen Speaking (#305) — cùng khung + testid với
 * `QuizNavigator`/`QuizEssayFooter` (helper e2e `openPaper` chờ
 * `navigator-progress`), thay navigator số câu bằng trạng thái file bài nói.
 */
export function QuizSpeakingFooter({ hasMedia }: { hasMedia: boolean }) {
	return (
		<footer className="sticky bottom-0 z-20 border-line border-t bg-bg/95 backdrop-blur">
			<div className="mx-auto w-full max-w-[720px] px-4 py-3">
				<p
					data-testid="navigator-progress"
					className="text-[13px] text-muted-fg"
				>
					{hasMedia ? (
						<span className="font-medium text-fg">Đã tải file bài nói</span>
					) : (
						"Chưa tải file bài nói"
					)}
				</p>
			</div>
		</footer>
	);
}
