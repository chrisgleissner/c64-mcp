import { Buffer } from "node:buffer";
import { createPetsciiArt, type Bitmap } from "../petsciiArt.js";
import { defineToolModule } from "./types.js";
import {
  booleanSchema,
  numberSchema,
  objectSchema,
  optionalSchema,
  stringSchema,
  type Schema,
} from "./schema.js";
import { jsonResult, textResult } from "./responses.js";
import {
  ToolError,
  ToolExecutionError,
  ToolValidationError,
  toolErrorResult,
  unknownErrorResult,
} from "./errors.js";

interface SpriteArgs extends Record<string, unknown> {
  sprite: Uint8Array;
  index: number;
  x: number;
  y: number;
  color: number;
  multicolour: boolean;
}

interface PetsciiImageArgs extends Record<string, unknown> {
  prompt?: string;
  text?: string;
  maxWidth?: number;
  maxHeight?: number;
  borderColor?: number;
  backgroundColor?: number;
  foregroundColor?: number;
  dryRun: boolean;
  bitmap?: Bitmap;
}

function toRecord(details: unknown): Record<string, unknown> | undefined {
  if (details && typeof details === "object") {
    return details as Record<string, unknown>;
  }
  return undefined;
}

function normaliseFailure(details: unknown): Record<string, unknown> | undefined {
  if (details === undefined || details === null) {
    return undefined;
  }
  if (typeof details === "object") {
    return details as Record<string, unknown>;
  }
  return { value: details };
}

function decodeSpriteString(value: string, path: string): Uint8Array {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ToolValidationError("Sprite string must not be empty", { path });
  }

  const collapsed = trimmed.replace(/\s+/g, "");
  const base64Pattern = /^(?:[A-Za-z0-9+\/_-]{4})*(?:[A-Za-z0-9+\/_-]{2}(?:==)?|[A-Za-z0-9+\/_-]{3}=)?$/;

  if (collapsed.length % 4 === 0 && base64Pattern.test(collapsed)) {
    try {
      const decoded = Buffer.from(collapsed.replace(/-/g, "+").replace(/_/g, "/"), "base64");
      if (decoded.length === 63) {
        return Uint8Array.from(decoded);
      }
    } catch {
      // Fallback to hex parsing below
    }
  }

  const withoutPrefix = collapsed.startsWith("$") ? collapsed.slice(1) : collapsed;
  const cleaned = withoutPrefix.replace(/[^0-9A-Fa-f]/g, "");
  if (cleaned.length !== 63 * 2) {
    throw new ToolValidationError("Sprite hex string must contain exactly 126 hex characters", { path });
  }
  try {
    return Uint8Array.from(Buffer.from(cleaned, "hex"));
  } catch (error) {
    throw new ToolValidationError("Unable to parse sprite hex string", { path, cause: error });
  }
}

const spriteBytesSchema: Schema<Uint8Array> = {
  jsonSchema: {
    description: "63-byte sprite definition provided as base64/hex string or array of bytes.",
    type: ["string", "array"],
    items: {
      type: "integer",
      minimum: 0,
      maximum: 255,
    },
    minItems: 63,
    maxItems: 63,
  },
  parse(value: unknown, path?: string): Uint8Array {
    const resolvedPath = path ?? "$";
    if (typeof value === "string") {
      return decodeSpriteString(value, resolvedPath);
    }
    if (Array.isArray(value)) {
      if (value.length !== 63) {
        throw new ToolValidationError("Sprite byte array must contain exactly 63 entries", { path: resolvedPath });
      }
      const bytes = new Uint8Array(63);
      for (let i = 0; i < value.length; i += 1) {
        const item = value[i];
        if (typeof item !== "number" || !Number.isFinite(item)) {
          throw new ToolValidationError("Sprite byte array must contain numbers", { path: `${resolvedPath}[${i}]` });
        }
        if (item < 0 || item > 255) {
          throw new ToolValidationError("Sprite byte values must be between 0 and 255", {
            path: `${resolvedPath}[${i}]`,
            details: { value: item },
          });
        }
        bytes[i] = item & 0xff;
      }
      return bytes;
    }
    throw new ToolValidationError("Sprite must be provided as a string or 63-byte array", { path: resolvedPath });
  },
};

