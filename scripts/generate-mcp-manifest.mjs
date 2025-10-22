import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

async function readJson(file) {
  const text = await fs.readFile(file, 'utf8');
  return JSON.parse(text);
}

function findTsConfig(startDir) {
  const configPath = ts.findConfigFile(startDir, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) throw new Error('tsconfig.json not found');
  return path.resolve(configPath);
}

function parseTsConfig(configPath) {
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
  return parsed;
}

function isMcpToolDecorator(dec) {
  if (!dec) return false;
  const node = ts.isDecorator(dec) ? dec : dec; // compat
  const expr = node.expression;
  if (!expr) return false;
  if (ts.isCallExpression(expr)) {
    const callee = expr.expression;
    if (ts.isIdentifier(callee) && callee.text === 'McpTool') return true;
    if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'McpTool') return true;
  }
  return false;
}

function evaluateLiteral(node) {
  if (!node) return undefined;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(evaluateLiteral);
  if (ts.isObjectLiteralExpression(node)) {
    const out = {};
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const key = ts.isIdentifier(prop.name) || ts.isStringLiteralLike(prop.name) ? prop.name.text : undefined;
      if (!key) continue;
      out[key] = evaluateLiteral(prop.initializer);
    }
    return out;
  }
  return undefined;
}

function collectToolsFromSourceFile(sf) {
  const tools = [];
  function visit(node) {
    if (ts.isMethodDeclaration(node)) {
      const decorators = (ts.canHaveDecorators && ts.getDecorators) ? ts.getDecorators(node) : node.decorators;
      if (decorators && decorators.length > 0) {
        for (const dec of decorators) {
          if (isMcpToolDecorator(dec)) {
            const call = dec.expression;
            const arg = ts.isCallExpression(call) ? call.arguments[0] : undefined;
            const options = arg ? evaluateLiteral(arg) : undefined;
            if (options && options.name && options.description) {
              tools.push({ ...options });
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return tools;
}

async function main() {
  const cwd = process.cwd();
  const pkg = await readJson(path.join(cwd, 'package.json'));
  const tsConfigPath = findTsConfig(cwd);
  const parsed = parseTsConfig(tsConfigPath);
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
  const tools = [];
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || sf.fileName.includes('/node_modules/')) continue;
    tools.push(...collectToolsFromSourceFile(sf));
  }

  const byName = new Map();
  for (const t of tools) {
    if (!byName.has(t.name)) byName.set(t.name, t);
  }
  const uniqueTools = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));

  const manifest = {
    name: pkg.name || 'mcp-server',
    version: pkg.version || '0.0.0',
    description: pkg.description || 'MCP Server manifest',
    tools: uniqueTools,
  };

  const outDir = parsed.options.outDir ? path.resolve(parsed.options.outDir) : path.join(cwd, 'dist');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'mcp-manifest.json');
  await fs.writeFile(outPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`Generated MCP manifest with ${uniqueTools.length} tool(s): ${outPath}`);
}

main().catch((err) => {
  console.error('Failed to generate MCP manifest:', err);
  process.exit(1);
});
