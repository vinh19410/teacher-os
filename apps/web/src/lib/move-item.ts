/** Swap `list[index]` with its neighbor in `dir`. Out-of-range is a no-op. */
export function moveItem<T>(list: T[], index: number, dir: -1 | 1): T[] {
	const next = index + dir;
	if (index < 0 || next < 0 || index >= list.length || next >= list.length) {
		return list;
	}
	const copy = list.slice();
	const [item] = copy.splice(index, 1);
	if (item === undefined) return list;
	copy.splice(next, 0, item);
	return copy;
}
