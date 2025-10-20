        *= $0801
        SEI
        LDA #$01
        STA $D015          ; enable sprite 0
        LDA #$00
        STA $D001          ; sprite 0 Y
        LDA #$18
        STA $D000          ; sprite 0 X
LOOP    INC $D000          ; move right
        LDA $D000
        CMP #$F0
        BNE LOOP
        LDA #$18
        STA $D000
        JMP LOOP
