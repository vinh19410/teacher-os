import { QuizNavigator } from "@teacher-os/ui/components/quiz/quiz-navigator";
import { QuizPaper } from "@teacher-os/ui/components/quiz/quiz-paper";
import { scrollToQuestion } from "@teacher-os/ui/components/quiz/quiz-question-item";
import {
	isReadingSplitPane,
	QuizReadingSplitLayout,
} from "@teacher-os/ui/components/quiz/quiz-reading-layout";
import { buttonVariants } from "@teacher-os/ui/components/web-kit/button";
import { X } from "lucide-react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import type { PreviewTab, PreviewTabState } from "./test-preview-model";

/** Nhãn tiếng Việt của cờ nhóm chưa hỗ trợ (D7) — banner preview. */
const FLAG_LABELS: Record<string, string> = {
	answersInline: "đáp án trong dòng",
	splitContent: "tách nội dung theo nhóm",
	dragDrop: "kéo thả",
};

const STATE_WARNING: Partial<Record<PreviewTabState, string>> = {
	"saved-fallback":
		"đang hiển thị bản ĐÃ LƯU vì bản nháp lỗi schema (số câu theo bản nháp, nội dung theo bản đã lưu)",
	"groups-corrupt":
		"có nhóm câu hỏng — đang hiển thị cấu trúc đơn giản hoá thay vì nhóm",
	"draft-invalid": "bản nháp lỗi schema — chưa hiển thị được trong xem trước",
};

/**
 * Overlay toàn màn hình "Xem trước" của trang soạn bộ đề (#433): render bộ
 * đề bằng đúng component take screen học viên. Làm thử KHÔNG lưu — answers
 * giữ trong state cục bộ của overlay, không mutation/fetch (red-team RT4);
 * answers theo TỪNG tab (kongming C1 — tab fallback saved có thể dài/ngắn
 * hơn draft, chung namespace sẽ đè đáp án chéo tab). Esc / nút Đóng trả
 * focus về nút Xem trước (precedent delete-test-dialog).
 */
