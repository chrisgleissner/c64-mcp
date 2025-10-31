import { describe, expect, it } from "bun:test";
import { renderToolsSection } from "../scripts/update-readme.ts";

function renderToolsAsString() {
  return renderToolsSection().join("\n");
}

describe("update-readme grouped operations", () => {
  it("includes an operations table for grouped tools", () => {
    const output = renderToolsAsString();
    expect(output).toContain("##### Operations: `c64.program`");
    expect(output).toContain("| `run_prg`");
    expect(output).toContain("| `upload_run_basic`");
    expect(output).toContain("##### Operations: `c64.memory`");
    expect(output).toContain("| `wait_for_text`");
  });
});
