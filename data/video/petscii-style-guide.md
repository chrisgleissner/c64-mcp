# PETSCII Style Guide and Presets

This guide provides recommended colour combinations and style presets for creating readable and artistic PETSCII art on the Commodore 64.

## Colour Palette Reference

The C64 has 16 colours (0-15):

| Index | Name | Usage |
|-------|------|-------|
| 0 | Black | Background, shadows |
| 1 | White | Text, highlights |
| 2 | Red | Accents, warnings |
| 3 | Cyan | Water, sky |
| 4 | Purple | Decorative |
| 5 | Green | Nature, success |
| 6 | Blue | Sky, water, UI elements |
| 7 | Yellow | Highlights, sun |
| 8 | Orange | Warm tones |
| 9 | Brown | Earth tones |
| 10 | Light Red | Soft accents |
| 11 | Dark Grey | Shadows, depth |
| 12 | Grey | Neutral elements |
| 13 | Light Green | Nature highlights |
| 14 | Light Blue | Soft sky, water |
| 15 | Light Grey | UI elements, borders |

## Recommended Presets

### High Contrast (Readable Text)
**Best for**: Text displays, menus, data entry

- borderColor: 0 (Black)
- backgroundColor: 0 (Black)
- foregroundColor: 1 (White)

This classic combination provides maximum readability for text-heavy screens.

### Retro Terminal (Green Screen)
**Best for**: Retro computing aesthetics, terminal emulation

- borderColor: 0 (Black)
- backgroundColor: 0 (Black)
- foregroundColor: 5 (Green)

Mimics classic monochrome green terminals.

### Ocean Theme
**Best for**: Water scenes, cool aesthetics

- borderColor: 6 (Blue)
- backgroundColor: 6 (Blue)
- foregroundColor: 3 (Cyan)

Creates a cohesive water/ocean theme.

### Sunset/Warm
**Best for**: Warm scenes, inviting displays

- borderColor: 2 (Red)
- backgroundColor: 8 (Orange)
- foregroundColor: 7 (Yellow)

Provides warm, inviting colour scheme.

### Nature/Forest
**Best for**: Outdoor scenes, organic themes

- borderColor: 5 (Green)
- backgroundColor: 0 (Black)
- foregroundColor: 13 (Light Green)

Good for nature and forest scenes.

### Professional UI
**Best for**: Applications, professional tools

- borderColor: 6 (Blue)
- backgroundColor: 0 (Black)
- foregroundColor: 14 (Light Blue)

Modern, professional appearance for UI elements.

## Contrast and Readability Tips

1. **High Contrast**: Use colours with large luminance differences (e.g., black/white, blue/yellow)
2. **Avoid Similar Colours**: Don't use Grey (12) on Light Grey (15) - insufficient contrast
3. **Border Matching**: Set borderColor to match backgroundColor for seamless appearance
4. **Colour Clash**: Avoid Red (2) on Purple (4) or similar hue combinations that clash

## Dithering and Patterns

When working with PETSCII art:

- Use alternating characters for dithering effects
- Combine block graphics characters (codes 160-191) for solid fills
- Mix regular and reverse characters for texture
- Leverage the character set's built-in patterns

## Character Selection

### Text Characters
- Standard ASCII: codes 65-90 (A-Z), 97-122 (a-z)
- Numbers: codes 48-57 (0-9)
- Symbols: various codes 32-64, 91-96, 123-127

### Block Graphics
- Full block: code 160
- Half blocks: codes 161-191
- Quarter blocks: various combinations
- Lines and corners: codes 192-223

### Special Graphics
- Hearts, diamonds, clubs, spades: codes 83-90 (shifted)
- Custom patterns: codes 91-127
- Inverse characters: codes 128-255

## Best Practices

1. **Test on Real Hardware**: PAL/NTSC differences affect colour appearance
2. **Consider Borders**: Border colour frames your art - use it intentionally
3. **Limit Palette**: Using 3-4 colours creates cohesive designs
4. **Character Density**: Balance solid and sparse areas for visual interest
5. **Screen Limits**: Remember the 40×25 character grid limitation

## Tool Integration

When using `create_petscii_image`:

```javascript
{
  prompt: "cat",
  borderColor: 0,        // Black border
  backgroundColor: 6,    // Blue background
  foregroundColor: 1     // White foreground
}
```

## Related Resources

- `c64://specs/charset` - Complete character code reference
- `c64://specs/vic` - VIC-II colour and screen control
- `c64://specs/basic` - BASIC commands for screen manipulation
