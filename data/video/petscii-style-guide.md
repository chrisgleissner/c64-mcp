# PETSCII Style Guide

Colour presets and character codes for C64 PETSCII art. Target: LLM optimization.

## C64 Colour Palette (0-15)

| Index | Name | Luminance | Common Use |
|-------|------|-----------|------------|
| 0 | Black | Low | Background, shadows |
| 1 | White | High | Text, highlights |
| 2 | Red | Medium | Accents |
| 3 | Cyan | High | Water, sky |
| 4 | Purple | Medium | Decorative |
| 5 | Green | Medium | Nature |
| 6 | Blue | Low | Sky, UI |
| 7 | Yellow | High | Highlights |
| 8 | Orange | Medium | Warm tones |
| 9 | Brown | Low | Earth |
| 10 | Light Red | Medium | Soft accents |
| 11 | Dark Grey | Low | Depth |
| 12 | Grey | Medium | Neutral |
| 13 | Light Green | High | Nature highlights |
| 14 | Light Blue | Medium | UI |
| 15 | Light Grey | Medium | Borders |

## Recommended Colour Presets

| Preset | Border | Background | Foreground | Use Case |
|--------|--------|------------|------------|----------|
| High Contrast | 0 | 0 | 1 | Text, menus, maximum readability |
| Green Terminal | 0 | 0 | 5 | Retro terminal aesthetic |
| Ocean | 6 | 6 | 3 | Water scenes |
| Sunset | 2 | 8 | 7 | Warm scenes |
| Nature | 5 | 0 | 13 | Outdoor, forest |
| Professional UI | 6 | 0 | 14 | Applications, tools |

## Contrast Guidelines

- High contrast: Luminance difference >2 levels (0/1, 6/7, 0/13)
- Avoid: Grey(12) on Light Grey(15), similar hues (2 on 4)
- Border matching: Set border=background for seamless look

## PETSCII vs Screen Codes

**PETSCII codes** ($00-$FF): Used in BASIC strings, CHR$(), keyboard input, PRINT statements
**Screen codes** ($00-$FF): Values directly written to screen memory ($0400-$07E7)

Conversion: Screen code ≠ PETSCII code. Use charset reference (c64://specs/charset) for mapping.

**Usage**:
- BASIC/printing: Use PETSCII codes with CHR$() or PRINT
- Direct screen memory: Use screen codes with POKE to $0400+offset
- Tools: `create_petscii_image` returns both `petsciiCodes` array and screen memory data

## Essential PETSCII Symbols

| PETSCII | Char | Name | Use |
|---------|------|------|-----|
| 32 | (space) | Space | Empty cell |
| 160 | █ | Full block | Solid fill |
| 65-90 | A-Z | Uppercase | Text |
| 193-218 | a-z | Lowercase | Text (shifted mode) |
| 48-57 | 0-9 | Digits | Numbers |
| 83 | ♥ | Heart | Decoration, life |
| 90 | ♦ | Diamond | Suit, decoration |
| 88 | ♣ | Club | Suit, decoration |
| 65 | ♠ | Spade | Suit, decoration |
| 94 | ↑ | Up arrow | Direction, pointer |
| 95 | ← | Left arrow | Direction |
| 64 | ─ | Horizontal line | Borders, dividers |
| 93 | │ | Vertical line | Borders |
| 85 | ╭ | Arc top-left | Rounded corners |
| 73 | ╮ | Arc top-right | Rounded corners |
| 74 | ╰ | Arc bottom-left | Rounded corners |
| 75 | ╯ | Arc bottom-right | Rounded corners |
| 91 | ┼ | Cross | Grid intersection |
| 66-82 | Various | Block fractions | Dithering, gradients |

## Tool Integration

```javascript
create_petscii_image({
  prompt: "cat",
  borderColor: 0,
  backgroundColor: 6,
  foregroundColor: 1
})
```

Returns: `petsciiCodes[]`, `bitmapHex`, `rowHex`, `program`, dimensions

## Related Resources

- `c64://specs/charset` - Full PETSCII/screen code mappings
- `c64://specs/vic` - VIC-II registers, colour RAM
- `c64://specs/basic` - BASIC screen commands
