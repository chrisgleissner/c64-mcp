; hello_world_prg.asm
; Single-file PRG layout:
; - Tokenized one-line BASIC at $0801: 10 SYS 4096
; - Machine code placed at $1000 which writes the message directly to screen RAM ($0400)
;   (no KERNAL CHROUT or BASIC printing is used)

        .org $0801
        ; next-line pointer (little-endian) -> $080C (start + line length)
        .byte $0C, $08
        ; line number 10
        .byte $0A, $00
        ; tokenized content: SYS (0x9E), space (0x20), '4','0','9','6' (ASCII/PETSCII digits)
        .byte $9E, $20, $34, $30, $39, $36
        ; line terminator
        .byte $00
        ; program end marker (two zero bytes)
        .byte $00, $00

        ; -- machine code at $1000 ------------------------------------------------
        .org $1000
start:
        ldx #$00            ; X = 0
write_loop:
        lda message, x      ; load byte from message
        beq done            ; zero terminator -> finished
        sta $0400, x        ; write character to screen RAM (fast direct write)
        inx
        jmp write_loop

done:
        rts

message:
        ; ASCII bytes for: HELLO, WORLD!  (0-terminated)
        ; VIC-II screen codes for: HELLO, WORLD! (screen codes from data/graphics/character-set.csv)
        ; H E  L  L  O   ,    <space> W  O  R  L  D  !
        .byte $08, $05, $0C, $0C, $0F, $2C, $20, $17, $0F, $12, $0C, $04, $21, $00

        ; End of file
