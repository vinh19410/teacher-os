import type { CreditWallet } from "@teacher-os/api/contracts";
import { CREDIT_COSTS } from "@teacher-os/api/contracts";
import { Badge } from "@/components/ui/badge";

/**
 * Huy hiệu chi phí Nhập đề AI (phase-03, wireframe `ai-exam-import-workspace`):
 * giá dịch vụ + số dư ví. Số dư do route load từ GET /api/credits/wallet và
 * fetch lại sau khi job hoàn tất — component chỉ hiển thị, không tự fetch.
 */
export function CreditCostBadge({ wallet }: { wallet: CreditWallet | null }) {
	return (
		<div
			data-testid="credit-cost-badge"
			className="flex flex-wrap items-center gap-2"
		>
			<Badge variant="secondary">
				Chi phí: {CREDIT_COSTS.examImport} Credit (Tạm giữ)
			</Badge>
			{wallet ? (
				<Badge variant="outline" className="tabular-nums">
					Ví:{" "}
					<span data-testid="wallet-balance" className="tabular-nums">
						{wallet.balance} Cr
					</span>
				</Badge>
			) : (
				<Badge variant="outline">Ví: …</Badge>
			)}
		</div>
	);
}
