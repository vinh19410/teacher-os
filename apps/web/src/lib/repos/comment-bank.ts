import type { KernelSnapshot } from "@teacher-os/api/contracts";
import type { CommentBankItem } from "@/lib/mock-data";

export function mapCommentBank(snapshot: KernelSnapshot): CommentBankItem[] {
	return snapshot.commentBank.map((row) => ({ ...row }));
}
