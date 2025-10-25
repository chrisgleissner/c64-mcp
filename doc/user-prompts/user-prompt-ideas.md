# Example LLM Prompts for C64 MCP Server

These example prompts illustrate what a user can ask the MCP server to perform on a real or emulated Commodore 64.
The MCP bridges the user’s intent with direct program generation, execution, or device control.

---

## 🧠 General Interaction

- "Show me the current C64 system state."
- "Reset the C64 and verify that BASIC is ready."
- "List all mounted disk images."
- "Mount the disk `games.d64` and list its directory."
- "Save the current memory to `snapshot.bin`."
- "Restore RAM from `snapshot.bin` and continue execution."
- "Transfer and run the program `demo.prg`."
- "Print the current screen output as text."
- "Show me the registers of CIA 1 and CIA 2."
- "Pause execution and dump memory from `$0800` to `$0FFF`."

---

## 💾 Memory and System Control

- "Read 32 bytes starting at `$C000`."
- "Write the value `$A9` to address `$C000`."
- "Fill memory from `$0400` to `$07E7` with `$20` (space)."
- "Dump the zero page as a hex table."
- "Freeze the CPU, modify `$D020` to `$06`, and resume."
- "Trigger a soft reset."
- "Hard reset the C64 and reload `boot.prg`."

---

## 💡 BASIC Programming

- "Create a BASIC program that prints 'HELLO WORLD' in the center of the screen."
- "Generate a BASIC listing for a bouncing ball animation."
- "Convert this text into a valid BASIC tokenized PRG:"
  
  ```basic
  10 PRINT "READY."
  20 GOTO 10
  ```

- "List all BASIC variables after program execution."
- "Run the currently loaded BASIC program and capture its output."
- "Save the BASIC program as `HELLO.PRG` to disk."
- "Show the BASIC memory map and string descriptors."

---

## ⚙️ Assembly Programming

- "Assemble a short 6502 routine that changes the border colour every frame."
- "Inject this code into RAM at `$C000` and execute:"
  
  ```assembly
  LDA #$06
  STA $D020
  RTS
  ```

- "Assemble and run a raster interrupt that flashes the screen every 50 Hz."
- "Disassemble memory from `$C000` to `$C050`."
- "Step through 10 instructions and show registers after each step."
- "Assemble a SID music player routine at `$1000`."
- "Assemble and export a `.prg` file from this source."

---

## 🎵 SID Music Composition

- "Compose a short SID tune in the style of early Rob Hubbard."
- "Generate a 3-voice arpeggio sequence in C major, lasting 8 seconds."
- "Export this tune as `demo.sid`."
- "Play the current SID file through the C64 SID chip."
- "Visualize the waveform and envelope data for each voice."
- "Show which SID registers are used for filter modulation."

---

## 🎨 PETSCII Art and Graphics

- "Create a PETSCII logo reading 'C64 Bridge' with rainbow gradient."
- "Generate a PETSCII image of a spaceship using block characters."
- "Convert this PNG into PETSCII art compatible with C64 screen memory."
- "Preview the PETSCII output as text."
- "Export the artwork to `logo.seq` and `logo.prg`."
- "Display the PETSCII artwork on the screen."

---

## 🖨️ Printing and Document Generation

- "Print the current BASIC listing to a virtual printer."
- "Render a document header: 'Commodore 64 Report – 1984 Edition'."
- "Generate a formatted report of all memory changes in the last session."
- "Print the PETSCII artwork as a text file."
- "Export screen contents to PDF via MCP printer adapter."

---

## 🧩 Disk and File Management

- "Create a new disk image called `workbench.d64`."
- "Mount `music.d64` as drive 8."
- "List files on drive 8."
- "Delete the file `OLDGAME.PRG` from drive 8."
- "Copy `HELLO.PRG` to drive 9 as `HELLO2.PRG`."
- "Transfer file `game.prg` from local PC to drive 8."
- "Unmount all drives."

---

## 🧪 Testing and Diagnostics

- "Run a video sync test pattern."
- "Play a POP audio + frame sync signal for calibration."
- "Measure frame delay between video and audio."
- "Report VIC-II raster timing and SID voice status."
- "Check if the system is running at PAL or NTSC frequency."
- "Benchmark CPU speed using a short 1000-iteration loop."

---

## 🤖 Integrated AI Tasks

- "Generate a new BASIC game idea and create its program automatically."
- "Write assembly code that plays a melody while showing scrolling text."
- "Convert a SID file into BASIC DATA statements."
- "Explain what the program at `$0801` does."
- "Translate this assembly snippet into commented pseudocode."
- "Optimize this BASIC program for speed and memory."
- "Summarize the PETSCII image currently displayed."

---

## 📚 Meta Commands

- "Describe all capabilities of this MCP server."
- "List all available agents (BASIC, Assembly, SID, PETSCII, Disk)."
- "Explain how to connect an external tool (like VICE or Ultimate 64)."
- "Show examples of valid API calls for writing to memory."
- "Show recent system logs."
