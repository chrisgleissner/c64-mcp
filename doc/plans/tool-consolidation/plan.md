# LLM Prompt: C64 Bridge MCP Tool Surface Consolidation

You are refactoring the **C64 Bridge MCP server** (TypeScript, using `@modelcontextprotocol/sdk`) to reduce the exposed tool count from ~88 to a clean, discoverable set of **12 grouped multi-operation tools**, while preserving full functionality, LLM discoverability, and TypeScript type safety.

This plan incorporates the latest refinements: **splitting storage tools, dissolving meta workflows, adding verification flags, tightening schema discrimination, and renaming all prefixes to `c64.*`**.

---

## 1. Objective

Transform all existing tools into **12 grouped multi-operation tools** with the following goals:

- Preserve *every* endpoint, parameter, and capability.
- Make the entire surface fully discoverable by LLMs via discriminated JSON Schema.
- Maintain compatibility with all MCP clients (VS Code, Cursor, Windsurf, Claude Desktop, Copilot Agents).
Each grouped tool must:

- Define an `op` property (`enum` or `const` in `oneOf` discriminators).
- Implement one handler dispatching internally based on `args.op`.
- Keep per-op descriptions concise (≤2 sentences).
- Include `verify: boolean` for ops where verification was previously separate.
- Be listed in the documentation generator as a grouped tool with nested operations.

---

## 2. Grouped Tool Mapping

| Tool | Consolidated Operations | Selector | Notes |
|------|-------------------------|-----------|--------|
| **`c64_program`** | `load_prg_file` → `load_prg` • `run_prg_file` → `run_prg` • `run_crt_file` → `run_crt` • `upload_and_run_basic` → `upload_run_basic` • `upload_and_run_asm` → `upload_run_asm` • `batch_run_with_assertions` → `batch_run` • `bundle_run_artifacts` → `bundle_run` | `op` | `upload_run_*` ops gain optional `verify: boolean` |
| **`c64_memory`** | `read_memory` → `read` • `write_memory` → `write` (`verify: boolean`) • `read_screen` → `read_screen` • `wait_for_screen_text` → `wait_for_text` | `op` | `wait_for_text` covers polling-based screen matching |
| **`c64_sound`** | `sid_note_on` → `note_on` • `sid_note_off` → `note_off` • `sid_reset` → `reset` • `sid_silence_all` → `silence_all` (`verify: boolean`) • `sid_volume` → `set_volume` • `sidplay_file` → `play_sid_file` • `modplay_file` → `play_mod_file` • `music_compile_and_play` → `compile_play` • `music_generate` → `generate` • `music_compile_play_analyze` → `pipeline` • `analyze_audio` → `analyze` • `record_and_analyze_audio` → `record_analyze` | `op` | Includes the dissolved meta pipeline |
| **`c64_system`** | `pause` → `pause` • `resume` → `resume` • `reset_c64` → `reset` • `reboot_c64` → `reboot` • `poweroff` → `poweroff` • `menu_button` → `menu` • `start_background_task` → `start_task` • `stop_background_task` → `stop_task` • `stop_all_background_tasks` → `stop_all_tasks` • `list_background_tasks` → `list_tasks` | `op` | Combines system control with background task orchestration |
| **`c64_graphics`** | `create_petscii_image` → `create_petscii` • `render_petscii_screen` → `render_petscii` • `generate_sprite_prg` → `generate_sprite` • *(planned)* hires bitmap generator → `generate_bitmap` | `op` | PETSCII, sprite, and future bitmap helpers |
| **`c64_rag`** | `rag_retrieve_basic` → `basic` • `rag_retrieve_asm` → `asm` | `op` | Lightweight retrieval API |
| **`c64_disk`** | `create_d64/d71/d81/dnp` → `create_image` (`format` param) • `drive_mount`/`drive_mount_and_verify` → `mount` (`verify: boolean`) • `drive_remove` → `unmount` • `drives_list` → `list_drives` • `file_info` → `file_info` • `find_and_run_program_by_name` → `find_and_run` | `op` (`format`) | Consolidates disk image and file workflows |
| **`c64_drive`** | `drive_load_rom` → `load_rom` • `drive_mode` → `set_mode` • `drive_reset` → `reset` • `drive_on` → `power_on` • `drive_off` → `power_off` | `op` | Physical and virtual drive state |
| **`c64_printer`** | `define_printer_chars` → `define_chars` • `print_bitmap_commodore` → `print_bitmap` (`printer="commodore"`) • `print_bitmap_epson` → `print_bitmap` (`printer="epson"`) • `print_text` → `print_text` | `op` | `print_bitmap` requires the `printer` selector |
| **`c64_config`** | `config_get` → `get` • `config_set` → `set` • `config_list` → `list` • `config_batch_update` → `batch_update` • `config_load_from_flash` → `load_flash` • `config_save_to_flash` → `save_flash` • `config_reset_to_default` → `reset_defaults` • `debugreg_read` → `read_debugreg` • `debugreg_write` → `write_debugreg` • `info` → `info` • `version` → `version` • `config_snapshot_and_restore` → `snapshot` / `restore` • `program_shuffle` → `shuffle` | `op` | Configuration, firmware, and snapshot management |
| **`c64_extract`** | `extract_sprites_from_ram` → `sprites` • `rip_charset_from_ram` → `charset` • `memory_dump_to_file` → `memory_dump` • `filesystem_stats_by_extension` → `fs_stats` • `firmware_info_and_healthcheck` → `firmware_health` | `op` | Diagnostics and asset extraction |
| **`c64_stream`** | `stream_start` → `start` • `stream_stop` → `stop` | `op` | Streaming and monitoring APIs |