const spriteArgsSchema = objectSchema<SpriteArgs>({
  description: "Generate a PRG that displays a single sprite using raw sprite data.",
  properties: {
    sprite: spriteBytesSchema,
    index: numberSchema({
      description: "Sprite index (0-7) to configure in screen memory.",
      integer: true,
      minimum: 0,
      maximum: 7,
      default: 0,
    }),
    x: numberSchema({
      description: "Sprite X position (0-511).",
      integer: true,
      minimum: 0,
      maximum: 511,
      default: 100,
    }),
    y: numberSchema({
      description: "Sprite Y position (0-255).",
      integer: true,
      minimum: 0,
      maximum: 255,
      default: 100,
    }),
    color: numberSchema({
      description: "Sprite colour index (0-15).",
      integer: true,
      minimum: 0,
      maximum: 15,
      default: 1,
    }),
    multicolour: booleanSchema({
      description: "Enable multicolour mode for the sprite.",
      default: false,
    }),
  },
  required: ["sprite"],
  additionalProperties: false,
});

const bitmapSchema: Schema<Bitmap> = {
  jsonSchema: {
    description: "Explicit bitmap definition for PETSCII rendering.",
    type: "object",
    properties: {
      width: { type: "integer", minimum: 1, maximum: 320 },
      height: { type: "integer", minimum: 1, maximum: 200 },
      pixels: {
        type: "array",
        items: { type: "integer", minimum: 0, maximum: 1 },
      },
    },
    required: ["width", "height", "pixels"],
    additionalProperties: false,
  },
  parse(value: unknown, path?: string): Bitmap {
    const resolvedPath = path ?? "$";
    if (!value || typeof value !== "object") {
      throw new ToolValidationError("Bitmap definition must be an object", { path: resolvedPath });
    }
    const input = value as Record<string, unknown>;
    const width = Number(input.width);
    const height = Number(input.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      throw new ToolValidationError("Bitmap width and height must be numbers", { path: resolvedPath });
    }
    if (width <= 0 || height <= 0 || width > 320 || height > 200) {
      throw new ToolValidationError("Bitmap dimensions must be within 1..320 x 1..200", { path: resolvedPath, details: { width, height } });
    }
    const pixels = input.pixels;
    if (!Array.isArray(pixels)) {
      throw new ToolValidationError("Bitmap pixels must be an array", { path: `${resolvedPath}.pixels` });
    }
    if (pixels.length !== width * height) {
      throw new ToolValidationError("Bitmap pixel array length must equal width*height", {
        path: `${resolvedPath}.pixels`,
        details: { expected: width * height, received: pixels.length },
      });
    }
    const out = new Uint8Array(width * height);
    for (let i = 0; i < pixels.length; i += 1) {
      const valueAt = pixels[i];
      if (typeof valueAt !== "number" || !Number.isFinite(valueAt)) {
        throw new ToolValidationError("Bitmap pixels must be numeric", { path: `${resolvedPath}.pixels[${i}]` });
      }
      out[i] = valueAt > 0 ? 1 : 0;
    }
    return { width, height, pixels: out };
  },
};