export function TestPreviewOverlay({
	testTitle,
	tabs,
	initialPart,
	onClose,
	triggerRef,
}: {
	testTitle: string;
	tabs: PreviewTab[];
	/** Part đang soạn — tab mặc định khi mở (D4). */
	initialPart: string | null;
	onClose: () => void;
	/** Nút "Xem trước" trên toolbar — nhận lại focus khi đóng. */
	triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
	const validInitial = tabs.some((tab) => tab.part === initialPart)
		? (initialPart ?? tabs[0]?.part ?? "")
		: (tabs[0]?.part ?? "");
	const [currentPart, setCurrentPart] = useState(validInitial);
	const [currentQuestion, setCurrentQuestion] = useState<number | null>(null);
	const [answersByTab, setAnswersByTab] = useState<
		Record<string, Record<number, string>>
	>({});
	const closeRef = useRef<HTMLButtonElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	// Effect mount chỉ chạy 1 lần — onClose đọc qua ref để route re-render
	// (refetch sau lưu part/header) không re-bind listener hay cướp focus
	// giữa phiên overlay mở (code-review #433 Important).
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	useEffect(() => {
		closeRef.current?.focus();
		const onKeyDown = (event: globalThis.KeyboardEvent) => {
			if (event.key === "Escape") onCloseRef.current();
		};
		document.addEventListener("keydown", onKeyDown);
		const previousOverflow = document.body.style.overflow;
		// Khóa cuộn trang soạn bên dưới khi overlay mở (plan phase 2).
		document.body.style.overflow = "hidden";
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			document.body.style.overflow = previousOverflow;
			triggerRef.current?.focus();
		};
	}, [triggerRef]);

	const tab = tabs.find((entry) => entry.part === currentPart) ?? tabs[0];
	if (!tab) return null;
	const view = tab.view;
	const answers = answersByTab[tab.part] ?? {};
	const splitPane =
		view !== null && isReadingSplitPane(view.detail.skill, view.detail.passage);
	const navigator =
		view === null ? null : (
			<QuizNavigator
				parts={view.parts}
				answers={answers}
				current={currentQuestion}
				onSelect={(q) => {
					setCurrentQuestion(q);
					scrollToQuestion(q);
				}}
			/>
		);
	const handleAnswer = (q: number, value: string) => {
		setAnswersByTab((previous) => ({
			...previous,
			[tab.part]: { ...(previous[tab.part] ?? {}), [q]: value },
		}));
	};
	const warnings: string[] = [];
	for (const entry of tabs) {
		if (entry.savedFallback) {
			warnings.push(
				`«${entry.label}» đang hiển thị bản ĐÃ LƯU vì bản nháp lỗi schema (số câu theo bản nháp, nội dung theo bản đã lưu)`,
			);
		}
		if (entry.corrupt) {
			warnings.push(
				`«${entry.label}» có nhóm câu hỏng — đang hiển thị cấu trúc đơn giản hoá thay vì nhóm`,
			);
		}
		if (entry.state === "draft-invalid") {
			warnings.push(
				`«${entry.label}» bản nháp lỗi schema — chưa hiển thị được trong xem trước`,
			);
		}
	}
	const flaggedGroups = (view?.unsupportedGroupFlags ?? []).map(
		({ groupLabel, flags }) =>
			`«${groupLabel}» học viên hiện chưa thấy hiệu ứng: ${flags
				.map((flag) => FLAG_LABELS[flag] ?? flag)
				.join(", ")}.`,
	);

	// Giữ Tab trong overlay (focus trap tối giản): Tab trên container luân
	// chuyển giữa các phần tử focusable; ranh giới = container overlay.
	const trapTab = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "Tab" || !containerRef.current) return;
		const focusables = [
			...containerRef.current.querySelectorAll<HTMLElement>(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
			),
		].filter((element) => !element.hasAttribute("disabled"));
		if (focusables.length === 0) return;
		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		const active = document.activeElement;
		if (event.shiftKey && active === first) {
			event.preventDefault();
			last?.focus();
		} else if (!event.shiftKey && active === last) {
			event.preventDefault();
			first?.focus();
		}
	};

	// Tablist: mũi tên trái/phải chuyển tab (plan phase 2 — điều hướng bàn phím).
	const onTablistKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
		const index = tabs.findIndex((entry) => entry.part === tab.part);
		const delta = event.key === "ArrowRight" ? 1 : -1;
		const next = tabs[(index + delta + tabs.length) % tabs.length];
		if (next) {
			event.preventDefault();
			setCurrentPart(next.part);
			setCurrentQuestion(null);
		}
	};

	return (
		<div
			ref={containerRef}
			role="dialog"
			aria-modal="true"
			aria-label={`Xem trước bộ đề ${testTitle}`}
			// Nền ĐẶC — overlay nằm trên trang soạn; bg-muted/30 của take view
			// là nền mờ trên body trống, không dùng được cho overlay.
			className="fixed inset-0 z-50 flex flex-col bg-background"
			onKeyDown={trapTab}
		>
			<header className="flex h-14 flex-none items-center justify-between gap-3 border-border border-b bg-background px-4">
				<div className="flex min-w-0 items-center gap-2">
					<h2 className="truncate font-semibold text-base">{testTitle}</h2>
					<span className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
						Xem trước
					</span>
				</div>
				<button
					ref={closeRef}
					type="button"
					className={buttonVariants({ variant: "outline", size: "sm" })}
					onClick={onClose}
				>
					<X aria-hidden="true" className="size-4" />
					Đóng
				</button>
			</header>

			<div className="border-border border-b bg-background px-4 py-2 text-sm">
				<p className="font-medium">
					Bản xem trước — học viên sẽ thấy giao diện này. Đáp án bạn chọn không
					được lưu.
				</p>
				{tabs.length > 1 && (
					<p className="text-muted-foreground text-xs">
						Bố cục nhiều part là quy ước cho luồng clone sắp tới — take screen
						học viên hiện tại hiển thị một đề liền mạch.
					</p>
				)}
				{warnings.length > 0 && (
					<ul className="mt-1 list-disc pl-5 text-amber-600 text-xs">
						{warnings.map((message) => (
							<li key={message}>{message}</li>
						))}
					</ul>
				)}
				{flaggedGroups.length > 0 && (
					<ul className="mt-1 list-disc pl-5 text-muted-foreground text-xs">
						{flaggedGroups.map((message) => (
							<li key={message}>{message}</li>
						))}
					</ul>
				)}
			</div>

			<div
				role="tablist"
				aria-label="Chọn part xem trước"
				className="flex flex-none gap-1 overflow-x-auto border-border border-b bg-background px-4 py-1.5"
				onKeyDown={onTablistKeyDown}
			>
				{tabs.map((entry) => {
					const selected = entry.part === tab.part;
					const suffix = STATE_WARNING[entry.state]
						? entry.state === "draft-invalid"
							? " · nháp lỗi"
							: entry.state === "groups-corrupt"
								? " · nhóm hỏng"
								: " · bản lưu"
						: "";
					return (
						<button
							key={entry.part}
							type="button"
							role="tab"
							aria-selected={selected}
							tabIndex={selected ? 0 : -1}
							className={`flex-none rounded-md px-3 py-1.5 text-sm ${
								selected
									? "bg-primary text-primary-foreground"
									: "hover:bg-accent"
							}`}
							onClick={() => {
								setCurrentPart(entry.part);
								setCurrentQuestion(null);
							}}
						>
							{entry.label}
							{suffix}
						</button>
					);
				})}
			</div>

			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
				{view === null ? (
					<div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
						<p className="font-medium text-sm">
							{tab.state === "draft-invalid"
								? "Bản nháp hiện không hợp lệ nên chưa hiện trong xem trước."
								: "Part này chưa có nội dung."}
						</p>
						<p className="text-muted-foreground text-sm">
							{tab.state === "draft-invalid"
								? "Sửa lỗi ở form part rồi mở lại xem trước."
								: "Thêm nội dung ở trang soạn để xem trước part này."}
						</p>
					</div>
				) : splitPane && navigator ? (
					<QuizReadingSplitLayout
						passage={view.detail.passage}
						navigator={navigator}
						fillParent
					>
						<div className="mx-auto w-full max-w-[720px]">
							<QuizPaper
								detail={view.detail}
								parts={view.parts}
								answers={answers}
								onAnswer={handleAnswer}
								currentQuestion={currentQuestion}
								hidePassage
							/>
						</div>
					</QuizReadingSplitLayout>
				) : (
					<>
						<main className="mx-auto w-full max-w-[720px] flex-1 px-4 py-6">
							<QuizPaper
								detail={view.detail}
								parts={view.parts}
								answers={answers}
								onAnswer={handleAnswer}
								currentQuestion={currentQuestion}
							/>
						</main>
						{navigator}
					</>
				)}
			</div>
		</div>
	);
}
