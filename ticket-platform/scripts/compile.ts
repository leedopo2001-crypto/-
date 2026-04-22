/* Standalone compiler using solc-js bundled with Hardhat.
 * Works around sandbox environments that block solc binary downloads.
 * Resolves @openzeppelin/* imports from node_modules.
 */
import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';

const root = path.resolve(__dirname, '..');
const sourcesDir = path.join(root, 'contracts');
const outDir = path.join(root, 'artifacts');
const abiBackendDir = path.join(root, 'backend/src/abi');

type SolcInput = {
  language: 'Solidity';
  sources: Record<string, { content: string }>;
  settings: {
    optimizer: { enabled: boolean; runs: number };
    outputSelection: Record<string, Record<string, string[]>>;
    evmVersion?: string;
  };
};

function readAllSources(dir: string): Record<string, { content: string }> {
  const out: Record<string, { content: string }> = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(out, readAllSources(full));
    else if (entry.name.endsWith('.sol')) {
      out[path.relative(root, full).replace(/\\/g, '/')] = {
        content: fs.readFileSync(full, 'utf8'),
      };
    }
  }
  return out;
}

function findImport(importPath: string): { contents: string } | { error: string } {
  const candidates = [
    path.join(root, 'node_modules', importPath),
    path.join(root, importPath),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      return { contents: fs.readFileSync(c, 'utf8') };
    }
  }
  return { error: `File not found: ${importPath}` };
}

function main() {
  const input: SolcInput = {
    language: 'Solidity',
    sources: readAllSources(sourcesDir),
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'metadata'] },
      },
    },
  };

  console.log(`[compile] solc ${solc.version()}`);
  console.log(`[compile] sources: ${Object.keys(input.sources).length} files`);

  const output = JSON.parse(
    solc.compile(JSON.stringify(input), { import: findImport }),
  );

  let hasError = false;
  if (output.errors) {
    for (const e of output.errors) {
      const line = `[${e.severity}] ${e.formattedMessage ?? e.message}`;
      if (e.severity === 'error') {
        hasError = true;
        console.error(line);
      } else {
        console.warn(line);
      }
    }
  }
  if (hasError) process.exit(1);

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(abiBackendDir, { recursive: true });

  for (const [srcPath, contracts] of Object.entries<any>(output.contracts ?? {})) {
    for (const [name, artifact] of Object.entries<any>(contracts)) {
      const artifactPath = path.join(outDir, srcPath, `${name}.json`);
      fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
      const out = {
        contractName: name,
        sourceName: srcPath,
        abi: artifact.abi,
        bytecode: '0x' + artifact.evm.bytecode.object,
        deployedBytecode: '0x' + artifact.evm.deployedBytecode.object,
      };
      fs.writeFileSync(artifactPath, JSON.stringify(out, null, 2));
      if (srcPath.startsWith('contracts/')) {
        const backendAbi = path.join(abiBackendDir, `${name}.json`);
        fs.writeFileSync(
          backendAbi,
          JSON.stringify({ contractName: name, abi: artifact.abi, bytecode: out.bytecode }, null, 2),
        );
        console.log(`[compile] ${srcPath}:${name} -> ${path.relative(root, artifactPath)}`);
        console.log(`[compile] ABI copied to ${path.relative(root, backendAbi)}`);
      }
    }
  }
}

main();