const petsciiImageArgsSchema = objectSchema<PetsciiImageArgs>({
  description: "Generate PETSCII art from text, prompts, or explicit bitmap data.",
  properties: {
    prompt: optionalSchema(stringSchema({
      description: "Natural language prompt describing the desired PETSCII art.",
      minLength: 1,
    })),
    text: optionalSchema(stringSchema({
      description: "Exact text to render in PETSCII (overrides prompt derivation).",
      minLength: 1,
    })),
    maxWidth: optionalSchema(numberSchema({
      description: "Maximum bitmap width in pixels (1-320).",
      integer: true,
      minimum: 1,
      maximum: 320,
    })),
    maxHeight: optionalSchema(numberSchema({
      description: "Maximum bitmap height in pixels (1-200).",
      integer: true,
      minimum: 1,
      maximum: 200,
    })),
    borderColor: optionalSchema(numberSchema({
      description: "Border colour index (0-15).",
      integer: true,
      minimum: 0,
      maximum: 15,
    })),
    backgroundColor: optionalSchema(numberSchema({
      description: "Background colour index (0-15).",
      integer: true,
      minimum: 0,
      maximum: 15,
    })),
    foregroundColor: optionalSchema(numberSchema({
      description: "Foreground colour index (0-15).",
      integer: true,
      minimum: 0,
      maximum: 15,
    })),
    dryRun: booleanSchema({
      description: "When true, skip uploading the BASIC program to the C64.",
      default: false,
    }),
    bitmap: optionalSchema(bitmapSchema),
  },
  additionalProperties: false,
});

const renderPetsciiScreenArgsSchema = objectSchema<{
  text: string;
  borderColor?: number;
  backgroundColor?: number;
}>({
  description: "Arguments for rendering PETSCII text on the main screen.",
  properties: {
    text: stringSchema({
      description: "The PETSCII text to print after clearing the screen.",
      minLength: 1,
    }),
    borderColor: optionalSchema(numberSchema({
      description: "Border colour index (0-15).",
      integer: true,
      minimum: 0,
      maximum: 15,
    })),
    backgroundColor: optionalSchema(numberSchema({
      description: "Background colour index (0-15).",
      integer: true,
      minimum: 0,
      maximum: 15,
    })),
  },
  required: ["text"],
  additionalProperties: false,
});

