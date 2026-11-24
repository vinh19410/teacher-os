export function resetFieldErrors<TForm, TName extends string>(
	form: TForm & {
		getFieldMeta: (name: TName) => unknown;
		setFieldMeta: (name: TName, meta: never) => void;
	},
	name: TName,
) {
	const meta = form.getFieldMeta(name) as Record<string, unknown> | undefined;
	const setMeta = form.setFieldMeta as (
		name: TName,
		meta: Record<string, unknown>,
	) => void;
	setMeta(name, { ...meta, errors: [], errorMap: {} });
}
