# SID Quick Reference (for RAG)

See `doc/sid-overview.md` for the full guide. This stub ensures the RAG index includes SID guidance.

- Base address: $D400
- Voice control: $D404/$D40B/$D412 (bits: NOISE PULSE SAW TRI TEST RING SYNC GATE)
- Play note: set FREQ LO/HI, PW LO/HI, AD, SR; set CTRL with waveform|GATE
- Stop note: clear GATE bit in CTRL
- Volume/filter: $D418 (bits 0..3 volume, 4..6 LP/BP/HP)
- Filter cutoff: $D415/$D416 (11 bits)
- Useful effects: arpeggio (rewrite FREQ), vibrato (modulate FREQ), PWM (modulate PW), filter sweeps ($D415/$D416)
