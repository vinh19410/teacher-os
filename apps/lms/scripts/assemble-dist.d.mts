export interface AssemblePortalDistsOptions {
	lmsOutDir?: string;
	repoRoot?: string;
	rebuildPortals?: boolean;
}

export declare const PORTAL_MOUNTS: ReadonlyArray<{
	pkg: string;
	mount: string;
}>;

export declare function assemblePortalDists(
	options?: AssemblePortalDistsOptions,
): void;
