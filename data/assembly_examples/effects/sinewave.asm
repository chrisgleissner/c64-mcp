        *= $0801
        LDA #$00
LOOP    STA $D020
        ADC #$01
        JMP LOOP
