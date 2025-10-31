import { listKnowledgeResources } from "../rag/knowledgeIndex.js";
import type { KnowledgeResourceDefinition } from "../rag/knowledgeIndex.js";
import { toolRegistry } from "../tools/registry/main.js";
import type { ToolDescriptor } from "../tools/types.js";

export interface PromptDescriptor {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly requiredResources: readonly string[];
  readonly optionalResources?: readonly string[];
  readonly tools: readonly string[];
  readonly tags?: readonly string[];
}

export interface PromptArgumentDefinition {
  readonly name: string;
  readonly description: string;
  readonly required?: boolean;
  readonly options?: readonly string[];
}

export interface PromptSegment {
  readonly id: string;
  readonly role: "assistant" | "user" | "system";
  readonly content: string;
}

interface PromptDefinition {
  readonly descriptor: PromptDescriptor;
  readonly arguments?: readonly PromptArgumentDefinition[];
  readonly prepareArgs?: (args: Record<string, unknown>) => Record<string, unknown>;
  readonly buildMessages: (args: Record<string, unknown>) => readonly PromptSegment[];
  readonly selectOptionalResources?: (args: Record<string, unknown>) => readonly string[];
  readonly selectTools?: (args: Record<string, unknown>) => readonly string[];
}

export interface PromptListEntry {
  readonly descriptor: PromptDescriptor;
  readonly arguments?: readonly PromptArgumentDefinition[];
}

export interface ResolvedPrompt {
  readonly name: string;
  readonly description: string;
  readonly arguments?: Record<string, unknown>;
  readonly messages: readonly PromptSegment[];
  readonly resources: readonly KnowledgeResourceDefinition[];
  readonly tools: readonly ToolDescriptor[];
}

export interface PromptRegistry {
  list(): readonly PromptListEntry[];
  resolve(name: string, args: Record<string, unknown>): ResolvedPrompt;
}

type AssemblyHardware = "sid" | "vic" | "cia" | "multi";
type GraphicsMode = "text" | "multicolour" | "bitmap" | "sprite";
type PrinterType = "commodore" | "epson";

const BASE_SEGMENTS: Record<string, PromptSegment> = {
  "intro/core": {
    id: "intro/core",
    role: "assistant",
    content: [
      "You operate the Commodore 64 Ultimate hardware through MCP tools and documented workflows.",
      "Consult the listed knowledge resources before generating code or issuing device commands.",
      "State each intended MCP tool invocation explicitly and explain why it is required before running it.",
    ].join("\n"),
  },
  "safety/reset": {
    id: "safety/reset",
    role: "assistant",
    content: [
      "Safety guardrails:",
      "- Ask the user before resets, power cycles, disk swaps, or destructive writes.",
      "- Offer an undo or recovery path (reload prior program, remount image, or restore settings).",
      "- Highlight side effects that could halt running software or corrupt data.",
    ].join("\n"),
  },
  "workflow/basic-verify": {
    id: "workflow/basic-verify",
    role: "assistant",
    content: [
    "Verification for BASIC programs:",
    "- After uploading, call `c64.memory` (op `read_screen`) to capture PETSCII output and confirm `READY.` appears when expected.",
    "- Use `c64.memory` (op `read`) around the BASIC program area when verifying that lines tokenised correctly.",
    "- Call out newline and quotation handling quirks so the user can interpret the output accurately.",
    ].join("\n"),
  },
  "workflow/asm-irq": {
    id: "workflow/asm-irq",
    role: "assistant",
    content: [
      "IRQ discipline:",
      "- Wrap installation in `SEI`/`CLI`, set vectors, and configure `$D01A` masks explicitly.",
      "- Acknowledge interrupts via `$D019` before returning, and document any timing assumptions.",
      "- Describe zero-page and workspace usage so other routines can coexist safely.",
    ].join("\n"),
  },
  "workflow/sid-iterate": {
    id: "workflow/sid-iterate",
    role: "assistant",
    content: [
      "SID feedback loop:",
      "- Compose the sequence, waveform, ADSR, and modulation plan referencing SID register names.",
  "- Explain how to play it (e.g., `c64.sound` ops `generate` or `note_on`, or uploading executable code).",
      "- After playback, run `analyze_audio` and describe how to adjust envelope, tuning, or rhythm.",
    ].join("\n"),
  },
  "workflow/graphics-verify": {
    id: "workflow/graphics-verify",
    role: "assistant",
    content: [
    "Graphics verification:",
    "- List register writes for mode setup, colour RAM, and sprite pointers.",
    "- Suggest capturing output with `c64.memory` (op `read_screen`) or noting expected border/background colours.",
    "- Include timing checks (raster lines, badline windows) when applicable.",
    ].join("\n"),
  },
  "workflow/printer": {
    id: "workflow/printer",
    role: "assistant",
    content: [
      "Printer workflow:",
      "- Confirm printer type and device number before printing.",
      "- Include channel open/write/close steps and eject the page with `CHR$(12)` when appropriate.",
      "- Recommend checking printer status or repeating `print_text` if paper alignment is uncertain.",
    ].join("\n"),
  },
  "workflow/memory-snapshot": {
    id: "workflow/memory-snapshot",
    role: "assistant",
    content: [
    "Memory safety:",
    "- Pause running code before writes, capture the target range with `c64.memory` (op `read`), then resume when safe.",
    "- Explain how to revert the change (rewriting original bytes or power-cycling if needed).",
    "- Document address ranges, register dependencies, and any expected side effects.",
    ].join("\n"),
  },
  "workflow/drive": {
    id: "workflow/drive",
    role: "assistant",
    content: [
      "Drive management protocol:",
      "- List currently mounted images before altering drives to avoid disrupting active workflows.",
      "- Warn if IEC bus operations could interfere with running programs or disk writes.",
      "- Verify results with `drives_list` or relevant status tools after each action.",
    ].join("\n"),
  },
};

