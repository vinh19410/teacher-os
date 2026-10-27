import { useNavigate } from "@tanstack/react-router";
import {
	EXAM_IMPORT_ERROR_CODES,
	EXAM_IMPORT_ERROR_MESSAGES,
} from "@teacher-os/api/contracts";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

/**
 * Hộp thoại hết Credit E-001 (TOS-27 D5): POST trả 402 → modal với thông
 * điệp nguyên văn spec; nút "Soạn đề thủ công" về màn soạn đề (luồng mua
 * gói/Top-up chưa có — TOS-43 bổ sung sau). Thông điệp là contract e2e.
 */
export function InsufficientCreditsDialog({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const navigate = useNavigate();
	return (
		<Modal
			open={open}
			onClose={onClose}
			title="Không đủ Credit"
			footer={
				<>
					<Button
						type="button"
						variant="ghost"
						data-testid="exam-import-insufficient-close"
						onClick={onClose}
					>
						Đóng
					</Button>
					<Button
						type="button"
						data-testid="exam-import-manual"
						onClick={() => navigate({ to: "/assignments/tests/new" })}
					>
						Soạn đề thủ công
					</Button>
				</>
			}
		>
			<p data-testid="exam-import-insufficient-credits" className="text-sm">
				{
					EXAM_IMPORT_ERROR_MESSAGES[
						EXAM_IMPORT_ERROR_CODES.INSUFFICIENT_CREDITS
					]
				}
			</p>
		</Modal>
	);
}