---

## 3. Verification Integration

Remove separate verification tools. Instead, add `verify?: boolean` parameter to:

| Tool | Operation | Previous Tool |
|------|------------|----------------|
| `c64_memory` | `write` | `verify_and_write_memory` |
| `c64_sound` | `silence_all` | `silence_and_verify` |
| `c64_disk` | `mount` | `drive_mount_and_verify` |
| `c64_program` | `upload_run_basic`, `upload_run_asm` | `compile_run_verify_cycle` |

Each operation should check `args.verify === true` to trigger post-action verification.

---

## 4. Schema Specification

All grouped tools must define discriminated unions using `const` for clarity and LLM reliability.

Example:

```ts
parameters: {
  oneOf: [
    {
      properties: {
        op: { const: "read" },
        address: { type: "integer" },
        length: { type: "integer" }
      },
      required: ["op", "address", "length"]
    },
    {
      properties: {
        op: { const: "write" },
        address: { type: "integer" },
        data: { type: "string" },
        verify: { type: "boolean", default: false }
      },
      required: ["op", "address", "data"]
    },
    {
      properties: {
        op: { const: "wait_for_text" },
        pattern: { type: "string" },
        timeout: { type: "integer", default: 2000 }
      },
      required: ["op", "pattern"]
    }
  ]
}
```

---

## 5. Documentation Generation

Update `scripts/generate-docs.ts` to:

- Detect grouped tools and list sub-operations in nested tables.
- Present the grouped tool suite in a single consolidated section.
- Add total summary line:
  > “This MCP server exposes **12 grouped tools** (≈81 operations), **25 resources**, and **7 prompts**.”
- Show verification-enabled ops with `(verify)` suffix or a column note.
- Include per-tool schema references (`op` values) in the generated README.

---

## 6. Discoverability and LLM Behavior

All LLM clients (OpenAI GPT-5, Anthropic Claude, Copilot Agents, MCP servers, etc.) automatically receive each tool’s full JSON schema.

- `enum` and `const` values for `op` make all operations **visible** in context.
- The LLM naturally selects the correct `op` based on intent.
- Discriminated `oneOf` schemas and `description` fields maximize precision.
- Verification and optional arguments remain self-documenting in schema.

This design conforms to **MCP JSON Schema 2020-12**, ensuring interoperability and zero regression in LLM comprehension.

---

## 7. Implementation Checklist

- [ ] Add grouped tool definitions to `registry.ts`.
- [ ] Implement `dispatch` functions per tool based on `args.op`.
- [ ] Integrate `verify` parameter logic.
- [ ] Refactor and reuse existing validation code.
- [ ] Adjust `generate-docs.ts` to support grouped ops.
- [ ] Update README auto-generation section (`<!-- AUTO-GENERATED:MCP-DOCS-START -->`).
- [ ] Verify tests cover all grouped operations and shared validators.
- [ ] Add a changelog entry:

  ```markdown
  ## 0.x.x – MCP Tool Consolidation and Refactor
  - Reduced 88 single-purpose tools to 12 grouped multi-operation tools.
  - Dissolved meta category, redistributed operations contextually.
  - Added verification parameters and discriminated JSON schemas.
  - Split storage into c64_disk and c64_drive.
  - Added c64_extract category and integrated background task operations into c64_system.
  - Improved LLM discoverability and documentation generation.
  ```

---

## 8. Final Tool Summary

| Tool | Purpose |
|------|----------|
| `c64_program` | Program upload, run, and batch workflows |
| `c64_memory` | Memory I/O, screen reading, and verification |
| `c64_sound` | SID synthesis, playback, and analysis |
| `c64_system` | Reset, reboot, power control, menu button, and background tasks |
| `c64_graphics` | PETSCII, sprite, and bitmap generation |
| `c64_rag` | BASIC and assembly reference retrieval |
| `c64_disk` | Disk and image management |
| `c64_drive` | Drive configuration and power control |
| `c64_printer` | Commodore and Epson printer workflows |
| `c64_config` | Configuration, debug register, firmware info, and snapshots |
| `c64_extract` | Sprite, charset, memory, and diagnostics extraction |
| `c64_stream` | Streaming and monitoring APIs |

---

**Deliverable:**  
A fully functioning TypeScript MCP server exposing 12 grouped tools with discriminated schemas, `verify` parameters, and automatic documentation, fully aligned with the Model Context Protocol SDK and discoverable by all LLM-based MCP clients.