const BASIC_CORE_SEGMENT: PromptSegment = {
  id: "family/basic-core",
  role: "assistant",
  content: [
  "BASIC workflow:",
  "- Restate the request and outline a short plan citing `c64://specs/basic` for syntax or device usage.",
  "- Generate a numbered BASIC listing with inline remarks when clarity is required.",
  "- Describe how `c64.program` (op `upload_run_basic`) loads the program and what output to inspect.",
  "- Suggest follow-up diagnostics (screen capture, memory snapshot, or tool reruns).",
  ].join("\n"),
};

function assemblyCoreSegment(hardware?: AssemblyHardware): PromptSegment {
  const focus = (() => {
    switch (hardware) {
      case "sid":
        return "- Emphasise SID register usage, voice mixing, and timing derived from `c64://specs/sid`.";
      case "vic":
        return "- Highlight VIC-II raster, sprite, or bitmap setup drawing from `c64://specs/vic`.";
      case "cia":
        return "- Cover CIA timer/port configuration and interrupt hand-offs carefully.";
      case "multi":
        return "- Coordinate SID, VIC-II, and CIA interactions; call out contention risks.";
      default:
        return "- Declare which hardware blocks (SID, VIC-II, CIA) you will touch and why.";
    }
  })();

  return {
    id: "family/assembly-core",
    role: "assistant",
    content: [
      "Assembly workflow:",
      focus,
      "- Provide memory layout, zero-page usage, and register effects for the routine.",
  "- Explain how to build and deploy via `c64.program` (op `upload_run_asm`) or targeted `c64.memory` (op `write`) calls.",
  "- Include verification steps using `c64.memory` operations or hardware-specific checks.",
    ].join("\n"),
  };
}

const SID_CORE_SEGMENT: PromptSegment = {
  id: "family/sid-core",
  role: "assistant",
  content: [
    "SID composition workflow:",
    "- Summarise the musical goal, tempo, and character before presenting notes or SIDWAVE data.",
    "- Reference `c64://specs/sid` and `c64://specs/sidwave` when detailing registers and data formats.",
    "- Provide a playback plan (tool calls, SID register writes, or PRG execution) and note required buffers.",
  ].join("\n"),
};

function graphicsCoreSegment(mode?: GraphicsMode): PromptSegment {
  const intro = (() => {
    switch (mode) {
      case "text":
        return "- Focus on PETSCII screen composition and character set considerations.";
      case "multicolour":
        return "- Detail multicolour bitmap setup, shared colour registers, and memory banking.";
      case "bitmap":
        return "- Lay out bitmap memory, screen RAM, and colour RAM usage explicitly.";
      case "sprite":
        return "- Describe sprite data, pointer tables, and multiplexing or animation timing.";
      default:
        return "- State which VIC-II mode or technique you will use and justify the choice.";
    }
  })();

  return {
    id: "family/graphics-core",
    role: "assistant",
    content: [
      "Graphics workflow:",
      intro,
      "- Summarise VIC-II register writes, memory banking, and colour usage with references to `c64://specs/vic`.",
      "- Explain how to deploy the routine (BASIC loader vs assembly) and required assets.",
      "- Include clean-up or teardown steps so the user can restore the display state.",
    ].join("\n"),
  };
}

