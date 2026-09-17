/**
 * TanStack Form v1 keeps a per-cause errorMap entry until that exact cause
 * re-validates. The auth forms only validate onSubmit, so after one failed
 * submit the submit-cause errors linger after the user corrects the value,
 * `canSubmit` stays false forever, and handleSubmit() early-returns on it —
 * the #165 submit deadlock. Clearing the edited field's errorMap on every
 * change lets the next submit re-validate from a clean slate
 * (clear-error-on-edit); errors for untouched fields stay put.
 */
export function resetFieldErrors<TForm, TName extends string>(
	form: TForm & {
		getFieldMeta: (name: TName) => unknown;
		// `never` on the updater param keeps the structural constraint
		// contravariance-safe against FormApi's generic setFieldMeta; the one
		// cast below writes a full meta object, which Updater accepts.
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
