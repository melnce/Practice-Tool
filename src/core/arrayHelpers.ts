// src/core/arrayHelpers.ts
// Safe array access helpers for noUncheckedIndexedAccess compliance

/**
 * Safely get an element from an array, returning undefined if out of bounds.
 * Use when the element may not exist and you need to handle that case.
 */
export function atOrUndefined<T>(arr: T[], index: number): T | undefined {
    if (index < 0 || index >= arr.length) return undefined;
    return arr[index];
}

/**
 * Get an element from an array, throwing if it doesn't exist.
 * Use when the element MUST exist by invariant - failure indicates a bug.
 */
export function mustGet<T>(arr: T[], index: number, context?: string): T {
    if (index < 0 || index >= arr.length) {
        throw new Error(`mustGet: index ${index} out of bounds [0, ${arr.length}) ${context ? `in ${context}` : ""}`);
    }
    const val = arr[index];
    if (val === undefined) {
        throw new Error(`mustGet: element at index ${index} is undefined ${context ? `in ${context}` : ""}`);
    }
    return val;
}

/**
 * Assert that a value is present (not null/undefined).
 * Use at boundaries where invariants guarantee presence.
 */
export function assertPresent<T>(val: T | null | undefined, context?: string): T {
    if (val === null || val === undefined) {
        throw new Error(`assertPresent: value is ${val} ${context ? `in ${context}` : ""}`);
    }
    return val;
}

/**
 * Safely splice and return the first removed element, or undefined.
 */
export function spliceOne<T>(arr: T[], index: number): T | undefined {
    if (index < 0 || index >= arr.length) return undefined;
    return arr.splice(index, 1)[0];
}