function printerCoreSegment(printerType?: PrinterType): PromptSegment {
  const detail = (() => {
    switch (printerType) {
      case "commodore":
        return "- Reference Commodore device 4 character codes and PETSCII control sequences.";
      case "epson":
        return "- Reference Epson ESC/P control codes, especially for fonts and bit-image modes.";
      default:
        return "- Clarify whether the target is Commodore MPS or Epson FX to select correct control codes.";
    }
  })();

  return {
    id: "family/printer-core",
    role: "assistant",
    content: [
      "Printer workflow:",
      detail,
      "- Outline data preparation, channel open/write/close, and any required delays.",
      "- Mention how to recover if paper jams or alignment differs from expectations.",
    ].join("\n"),
  };
}

const MEMORY_CORE_SEGMENT: PromptSegment = {
  id: "family/memory-core",
  role: "assistant",
  content: [
    "Memory debugging workflow:",
    "- Restate the target address ranges and relate them to symbols from `c64://specs/assembly` or the memory map.",
  "- Plan safe inspection or patching steps using `c64.memory` operations alongside `pause` and `resume`.",
    "- Encourage logging or diffing memory before and after changes for auditability.",
  ].join("\n"),
};

const DRIVE_CORE_SEGMENT: PromptSegment = {
  id: "family/drive-core",
  role: "assistant",
  content: [
    "Drive management workflow:",
    "- Summarise desired drive state and confirm affected slots before issuing commands.",
    "- Use `drives_list` to baseline the system and to verify outcomes after each operation.",
    "- Provide contingency steps if mounting or power commands fail.",
  ].join("\n"),
};

function mergeUniqueStrings(
  base: readonly string[],
  extras?: readonly string[],
): string[] {
  if (!extras || extras.length === 0) {
    return [...base];
  }
  const seen = new Set(base);
  const combined: string[] = [...base];
  for (const value of extras) {
    if (!seen.has(value)) {
      seen.add(value);
      combined.push(value);
    }
  }
  return combined;
}

function prepareAssemblyArgs(args: Record<string, unknown>): Record<string, unknown> {
  const hardware = args.hardware;
  if (hardware === undefined || hardware === null) {
    return {};
  }
  if (typeof hardware !== "string") {
    throw new Error("assembly-program prompt argument \"hardware\" must be a string");
  }
  const normalised = hardware.trim().toLowerCase();
  const allowed: AssemblyHardware[] = ["sid", "vic", "cia", "multi"];
  if (!allowed.includes(normalised as AssemblyHardware)) {
    throw new Error(
      `assembly-program prompt does not support hardware "${hardware}". Expected one of: ${allowed.join(", ")}`,
    );
  }
  return { hardware: normalised };
}

function prepareGraphicsArgs(args: Record<string, unknown>): Record<string, unknown> {
  const mode = args.mode;
  if (mode === undefined || mode === null) {
    return {};
  }
  if (typeof mode !== "string") {
    throw new Error("graphics-demo prompt argument \"mode\" must be a string");
  }
  const normalised = mode.trim().toLowerCase();
  const allowed: GraphicsMode[] = ["text", "multicolour", "bitmap", "sprite"];
  if (!allowed.includes(normalised as GraphicsMode)) {
    throw new Error(
      `graphics-demo prompt does not support mode "${mode}". Expected one of: ${allowed.join(", ")}`,
    );
  }
  return { mode: normalised };
}

function preparePrinterArgs(args: Record<string, unknown>): Record<string, unknown> {
  const printerType = args.printerType;
  if (printerType === undefined || printerType === null) {
    return {};
  }
  if (typeof printerType !== "string") {
    throw new Error("printer-job prompt argument \"printerType\" must be a string");
  }
  const normalised = printerType.trim().toLowerCase();
  const allowed: PrinterType[] = ["commodore", "epson"];
  if (!allowed.includes(normalised as PrinterType)) {
    throw new Error(
      `printer-job prompt does not support printerType "${printerType}". Expected one of: ${allowed.join(", ")}`,
    );
  }
  return { printerType: normalised };
}

