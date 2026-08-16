import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";

const PHONE_RE = /^[0-9\s+]*$/;

export function AddStudentModal({
	open,
	onClose,
	classId,
}: {
	open: boolean;
	onClose: () => void;
	classId?: string;
}) {
	const { dispatch } = useData();
	const [name, setName] = useState("");
	const [phone, setPhone] = useState("");
	const [parentName, setParentName] = useState("");
	const [total, setTotal] = useState("10");
	const [price, setPrice] = useState("400000");
	const [mode, setMode] = useState<"Online" | "Offline">("Online");
	const [nameError, setNameError] = useState<string | undefined>();
	const [phoneError, setPhoneError] = useState<string | undefined>();

	function submit(e: FormEvent) {
		e.preventDefault();
		const trimmedName = name.trim();
		const hasNameError = !trimmedName;
		const hasPhoneError = phone !== "" && !PHONE_RE.test(phone);
		setNameError(hasNameError ? "Vui lòng nhập tên học viên." : undefined);
		setPhoneError(
			hasPhoneError ? "SĐT chỉ gồm chữ số, khoảng trắng và dấu +." : undefined,
		);
		if (hasNameError || hasPhoneError) return;
		dispatch({
			type: "add-student",
			payload: {
				name: trimmedName,
				phone,
				parentName,
				total: Number.parseInt(total, 10) || 10,
				price: Number.parseInt(price, 10) || 400000,
				mode,
				classId,
			},
		});
		setName("");
		setPhone("");
		setParentName("");
		setTotal("10");
		setPrice("400000");
		setMode("Online");
		setNameError(undefined);
		setPhoneError(undefined);
		onClose();
	}

	return (
		<Modal open={open} onClose={onClose} title="Thêm học viên mới">
			<form onSubmit={submit}>
				<Field label="Họ tên học viên *" error={nameError}>
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Nguyễn Văn A"
					/>
				</Field>
				<Field
					label="SĐT / Zalo"
					error={phoneError}
					help="Chỉ số và khoảng trắng, VD: 09xx xxx xxx"
				>
					<Input
						value={phone}
						onChange={(e) => setPhone(e.target.value)}
						placeholder="09xx xxx xxx"
						inputMode="tel"
					/>
				</Field>
				<Field label="Phụ huynh (nếu có)">
					<Input
						value={parentName}
						onChange={(e) => setParentName(e.target.value)}
						placeholder="Tên phụ huynh"
					/>
				</Field>
				<div className="grid grid-cols-2 gap-5 max-app:grid-cols-1">
					<Field label="Số buổi gói">
						<Input
							type="number"
							value={total}
							onChange={(e) => setTotal(e.target.value)}
						/>
					</Field>
					<Field label="Đơn giá (VND)">
						<Input
							type="number"
							value={price}
							onChange={(e) => setPrice(e.target.value)}
						/>
					</Field>
				</div>
				<Field label="Hình thức">
					<Select
						value={mode}
						onChange={(e) => setMode(e.target.value as "Online" | "Offline")}
					>
						<option>Online</option>
						<option>Offline</option>
					</Select>
				</Field>
				<div className="flex justify-end gap-2 border-line-soft border-t border-solid pt-4">
					<Button variant="secondary" size="sm" onClick={onClose}>
						Hủy
					</Button>
					<Button type="submit" size="sm">
						Lưu
					</Button>
				</div>
			</form>
		</Modal>
	);
}
