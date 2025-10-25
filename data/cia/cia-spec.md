# Commodore 64 CIA Specification

## Overview

**Chips:** 2× MOS 6526 / 6526A / 8521  
**Roles:** CIA1 ($DC00–$DCFF) handles keyboard, joystick, paddles, lightpen, IRQ.  
CIA2 ($DD00–$DDFF) handles serial bus, RS-232, VIC memory bank select, NMI.  
**Clock:** 1 MHz (6526), 2 MHz (6526A).  
**Mirroring:** Each 16-byte register block repeats to $xxFF.  
**Electrical:** Open collector w/ pull-ups, CMOS-compatible, 2 TTL inputs.  
**Core units:**  

- 2× 8-bit I/O ports (PA/PB)  
- 2× 16-bit timers (A/B)  
- 1× Time-of-Day (TOD) clock + alarm (BCD)  
- 1× Serial shift register (SDR)  
- Interrupt control (ICR) via /IRQ (CIA1) or /NMI (CIA2)

---

## CIA #1 @ $DC00–$DC0F — Keyboard / Joystick / Paddles / Lightpen / IRQ

| Addr | Reg | Bits | Function |
|------|------|------|-----------|
| $DC00 | **PRA** |7–0| Keyboard column write / read; bit 7–6 paddle mux (01 = Port A, 10 = Port B); bit 4 joy A fire (1 = fire); bits 3–2 paddle fires; bits 3–0 joy A direction (0–15).|
| $DC01 | **PRB** |7–0| Keyboard row read; bit 7 Timer B pulse/toggle; bit 6 Timer A pulse/toggle; bit 4 joy 1 fire (1 = fire); bits 3–2 paddle fires; bits 3–0 joy 1 direction.|
| $DC02 | **DDRA** | | Data direction A (0 = input, 1 = output). |
| $DC03 | **DDRB** | | Data direction B. |
| $DC04 | **TALO** | | Timer A low byte (latch write / counter read). |
| $DC05 | **TAHI** | | Timer A high byte (latch write / counter read; reload if stopped). |
| $DC06 | **TBLO** | | Timer B low byte. |
| $DC07 | **TBHI** | | Timer B high byte. |
| $DC08 | **TOD10TH** | | TOD 1/10 s BCD (0–9). Write sets time if CRB7 = 0, alarm if = 1. |
| $DC09 | **TODSEC** | | Seconds BCD (0–59). |
| $DC0A | **TODMIN** | | Minutes BCD (0–59). |
| $DC0B | **TODHR** | | Hours BCD + bit 7 AM/PM (0=AM, 1=PM). Write halts TOD until $DC08 read. |
| $DC0C | **SDR** | | Serial I/O buffer. Shift on CNT rising edge via SP. |
| $DC0D | **ICR** |7| IRQ flag (1 = IRQ occurred) / set-clear mask flag. R: b0 TA UF, b1 TB UF, b2 TOD alarm, b3 serial, b4 FLAG1 (cassette/SRQ in). W: mask bits 0–4; b7 = 1 set mask, 0 clear.|
| $DC0E | **CRA** |7| TOD freq (1 = 50 Hz, 0 = 60 Hz); b6 SDR mode (1 out, 0 in); b5 count source (1 CNT, 0 Φ2); b4 force load; b3 run mode (1 one-shot, 0 cont.); b2 PB6 mode (1 toggle, 0 pulse); b1 PB6 enable (1 yes); b0 start (1)/stop (0).|
| $DC0F | **CRB** |7| Set alarm/TOD (1 alarm, 0 clock); b6–5 Timer B mode: 00 Φ2, 01 CNT, 10 TA UF, 11 TA UF while CNT high; b4–0 same as CRA. |

**IRQ output:** Active low on CPU /IRQ.

---

## CIA #2 @ $DD00–$DD0F — Serial Bus / RS-232 / VIC Bank / NMI