export function createPromptRegistry(): PromptRegistry {
  const knowledgeByUri = new Map(
    listKnowledgeResources().map((resource) => [resource.uri, resource] as const),
  );
  const toolByName = new Map(toolRegistry.list().map((tool) => [tool.name, tool] as const));

  const definitions: readonly PromptDefinition[] = [
    {
      descriptor: {
        name: "basic-program",
        title: "BASIC Program Workflow",
        description: "Plan, implement, and verify Commodore BASIC v2 programs safely.",
        requiredResources: [
          "c64://specs/basic",
          "c64://context/bootstrap",
          "c64://docs/index",
        ],
        optionalResources: [],
  tools: ["c64.program", "c64.memory"],
        tags: ["basic", "program"],
      },
      buildMessages: () => [
        BASE_SEGMENTS["intro/core"],
        BASE_SEGMENTS["safety/reset"],
        BASIC_CORE_SEGMENT,
        BASE_SEGMENTS["workflow/basic-verify"],
      ],
    },
    {
      descriptor: {
        name: "assembly-program",
        title: "Assembly Program Workflow",
        description: "Author 6502/6510 assembly routines with precise hardware guidance.",
        requiredResources: [
          "c64://specs/assembly",
          "c64://specs/vic",
          "c64://specs/sid",
          "c64://context/bootstrap",
        ],
        optionalResources: ["c64://docs/sid/best-practices"],
  tools: ["c64.program", "c64.memory"],
        tags: ["assembly", "program"],
      },
      arguments: [
        {
          name: "hardware",
          description: "Optional focus area for the routine (sid, vic, cia, or multi for combined work).",
          options: ["sid", "vic", "cia", "multi"],
        },
      ],
      prepareArgs: prepareAssemblyArgs,
      selectOptionalResources: (args) => {
        const hardware = args.hardware as AssemblyHardware | undefined;
        if (hardware === "sid" || hardware === "multi") {
          return ["c64://docs/sid/best-practices"];
        }
        return [];
      },
      buildMessages: (args) => {
        const hardware = args.hardware as AssemblyHardware | undefined;
        return [
          BASE_SEGMENTS["intro/core"],
          BASE_SEGMENTS["safety/reset"],
          assemblyCoreSegment(hardware),
          BASE_SEGMENTS["workflow/asm-irq"],
          BASE_SEGMENTS["workflow/memory-snapshot"],
        ];
      },
    },
    {
      descriptor: {
        name: "sid-music",
        title: "SID Composition Workflow",
        description: "Compose SID music with expressive phrasing and iterative audio verification.",
        requiredResources: [
          "c64://specs/sid",
          "c64://specs/sidwave",
          "c64://docs/sid/file-structure",
          "c64://docs/sid/best-practices",
        ],
        optionalResources: [],
        tools: ["c64.sound"],
        tags: ["sid", "music"],
      },
      buildMessages: () => [
        BASE_SEGMENTS["intro/core"],
        SID_CORE_SEGMENT,
        BASE_SEGMENTS["workflow/sid-iterate"],
        BASE_SEGMENTS["safety/reset"],
      ],
    },
    {
      descriptor: {
        name: "graphics-demo",
        title: "Graphics Demo Workflow",
        description: "Create VIC-II graphics demos with safe setup and validation steps.",
        requiredResources: [
          "c64://specs/vic",
          "c64://context/bootstrap",
        ],
  optionalResources: ["c64://specs/assembly", "c64://specs/charset", "c64://docs/petscii-style"],
  tools: ["c64.program", "c64.memory", "c64.graphics"],
        tags: ["graphics", "vic"],
      },
      arguments: [
        {
          name: "mode",
          description: "Target VIC-II technique (text, multicolour, bitmap, or sprite).",
          options: ["text", "multicolour", "bitmap", "sprite"],
        },
      ],
      prepareArgs: prepareGraphicsArgs,
      selectTools: (args) => {
        const mode = args.mode as GraphicsMode | undefined;
        if (mode === "sprite") {
          return ["c64.graphics", "c64.memory"];
        }
        if (mode === "bitmap" || mode === "multicolour") {
          return ["c64.graphics", "c64.memory"];
        }
        if (mode === "text") {
          return ["c64.graphics", "c64.memory"];
        }
        return ["c64.graphics", "c64.memory"];
      },
      buildMessages: (args) => {
        const mode = args.mode as GraphicsMode | undefined;
        return [
          BASE_SEGMENTS["intro/core"],
          BASE_SEGMENTS["safety/reset"],
          graphicsCoreSegment(mode),
          BASE_SEGMENTS["workflow/graphics-verify"],
        ];
      },
    },
    {
      descriptor: {
        name: "printer-job",
        title: "Printer Job Workflow",
        description: "Send formatted output to Commodore or Epson printers with safe teardown steps.",
        requiredResources: [
          "c64://specs/printer",
          "c64://docs/printer/guide",
          "c64://docs/printer/prompts",
        ],
        optionalResources: [
          "c64://docs/printer/commodore-text",
          "c64://docs/printer/commodore-bitmap",
          "c64://docs/printer/epson-text",
          "c64://docs/printer/epson-bitmap",
        ],
  tools: ["c64.printer"],
        tags: ["printer"],
      },
      arguments: [
        {
          name: "printerType",
          description: "Select Commodore (device 4) or Epson FX workflow helpers.",
          options: ["commodore", "epson"],
        },
      ],
      prepareArgs: preparePrinterArgs,
      selectOptionalResources: (args) => {
        const printerType = args.printerType as PrinterType | undefined;
        if (printerType === "commodore") {
          return ["c64://docs/printer/commodore-text", "c64://docs/printer/commodore-bitmap"];
        }
        if (printerType === "epson") {
          return ["c64://docs/printer/epson-text", "c64://docs/printer/epson-bitmap"];
        }
        return [];
      },
      selectTools: () => ["c64.printer"],
      buildMessages: (args) => {
        const printerType = args.printerType as PrinterType | undefined;
        return [
          BASE_SEGMENTS["intro/core"],
          printerCoreSegment(printerType),
          BASE_SEGMENTS["workflow/printer"],
          BASE_SEGMENTS["safety/reset"],
        ];
      },
    },
    {
      descriptor: {
        name: "memory-debug",
        title: "Memory Debug Workflow",
        description: "Inspect or patch memory ranges with reversible steps and logging.",
        requiredResources: [
          "c64://context/bootstrap",
          "c64://specs/assembly",
          "c64://docs/index",
        ],
    optionalResources: [],
    tools: ["c64.memory", "c64.system"],
        tags: ["memory", "debug"],
      },
      buildMessages: () => [
        BASE_SEGMENTS["intro/core"],
        BASE_SEGMENTS["safety/reset"],
        MEMORY_CORE_SEGMENT,
        BASE_SEGMENTS["workflow/memory-snapshot"],
      ],
    },
    {
      descriptor: {
        name: "drive-manager",
        title: "Drive Manager Workflow",
        description: "Mount, create, or power drives while preserving running workloads.",
        requiredResources: ["c64://context/bootstrap"],
        optionalResources: [],
        tools: [
          "c64.disk",
          "c64.drive",
        ],
        tags: ["drive", "storage"],
      },
      buildMessages: () => [
        BASE_SEGMENTS["intro/core"],
        BASE_SEGMENTS["safety/reset"],
        DRIVE_CORE_SEGMENT,
        BASE_SEGMENTS["workflow/drive"],
      ],
    },
  ];

  const definitionByName = new Map(definitions.map((def) => [def.descriptor.name, def] as const));

  return {
    list(): readonly PromptListEntry[] {
      return definitions.map((definition) => ({
        descriptor: definition.descriptor,
        arguments: definition.arguments,
      }));
    },
    resolve(name: string, args: Record<string, unknown>): ResolvedPrompt {
      const definition = definitionByName.get(name);
      if (!definition) {
        throw new Error(`Unknown prompt: ${name}`);
      }

      const rawArgs = args ?? {};
      const prepared = definition.prepareArgs ? definition.prepareArgs(rawArgs) : {};
      const argumentValues = Object.keys(prepared).length > 0 ? prepared : undefined;

      const requiredResourceUris = definition.descriptor.requiredResources;
      const optionalBase = definition.descriptor.optionalResources ?? [];
      const optionalExtra = definition.selectOptionalResources
        ? definition.selectOptionalResources(prepared)
        : [];
      const optionalUris = mergeUniqueStrings(optionalBase, optionalExtra);
      const resourceUris = mergeUniqueStrings(requiredResourceUris, optionalUris);

      const resources: KnowledgeResourceDefinition[] = resourceUris
        .map((uri) => {
          const resource = knowledgeByUri.get(uri);
          if (!resource) {
            if (requiredResourceUris.includes(uri)) {
              throw new Error(`Prompt ${name} references unknown knowledge resource: ${uri}`);
            }
            return undefined;
          }
          return resource;
        })
        .filter((value): value is KnowledgeResourceDefinition => Boolean(value));

      if (resources.length < requiredResourceUris.length) {
        throw new Error(`Prompt ${name} missing required knowledge resources after resolution`);
      }

      const toolNames = mergeUniqueStrings(
        definition.descriptor.tools,
        definition.selectTools ? definition.selectTools(prepared) : undefined,
      );
      const tools: ToolDescriptor[] = toolNames
        .map((toolName) => {
          const tool = toolByName.get(toolName);
          if (!tool) {
            throw new Error(`Prompt ${name} references unknown tool: ${toolName}`);
          }
          return tool;
        });

      const messages = definition.buildMessages(prepared);

      return {
        name: definition.descriptor.name,
        description: definition.descriptor.description,
        arguments: argumentValues,
        messages,
        resources,
        tools,
      };
    },
  };
}
