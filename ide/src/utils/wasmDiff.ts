/**
 * wasmDiff.ts
 *
 * Utility for byte-level and symbolic comparison of two WASM binaries.
 */

export interface WasmSymbol {
  name: string;
  kind: string;
  module?: string; // only for imports
}

export interface DiffResult {
  sizeDiff: number;
  newExports: string[];
  removedExports: string[];
  newImports: WasmSymbol[];
  removedImports: WasmSymbol[];
  modifiedBytes: number;
  totalBytes: number;
}

export const analyzeWasm = async (buffer: Uint8Array) => {
  try {
    const module = await WebAssembly.compile(buffer as any);
    const exports = WebAssembly.Module.exports(module);
    const imports = WebAssembly.Module.imports(module);
    
    return {
      exports: exports.map(e => e.name),
      imports: imports.map(i => ({ name: i.name, kind: i.kind, module: i.module })),
    };
  } catch (error) {
    console.error("Failed to analyze WASM:", error);
    return { exports: [], imports: [] };
  }
};

export const compareWasm = async (oldWasm: Uint8Array, newWasm: Uint8Array): Promise<DiffResult> => {
  const oldAnalysis = await analyzeWasm(oldWasm);
  const newAnalysis = await analyzeWasm(newWasm);

  const newExports = newAnalysis.exports.filter(e => !oldAnalysis.exports.includes(e));
  const removedExports = oldAnalysis.exports.filter(e => !newAnalysis.exports.includes(e));

  const newImports = newAnalysis.imports.filter(ni => 
    !oldAnalysis.imports.some(oi => oi.name === ni.name && oi.kind === ni.kind && oi.module === ni.module)
  );
  const removedImports = oldAnalysis.imports.filter(oi => 
    !newAnalysis.imports.some(ni => ni.name === oi.name && ni.kind === oi.kind && ni.module === oi.module)
  );

  // Byte-level diff: find number of differing bytes
  let modifiedBytes = 0;
  const minLength = Math.min(oldWasm.length, newWasm.length);
  for (let i = 0; i < minLength; i++) {
    if (oldWasm[i] !== newWasm[i]) {
      modifiedBytes++;
    }
  }
  // Add remaining bytes if lengths differ
  modifiedBytes += Math.abs(oldWasm.length - newWasm.length);

  return {
    sizeDiff: newWasm.length - oldWasm.length,
    newExports,
    removedExports,
    newImports,
    removedImports,
    modifiedBytes,
    totalBytes: newWasm.length,
  };
};

export const formatHex = (buffer: Uint8Array, offset: number, length: number = 16) => {
  const slice = buffer.slice(offset, offset + length);
  const hex = Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' ');
  const ascii = Array.from(slice).map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
  return { hex, ascii };
};
