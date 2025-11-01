/*
C64 Bridge - An MCP Server for the Commodore 64 Ultimate
Copyright (C) 2025 Christian Gleissner

Licensed under the GNU General Public License v2.0 or later.
See <https://www.gnu.org/licenses/> for details.
*/
const PETSCII_TO_ASCII = {
    0x00: " ",
    0x07: "\u0007",
    0x0d: "\n",
    0x11: "\n",
    0x8d: "\n",
    0xa0: " ",
};
function petsciiByteToChar(byte) {
    if (PETSCII_TO_ASCII[byte]) {
        return PETSCII_TO_ASCII[byte];
    }
    if (byte >= 0x20 && byte <= 0x7e) {
        return String.fromCharCode(byte);
    }
    if (byte >= 0xc1 && byte <= 0xda) {
        return String.fromCharCode(byte - 0x80);
    }
    if (byte >= 0x41 && byte <= 0x5a) {
        return String.fromCharCode(byte);
    }
    return " ";
}
export function petsciiToAscii(bytes) {
    return Array.from(bytes)
        .map(petsciiByteToChar)
        .join("");
}
/**
 * Minimal ASCII→PETSCII mapping used by the encoder.
 * For now we pass through printable ASCII and a handful of control codes.
 */
export function asciiToPetscii(char) {
    if (char.length !== 1) {
        throw new Error("Expected a single character");
    }
    const code = char.charCodeAt(0);
    if (code < 0 || code > 255) {
        throw new Error(`Character out of PETSCII range: ${char}`);
    }
    return code;
}
/** Named PETSCII and control codes that are commonly used on the C64. */
const NAMED_CHARS = Object.freeze({
    // Control characters (BASIC CHR$ values)
    "clear": 147, // CLR/HOME (clears screen)
    "clr": 147,
    "home": 19,
    "bell": 7,
    "beep": 7,
    "newline": 13,
    "return": 13,
    "cr": 13,
    "lf": 10,
    "reverse_on": 18,
    "rvon": 18,
    "reverse_off": 146,
    "rvoff": 146,
    "cursor_up": 145,
    "cursor_down": 17,
    "cursor_right": 29,
    "cursor_left": 157,
    // Graphic glyphs (commonly referenced by name)
    // Note: Exact byte shown on screen depends on mode; these are PETSCII/CHR$ values
    "heart": 81, // widely used PETSCII code for heart glyph
    "up_arrow": 94,
    "uparrow": 94,
    "left_arrow": 95,
    "leftarrow": 95,
    "pi": 222,
});
export function listNamedPetscii() {
    return Object.entries(NAMED_CHARS)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, code]) => ({ name, code, hex: `$${code.toString(16).toUpperCase().padStart(2, "0")}` }));
}
export function lookupNamedPetscii(name) {
    const key = name.trim().toLowerCase().replace(/\s+/g, "_");
    return NAMED_CHARS[key];
}
/**
 * Try to parse a named character token starting at the given index.
 * Supported forms: {name}, :name:, <name>
 * Returns the PETSCII code and index of the first character AFTER the token
 * when matched, otherwise null.
 */
export function parseNamedCharToken(source, startIndex) {
    const open = source[startIndex];
    if (open !== "{" && open !== ":" && open !== "<") {
        return null;
    }
    const close = open === "{" ? "}" : open === ":" ? ":" : ">";
    let idx = startIndex + 1;
    let name = "";
    while (idx < source.length && source[idx] !== close) {
        name += source[idx]
            .replace(/[^A-Za-z0-9_\s-]/g, "") // restrict to sane name characters
            .trim();
        idx += 1;
    }
    if (idx >= source.length || source[idx] !== close) {
        return null;
    }
    const value = lookupNamedPetscii(name.replace(/[-\s]+/g, "_"));
    if (value === undefined) {
        return null;
    }
    return { value, endIndex: idx + 1 };
}
/**
 * Encode a text containing optional named tokens into PETSCII bytes.
 * Named tokens may appear as {heart}, :heart:, or <heart>.
 */
export function encodeStringWithNames(input) {
    const bytes = [];
    let i = 0;
    while (i < input.length) {
        const maybe = parseNamedCharToken(input, i);
        if (maybe) {
            bytes.push(maybe.value & 0xff);
            i = maybe.endIndex;
            continue;
        }
        bytes.push(asciiToPetscii(input[i]));
        i += 1;
    }
    return Uint8Array.from(bytes);
}
