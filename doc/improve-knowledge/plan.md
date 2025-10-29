# Knowledge Improvement Plan

This plan aims to identify and prioritize improvements to the C64 Bridge MCP server.

The main goal is to enhance the server's effectiveness when used with LLMs for code generation, music creation, graphics, and general C64 programming tasks.

The focus is on improving the MCP surface, knowledge base, RAG capabilities, generator defaults, and overall developer experience.

### 1) Executive Summary

The server exposes a rich, well-typed MCP surface with clear schemas, strong logging, a deterministic local RAG, and extensive tests. The biggest gaps affecting LLM effectiveness are:

- (1) RAG results are returned as raw text rather than structured, referenceable snippets;
- (2) key domain docs (memory/IO maps, SID best-practices) are not exposed as MCP resources;
- (3) creative defaults (e.g., SID waveform/ADSR) aren’t aligned with the repo’s own musical best-practices. Addressing these will materially improve determinism, provenance, and the quality of BASIC/ASM/graphics/SID outputs.

### 2) Recommendations (Grouped by Topic)

#### MCP Surface & Tooling

| ID | Recommendation | Evidence (paths/lines/refs) | Effort* | Benefit** | Risks/Trade-offs |
|----|----------------|-----------------------------|---------|-----------|------------------|
| M1 | Remove `upload_and_run_basic` as a prerequisite for `read_screen` to avoid misleading LLM plans (screen read works independently). | `src/tools/memory.ts:81-99`, `88-89` | S | 3 | Slightly changes listed workflow hints; no runtime impact. |
| M2 | Standardize structured JSON outputs for runner tools (include entry addresses, artifacts, URIs) similar to graphics/audio tools using `structuredContent`. | `src/tools/types.ts:64-72, 90-106`; program runners return only `textResult` in `src/tools/programRunners.ts:129-140,176-180,231-236,276-281,320-324` | M | 4 | Minor API output change; keep text message for backward compatibility. |
| M3 | Add a lightweight tool to set platform at runtime (uses existing `setPlatform`) and surface platform resource in resources index for LLM clarity. | `src/platform.ts:29-46,58-91`; resource exists: `src/mcp-server.ts:371-432` | S | 3 | Requires documenting when platform switch affects tool availability. |
| M4 | Ensure all tools include concise validation messages and examples (many already do); audit remaining modules for parity. | e.g., `src/tools/audio.ts:190-224,517-583,747-756` | S | 3 | Small doc/schema edits; keeps LLM prompts aligned with schemas. |
| M5 | Add explicit tool tags and related resources for PAL/NTSC-sensitive tools (SID, graphics) to nudge LLM to check system differences. | `src/tools/audio.ts:94-101`, `src/knowledge.ts:368-438` | S | 3 | Slight metadata churn; improves prompt-tool alignment. |

#### Knowledge Base & Resources

| ID | Recommendation | Evidence (paths/lines/refs) | Effort* | Benefit** | Risks/Trade-offs |
|----|----------------|-----------------------------|---------|-----------|------------------|
| K1 | Add memory/IO maps and low-memory docs as MCP resources (critical grounding for ASM/memory tools). | Missing under `src/rag/knowledgeIndex.ts:55-299`; candidate docs: `data/memory/*.md`, `data/io/*.md` | S | 5 | Larger resource list; very high grounding value for LLMs. |
| K2 | Expose SID best-practices as a resource (used by creative flows). | Not in knowledge index; exists at `data/audio/sid-programming-best-practices.md` | S | 5 | Aligns generation defaults with proven musical outcomes. |
| K3 | Add a short “BASIC pitfalls” quickref (quoting, line length, tokenization) and link from runners. | Tokenizer: `src/basicConverter.ts`; hints exist but not resource-linked | M | 4 | Minor doc work; reduces BASIC generation errors. |
| K4 | Publish PETSCII/charset quickrefs as MCP resources; generate a Markdown table from the existing `data/video/character-set.csv` (retain CSV for programmatic access). Prefer dynamic generation to avoid duplicate sources of truth. | `data/video/character-set.csv`, `src/petscii.ts`, `src/petsciiArt.ts` | S | 5 | Improves PETSCII/charset fluency while avoiding duplication. |
| K5 | Publish VIC-II register quickref and addressing guide as MCP resource. | `data/video/vic-spec.md` | S | 5 | Essential grounding for sprites, colours, raster, screen control. |
| K6 | Add “Sprite & Charset workflows best-practices” doc and expose as resource. | New doc under `data/video/` referencing `src/tools/graphics.ts` capabilities | M | 4 | Guides consistent, high-quality sprite/charset pipelines for LLMs. |

#### RAG & Retrieval

