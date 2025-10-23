## Printing Prompts and Routing

Use these prompt templates to decide the printer path and guide users.

### Routing rule
- If user does not specify printer: assume Commodore (MPS/PETSCII).
- If user specifies "Commodore" or "MPS": use Commodore docs and commands.
- If user specifies "Epson" or "FX": use Epson docs and ESC/P.
- If unknown printer: default to Commodore.

### Text printing prompt
"Print the following text on my [Commodore|Epson] printer: <text>. Ensure proper line endings and page eject."
- Commodore: call tool `print_text` with `{ text, formFeed: true }`.
- Epson: prepend ESC/P style if needed; still call `print_text` (text-only); for advanced mode changes, consult `printing-epson.md`.

### Bitmap/image printing prompt
"Print this bitmap on my [Commodore|Epson] printer at [density]." Provide data as columns (bytes) and desired repetitions.
- Commodore: build BIM sequence using `CHR$(8)` and optionally `CHR$(26);CHR$(n)` repeats. See `printing-commodore-bitmap.md`.
- Epson: choose `ESC K/L/Z/*` and compute `n,m` length; set line spacing with `ESC A`. See `printing-epson-bitmap.md`.

### Custom character prompt (Commodore only)
"Define custom characters via DLL on my real MPS-1230 and print <text>."
- Compute `m,n,c,s,a,p1..p11`; send `ESC '=' ...` sequence. Note: Ultimate‑II emulator ignores DLL.

### Safety checks
- Always close channel with `CLOSE1`.
- Add `FF` (form feed) at the end if a page eject is desired.
