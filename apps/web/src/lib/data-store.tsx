/**
 * Shim — 26 files import the store from here. The implementation moved to
 * data-provider (kernel-backed) in Wave 0; re-export to keep imports stable.
 */

export type { Action } from "./data-actions";
export { DataProvider, useData } from "./data-provider";