| ID | Recommendation | Evidence (paths/lines/refs) | Effort* | Benefit** | Risks/Trade-offs |
|----|----------------|-----------------------------|---------|-----------|------------------|
| R1 | Return structured refs from RAG: `[uri|origin, snippet, score]` instead of only text. Parse `<!-- Source: ... -->` and include score. | Text returned: `src/tools/rag.ts:82-128`; retriever: `src/rag/retriever.ts:37-80`; provenance comment injected: `src/rag/indexer.ts:769-772` | M | 5 | Requires minor client-side changes reading structured refs. |
| R2 | Include bundle/resource URIs (e.g., `c64://specs/*`) in RAG results when matches originate from docs; enable quick “open resource.” | `src/rag/knowledgeIndex.ts:328-359` (index resource), doc chunking: `720-767` | S | 4 | Slight mapping logic; greatly improves provenance and navigation. |
| R3 | Add diversity heuristic (basic+asm mixed fallback already exists) and simple duplicate suppression in top-K. | `src/rag/retriever.ts:70-76,78-80` | S | 3 | Keeps refs varied; minimal complexity. |
| R4 | Add domain weighting to retrieval (boost SID/graphics docs when relevant). | `src/rag/retriever.ts` scoring path; tool domain is known at call sites | M | 4 | More relevant grounding for PETSCII/sprites/SID prompts. |

#### Generators & Creative Pipelines (BASIC/ASM/Graphics/SID)

| ID | Recommendation | Evidence (paths/lines/refs) | Effort* | Benefit** | Risks/Trade-offs |
|----|----------------|-----------------------------|---------|-----------|------------------|
| G1 | Change `music_generate` defaults to triangle waveform and best-practice ADSR; optionally expose a “musical expression” preset. | Current defaults pulse+ADSR: `src/tools/audio.ts:747-756,783-801`; PAL/NTSC in client: `src/c64Client.ts:773-786`; best-practices doc: `data/audio/sid-programming-best-practices.md` | S | 5 | Slight change to expected timbre; add arg to opt back to pulse. |
| G2 | When `sid_note_on` is used without `system`, auto-detect or remind to check `$02A6` (PAL/NTSC) and reflect in response metadata. | Client freq calc + defaults: `src/c64Client.ts:371-407,773-778`; PAL/NTSC doc: `src/knowledge.ts:373-421` | S | 4 | Small change; better tuning accuracy. |
| G3 | Include generated PRG metadata (addresses, bytes written) in program runners’ structured output to aid follow-up memory ops. | Runners return text only: `src/tools/programRunners.ts:129-140,176-180,231-236,276-281,320-324` | M | 4 | Minor tool API enhancement; improves post-run determinism. |
| G4 | For PETSCII, surface chosen glyph/codes and a miniature preview in structured output (already present; ensure docs highlight usage). | Already included: `src/tools/graphics.ts:489-515` | S | 3 | Doc-only; improves downstream use. |
| G5 | Document PETSCII style presets (contrast, dithering, palette) and link from prompts. | `src/tools/graphics.ts` PETSCII args; `src/prompts/registry.ts` | S | 4 | Helps LLM pick good defaults for readable, artistic output. |
| G6 | Add hires bitmap PRG generator tool (render static bitmap with colour RAM). | New tool in `src/tools/graphics.ts`; preview via screen capture | M | 4 | Enables high-quality hires demonstrations and asset previews. |

#### Validation, Testing & CI

| ID | Recommendation | Evidence (paths/lines/refs) | Effort* | Benefit** | Risks/Trade-offs |
|----|----------------|-----------------------------|---------|-----------|------------------|
| T1 | Add tests asserting `music_generate` new defaults (tri/ADSR) and pitch accuracy by PAL/NTSC. | Audio analysis tests exist: `test/audioAnalysis.test.mjs:56-141`; `hzToSidFrequency`: `src/c64Client.ts:773-778` | S | 4 | Keeps musical defaults from regressing. |
| T2 | Add a small e2e test for `rag_retrieve_*` verifying structured refs and that URIs open via `ReadResource`. | `src/tools/rag.ts:82-128`, `src/mcp-server.ts:133-176` | M | 4 | Increases confidence in RAG interoperability. |
| T3 | Quick test to ensure `read_screen` works without prior `upload_and_run_basic`. | `src/tools/memory.ts:81-99` | S | 3 | Guards against accidental pre-req regressions. |
| T4 | Add e2e test for PETSCII generation: verify preview fields and PRG runs. | `src/tools/graphics.ts`, `test/graphicsModule.test.mjs` | S | 4 | Prevents regressions in graphics outputs crucial for PETSCII art. |
| T5 | Add sprite preview PRG test: bytes copied, coords/colour applied, screen captured. | `src/tools/graphics.ts`, `test/graphicsModule.test.mjs` | S | 4 | Ensures sprite workflows stay reliable for asset iteration. |

#### Developer Experience & Documentation