export const graphicsModule = defineToolModule({
  domain: "graphics",
  summary: "PETSCII art, sprite workflows, and VIC-II graphics helpers.",
  resources: [
    "c64://specs/vic",
    "c64://specs/assembly",
    "c64://specs/basic",
  ],
  prompts: ["graphics-demo", "basic-program", "assembly-program"],
  defaultTags: ["graphics", "vic"],
  tools: [
    {
      name: "generate_sprite_prg",
      description: "Generate and execute a PRG that displays a sprite from raw 63-byte data.",
      summary: "Uploads minimal machine code to copy sprite data, configure VIC-II, and render a sprite.",
      inputSchema: spriteArgsSchema.jsonSchema,
      relatedResources: ["c64://specs/vic"],
      relatedPrompts: ["graphics-demo", "assembly-program"],
      tags: ["sprite", "assembly"],
      async execute(args, ctx) {
        try {
          const parsed = spriteArgsSchema.parse(args ?? {});
          ctx.logger.info("Generating sprite PRG", {
            index: parsed.index,
            x: parsed.x,
            y: parsed.y,
            color: parsed.color,
            multicolour: parsed.multicolour,
          });

          const result = await ctx.client.generateAndRunSpritePrg({
            spriteBytes: parsed.sprite,
            spriteIndex: parsed.index,
            x: parsed.x,
            y: parsed.y,
            color: parsed.color,
            multicolour: parsed.multicolour,
          });

          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while running sprite PRG", {
              details: normaliseFailure(result.details),
            });
          }

          return textResult("Sprite PRG generated and executed successfully.", {
            success: true,
            index: parsed.index,
            x: parsed.x,
            y: parsed.y,
            color: parsed.color,
            multicolour: parsed.multicolour,
            spriteByteLength: parsed.sprite.length,
            details: toRecord(result.details) ?? null,
          });
        } catch (error) {
          if (error instanceof ToolError) {
            return toolErrorResult(error);
          }
          return unknownErrorResult(error);
        }
      },
    },
    {
      name: "render_petscii_screen",
      description: "Render PETSCII text to the screen with optional border/background colours.",
      summary: "Generates a BASIC program that clears the screen, sets colours, and prints text.",
      inputSchema: renderPetsciiScreenArgsSchema.jsonSchema,
      relatedResources: ["c64://specs/basic", "c64://context/bootstrap"],
      relatedPrompts: ["basic-program", "graphics-demo"],
      tags: ["basic", "screen"],
      async execute(args, ctx) {
        try {
          const parsed = renderPetsciiScreenArgsSchema.parse(args ?? {});
          ctx.logger.info("Rendering PETSCII screen", {
            textLength: parsed.text.length,
            borderColor: parsed.borderColor,
            backgroundColor: parsed.backgroundColor,
          });

          const result = await ctx.client.renderPetsciiScreenAndRun(parsed);
          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while rendering PETSCII text", {
              details: normaliseFailure(result.details),
            });
          }

          return textResult("PETSCII screen rendered successfully.", {
            success: true,
            textLength: parsed.text.length,
            borderColor: parsed.borderColor ?? null,
            backgroundColor: parsed.backgroundColor ?? null,
            details: toRecord(result.details) ?? null,
          });
        } catch (error) {
          if (error instanceof ToolError) {
            return toolErrorResult(error);
          }
          return unknownErrorResult(error);
        }
      },
    },
    {
      name: "create_petscii_image",
      description: "Create PETSCII art from prompts or text, optionally run it on the C64, and return metadata.",
      summary: "Synthesises PETSCII art, generates a BASIC program, and uploads it unless dry-run is requested.",
      inputSchema: petsciiImageArgsSchema.jsonSchema,
      relatedResources: ["c64://specs/basic", "c64://specs/vic"],
      relatedPrompts: ["graphics-demo", "basic-program"],
      tags: ["petscii", "basic"],
      async execute(args, ctx) {
        try {
          const parsed = petsciiImageArgsSchema.parse(args ?? {});
          if (!parsed.prompt && !parsed.text && !parsed.bitmap) {
            throw new ToolValidationError("Provide a prompt, text, or explicit bitmap definition", { path: "$.prompt" });
          }

          ctx.logger.info("Generating PETSCII art", {
            hasPrompt: Boolean(parsed.prompt),
            hasText: Boolean(parsed.text),
            dryRun: parsed.dryRun,
            hasBitmap: Boolean(parsed.bitmap),
            maxWidth: parsed.maxWidth,
            maxHeight: parsed.maxHeight,
          });

          const art = createPetsciiArt({
            prompt: parsed.prompt,
            text: parsed.text,
            maxWidth: parsed.maxWidth,
            maxHeight: parsed.maxHeight,
            borderColor: parsed.borderColor,
            backgroundColor: parsed.backgroundColor,
            foregroundColor: parsed.foregroundColor,
            bitmap: parsed.bitmap,
          });

          let runResult: { success: boolean; details?: unknown } | undefined;
          if (!parsed.dryRun) {
            runResult = await ctx.client.uploadAndRunBasic(art.program);
            if (!runResult.success) {
              throw new ToolExecutionError("C64 firmware reported failure while rendering PETSCII art", {
                details: normaliseFailure(runResult.details),
              });
            }
          }

          const ranOnC64 = !parsed.dryRun && Boolean(runResult?.success);
          const data = {
            success: parsed.dryRun ? true : Boolean(runResult?.success ?? true),
            ranOnC64,
            runDetails: runResult?.details ?? null,
            program: art.program,
            bitmapHex: art.bitmapHex,
            rowHex: art.rowHex,
            width: art.bitmap.width,
            height: art.bitmap.height,
            charColumns: art.charColumns,
            charRows: art.charRows,
            petsciiCodes: art.petsciiCodes,
            usedShape: art.usedShape ?? null,
            sourceText: art.sourceText ?? null,
            ragRefs: null,
          };

          return jsonResult(data, {
            ranOnC64,
            dryRun: parsed.dryRun,
            width: art.bitmap.width,
            height: art.bitmap.height,
            charColumns: art.charColumns,
            charRows: art.charRows,
          });
        } catch (error) {
          if (error instanceof ToolError) {
            return toolErrorResult(error);
          }
          return unknownErrorResult(error);
        }
      },
    },
  ],
});
