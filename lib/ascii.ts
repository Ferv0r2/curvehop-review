/**
 * ASCII-only lowercase that keeps every index: `toLowerCase()` can change a
 * string's length ("İ" becomes two code units), so offsets found in its result
 * are wrong on the original. Searches for ASCII markup ("<script", "</a>")
 * use this copy, which matches what an `/i` regex did for ASCII patterns.
 */
export const asciiLower = (text: string) => text.replace(/[A-Z]+/g, run => run.toLowerCase());