| ID | Recommendation | Evidence (paths/lines/refs) | Effort* | Benefit** | Risks/Trade-offs |
|----|----------------|-----------------------------|---------|-----------|------------------|
| D1 | Add a “What changed” MCP summary to README or resource index after build (already partially auto-generated) and link platform status resource. | Auto-generated API in `README.md:346-589`; platform resource in `src/mcp-server.ts:371-432` | S | 3 | Keeps LLM and humans in sync with tool/resource changes. |
| D2 | Cross-link prompts to resources (e.g., SID prompts to best-practices) for richer in-editor help. | Prompt registry references tools/resources: `src/prompts/registry.ts:369-547` | S | 3 | Small doc metadata lift; improves LLM contextual grounding. |
| D3 | Add PETSCII/sprite/hires quickstarts and example-driven guides; link from prompts. | New docs under `data/video/`, `src/prompts/registry.ts` | M | 4 | Streamlines creative workflows aligned to the core mission. |

#### Security/Licensing & Reproducibility

| ID | Recommendation | Evidence (paths/lines/refs) | Effort* | Benefit** | Risks/Trade-offs |
|----|----------------|-----------------------------|---------|-----------|------------------|
| S1 | Provide a runnable, reproducible container (Node 20 LTS, non-root user, `npm ci`, `npm start`), not just apt base. | Current Dockerfile doesn’t copy/build/run: `Dockerfile:1-12` | M | 3 | Larger image and CI time; greatly simplifies reproducibility. |
| S2 | Replace license name and URL with SPDX identifier in structured RAG refs (map when possible; omit if unknown). | License metadata recorded: `src/rag/indexer.ts:592-699` | S | 3 | Normalizes licensing with a single standard field. |

\* Effort: S (small), M (medium), L (large)  
\** Benefit: 1–5 (5 = highest impact)

### 3) Ranked Shortlist (Cross-Topic)

| Rank | ID | Title | Effort | Benefit | One-line Justification |
|------|----|-------|--------|---------|------------------------|
| 1 | R1 | Structured RAG refs with URIs and scores | M | 5 | Makes retrieval actionable and referenceable for LLMs. |
| 2 | K1 | Add memory/IO docs as MCP resources | S | 5 | Critical grounding for reliable ASM/memory operations. |
| 3 | G1 | Align music defaults to best-practices (tri/ADSR) | S | 5 | Immediate quality uplift for SID output. |
| 4 | K2 | Expose SID best-practices as resource | S | 5 | Guides LLM toward proven musical results. |
| 5 | M2 | Standardize structured JSON outputs for runners | M | 4 | Improves determinism and follow-up automation. |
| 6 | T1 | Tests for PAL/NTSC and new music defaults | S | 4 | Locks in audible quality and tuning accuracy. |
| 7 | M1 | Remove `read_screen` pre-req coupling | S | 3 | Avoids confusing plans; reduces unnecessary steps. |
| 8 | S1 | Ship a runnable container | M | 3 | Eases local/CI reproducibility and onboarding. |

### 3b) Additional Prioritized Improvements (Next Phases)

| Rank | ID | Title | Effort | Benefit | One-line Justification |
|------|----|-------|--------|---------|------------------------|
| 9 | K4 | PETSCII/charset quickrefs (Markdown from CSV; keep CSV) | S | 5 | Avoids duplication; improves PETSCII/charset fluency. |
| 10 | K5 | VIC-II register quickref resource | S | 5 | Core for graphics, sprites, raster, and colours. |
| 11 | R2 | Resource URIs in RAG refs | S | 4 | Faster navigation from retrieval to action. |
| 12 | R3 | Retrieval diversity + de-dup | S | 3 | Improves variety and reduces redundancy. |
| 13 | G5 | PETSCII style presets docs | S | 4 | Better default art quality and readability. |
| 14 | T4 | PETSCII e2e generation test | S | 4 | Prevents regressions in critical graphics flow. |
| 15 | G2 | PAL/NTSC reminder in SID note-on | S | 4 | Reduces tuning errors automatically. |
| 16 | K6 | Sprite/charset workflows guide | M | 4 | Teaches robust workflows for assets. |
| 17 | G6 | Hires bitmap PRG generator | M | 4 | Enables hires demos and previews. |
| 18 | D3 | Creative quickstarts and guides | M | 4 | Guides LLMs and users to success paths. |
| 19 | S2 | SPDX id in RAG refs (replace name/URL) | S | 3 | Single normalized field; reduces duplication. |

### 4) Top Three Priorities

- Implement structured RAG results (URIs, origin, score) and wire `ReadResource` for direct follow-ups.  
- Add memory/IO maps and SID best-practices to the exposed MCP resources to improve grounding.  
- Switch `music_generate` defaults to triangle + recommended ADSR, and add tests for PAL/NTSC tuning.