| Addr | Reg | Bits | Function |
|------|------|------|-----------|
| $DD00 | **PRA** |7| Serial bus DATA in; 6 CLOCK in; 5 DATA out; 4 CLOCK out; 3 ATN out; 2 RS-232 TXD (user PA2); 1–0 VIC bank select (00=$C000–FFFF, 01=$8000–BFFF, 10=$4000–7FFF, 11=$0000–3FFF, default=11).|
| $DD01 | **PRB** |7| DSR; 6 CTS; 5 user; 4 DCD; 3 RI; 2 DTR; 1 RTS; 0 RXD (user PB0–7).|
| $DD02 | **DDRA** | | Data direction A. |
| $DD03 | **DDRB** | | Data direction B. |
| $DD04 | **TALO** | | Timer A low byte. |
| $DD05 | **TAHI** | | Timer A high byte. |
| $DD06 | **TBLO** | | Timer B low byte. |
| $DD07 | **TBHI** | | Timer B high byte. |
| $DD08 | **TOD10TH** | | TOD 1/10 s BCD. |
| $DD09 | **TODSEC** | | TOD seconds BCD. |
| $DD0A | **TODMIN** | | TOD minutes BCD. |
| $DD0B | **TODHR** | | TOD hours BCD + AM/PM flag. |
| $DD0C | **SDR** | | Serial I/O buffer. |
| $DD0D | **ICR** |7| NMI flag (1 = NMI occurred) / mask set-clear; R: b0 TA UF, b1 TB UF, b3 serial, b4 FLAG1 (RS-232 data input); W: mask bits 0–4; b7 set/clear as for CIA1.|
| $DD0E | **CRA** | | Same as CIA1 ($DC0E). |
| $DD0F | **CRB** | | Same as CIA1 ($DC0F). |

**NMI output:** Active low on CPU /NMI.

---

## Timer Operation

- **16-bit down-counters** (latch + counter).  
- **Load:** Write low then high; CRA/CRB b4 forces load. Start also loads.  
- **Clock source:** Φ2 (1 MHz) or CNT; Timer B can count Timer A underflows (see modes).  
- **Underflow actions:** Set ICR bit, assert IRQ/NMI, pulse or toggle PB6/PB7 as per CRA/CRB b2; auto-reload unless one-shot (b3 = 1).  
- **Readback:** Counter values latched on read sequence.  

---

## Time-of-Day Clock

- **Registers:** $08–$0B (BCD: 1/10 s, sec, min, hr + AM/PM).  
- **Write target:** CRB7=0 → set time, =1 → set alarm.  
- **Stop/Resume:** Writing TODHR halts clock until TOD10TH read.  
- **Frequency:** CRA7 = 0 → 60 Hz, 1 → 50 Hz.  
- **Alarm match:** Sets ICR bit 2.  

---

## Serial I/O (SDR / SP / CNT)

- **Shift direction:** CRA6 (0 in, 1 out).  
- **Clock:** CNT rising edges at ≈ 1 MHz/2 MHz.  
- **SP:** Data line bidirectional.  
- **ICR bit 3:** Set when byte transfer complete.  

---

## Interrupt Logic

- **Sources:** TA UF, TB UF, TOD alarm, serial byte done, FLAG edge.  
- **Mask write:** b7=1 set bits 0–4, b7=0 clear bits 0–4.  
- **Read:** Returns active flags + b7=1 if any set (mask AND source). Read clears.  

---

## Pinout (Simplified Logical)

PA0–7, PB0–7 (Parallel I/O); /PC (Handshake pulse PB access); TOD (50/60 Hz in); SP (Serial Data); CNT (Serial/Timer clock); /IRQ (CIA1) / /NMI (CIA2); /FLAG (Neg-edge in); RS0–3 (Reg select); DB0–7 (Data bus); R/W; /CS; /RES; Φ2; Vcc; Vss.  

---

## Failure Indicators

- **CIA1:** No keyboard/joystick/cursor; random chars; hot chip; blank screen if shorted.  
- **CIA2:** No serial/user port; drive “File not found”; block chars on boot; cart still works.  

---

## Provenance

Integrated from:  

- *C64 Programmer’s Reference Guide* (pp. 322–325)  
- *MOS 6526 Datasheet*  
- *C64-Wiki Hardware Reference*  
