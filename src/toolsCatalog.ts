import { McpTool } from './mcpDecorators.js';

// This file contains lightweight stubs decorated with @McpTool for endpoints
// that are not methods on C64Client but are exposed as MCP tools (e.g. docs, RAG helpers).
// The generator scans the whole project and will include these in the manifest.

export class ToolsCatalog {
  @McpTool({ name: 'read_screen', description: 'Read 1KB of screen memory from the C64', devices: 'c64u' })
  read_screen() {}

  @McpTool({ name: 'print_text', description: 'Generate a BASIC program to print text to device 4 and run it', parameters: { text: 'string', target: 'string', secondaryAddress: 'number', formFeed: 'boolean' }, devices: 'c64u,vice' })
  print_text() {}

  @McpTool({ name: 'version', description: 'Get c64 REST API version', devices: 'c64u,vice' })
  version() {}

  @McpTool({ name: 'info', description: 'Get device information', devices: 'c64u,vice' })
  info() {}

  @McpTool({ name: 'basic_v2_spec', description: 'Get Commodore BASIC v2 concise language spec or filtered by topic', parameters: { topic: 'string' }, devices: 'c64u,vice' })
  basic_v2_spec() {}

  @McpTool({ name: 'asm_quick_reference', description: 'Get the 6502/6510 assembly quick reference or filter by topic keywords', parameters: { topic: 'string' }, devices: 'c64u,vice' })
  asm_quick_reference() {}

  @McpTool({ name: 'vic_ii_spec', description: 'Get the VIC-II timing/graphics spec or filter by topic', parameters: { topic: 'string' }, devices: 'c64u,vice' })
  vic_ii_spec() {}

  @McpTool({ name: 'file_info', description: 'Inspect file metadata', parameters: { path: 'string' }, devices: 'c64u' })
  file_info() {}

  @McpTool({ name: 'record_and_analyze_audio', description: 'Records audio from default microphone and analyzes SID playback, returning SIDWAVE-compatible pitch/frequency data', parameters: { durationSeconds: 'number', expectedSidwave: 'object' }, devices: 'c64u,vice' })
  record_and_analyze_audio() {}

  @McpTool({ name: 'analyze_audio', description: "Smart audio verification tool that automatically analyzes audio when user requests to check, verify, or test music/SID playback. Responds to natural language patterns like 'check the music', 'verify the song', 'does it sound right?'", parameters: { request: 'string', durationSeconds: 'number', expectedSidwave: 'object' }, devices: 'c64u,vice' })
  analyze_audio() {}

  @McpTool({ name: 'music_generate', description: 'Generate and play a simple arpeggio pattern', parameters: { root: 'string', pattern: 'string', steps: 'number', tempoMs: 'number', waveform: 'string' }, devices: 'c64u,vice' })
  music_generate() {}

  @McpTool({ name: 'music_compile_and_play', description: 'Compile a SIDWAVE composition to PRG/SID and play it', parameters: { sidwave: 'string', format: 'string', output: 'string', dryRun: 'boolean' }, devices: 'c64u,vice' })
  music_compile_and_play() {}

  @McpTool({
    name: 'create_petscii_image',
    description: 'Create a PETSCII character art image from text or prompts, run it on the C64, and return the BASIC program and bitmap',
    parameters: {
      prompt: 'string',
      text: 'string',
      maxWidth: 'number',
      maxHeight: 'number',
      borderColor: 'number',
      backgroundColor: 'number',
      foregroundColor: 'number',
      dryRun: 'boolean',
    },
    devices: 'c64u,vice'
  })
  create_petscii_image() {}

  @McpTool({ name: 'sidwave_spec', description: 'Return the SIDWAVE format specification', devices: 'c64u,vice' })
  sidwave_spec() {}

  @McpTool({ name: 'sid_reference', description: 'Return the SID overview document', devices: 'c64u,vice' })
  sid_reference() {}

  @McpTool({ name: 'sid_file_structure', description: 'Return the SID file structure overview', devices: 'c64u,vice' })
  sid_file_structure() {}

  @McpTool({ name: 'printing_commodore_text', description: 'Return Commodore MPS text printing guide', devices: 'c64u,vice' })
  printing_commodore_text() {}

  @McpTool({ name: 'printing_commodore_bitmap', description: 'Return Commodore MPS bitmap/custom char guide', devices: 'c64u,vice' })
  printing_commodore_bitmap() {}

  @McpTool({ name: 'printing_epson_text', description: 'Return Epson FX text printing guide', devices: 'c64u,vice' })
  printing_epson_text() {}

  @McpTool({ name: 'printing_epson_bitmap', description: 'Return Epson FX bitmap guide', devices: 'c64u,vice' })
  printing_epson_bitmap() {}

  @McpTool({ name: 'printing_prompts', description: 'Return end-user printing prompt templates', devices: 'c64u,vice' })
  printing_prompts() {}

  @McpTool({ name: 'printing_guide', description: 'Return the Commodore/Epson printing guide', devices: 'c64u,vice' })
  printing_guide() {}

  @McpTool({ name: 'rag_retrieve_basic', description: 'Retrieve BASIC references for a query', parameters: { q: 'string', k: 'number' }, devices: 'c64u,vice' })
  rag_retrieve_basic() {}

  @McpTool({ name: 'rag_retrieve_asm', description: 'Retrieve 6502/6510 assembly snippets and guidance for fast machine-code routines', parameters: { q: 'string', k: 'number' }, devices: 'c64u,vice' })
  rag_retrieve_asm() {}

  @McpTool({ name: 'upload_and_run_program', description: 'Upload and run program with language inference (BASIC vs ASM)', parameters: { program: 'string', lang: 'string' }, devices: 'c64u,vice' })
  upload_and_run_program() {}
}
