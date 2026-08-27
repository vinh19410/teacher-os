import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";

export function AddInvoiceModal({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const { data } = useData();
	const [sid, setSid] = useState(data.students[0]?.id ?? "");
	const [type, setType] = useState("Gói buổi");
	const [amount, setAmount] = useState("");
	const [method, setMethod] = useState("Chuyển khoản");

	function submit(e: FormEvent) {
		e.preventDefault();
		// Export behavior: creating an invoice is a modal-only flow (no store
		// mutation); closing is the observable effect.
		onClose();
	}

	return (
		<Modal open={open} onClose={onClose} title="Tạo hóa đơn">
			<form onSubmit={submit}>
				<Field label="Học viên">
					<Select value={sid} onChange={(e) => setSid(e.target.value)}>
						{data.students.map((s) => (
							<option key={s.id} value={s.id}>
								{s.name}
							</option>
						))}
					</Select>
				</Field>
				<Field label="Loại">
					<Select value={type} onChange={(e) => setType(e.target.value)}>
						<option>Gói buổi</option>
						<option>Theo buổi</option>
						<option>Theo tháng</option>
					</Select>
				</Field>
				<Field label="Số tiền (VND)">
					<Input
						type="number"
						placeholder="400000"
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
					/>
				</Field>
				<Field label="Phương thức">
					<Select value={method} onChange={(e) => setMethod(e.target.value)}>
						<option>Chuyển khoản</option>
						<option>MoMo QR</option>
						<option>VNPay</option>
						<option>Tiền mặt</option>
					</Select>
				</Field>
				<div className="flex justify-end gap-2 border-line-soft border-t border-solid pt-4">
					<Button variant="secondary" size="sm" onClick={onClose}>
						Hủy
					</Button>
					<Button type="submit" size="sm">
						Tạo hóa đơn
					</Button>
				</div>
			</form>
		</Modal>
	);
}
