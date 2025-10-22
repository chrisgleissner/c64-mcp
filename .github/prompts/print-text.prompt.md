---
description: Print text to Commodore or Epson printers template
mode: agent
---

<!-- id: print_text -->
<!-- keywords: print, printer, device 4, epson, commodore -->

Goal: Print strings on device 4.
Steps:
1. Choose the target: `commodore` or `epson`.
2. Generate BASIC that opens the device and prints using PRINT# on the selected channel.
3. Optionally add a form feed and close channels when finished.
