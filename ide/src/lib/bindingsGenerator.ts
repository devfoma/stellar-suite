import type { FileNode } from "@/lib/sample-contracts";

export interface BindingParameter {
  name: string;
  type: string;
}

export interface BindingFunction {
  name: string;
  inputs: BindingParameter[];
  output: string;
}

export interface BindingsExportResult {
  contractName: string;
  filename: string;
  mode: "abi" | "rust-lite";
  source: string;
}

const ABI_FILE_PATTERN = /(abi|bindings|contractspec|spec).*\.json$/i;

const toPascalCase = (value: string) =>
  value
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

const normaliseIdentifier = (value: string, fallback: string) => {
  const cleaned = value.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^[^a-zA-Z_]+/, "");
  return cleaned || fallback;
};

const splitTopLevel = (value: string, delimiter: string) => {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
    if (char === "<" || char === "(" || char === "[" || char === "{") depth += 1;
    if (char === ">" || char === ")" || char === "]" || char === "}") depth = Math.max(0, depth - 1);

    if (char === delimiter && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
};

const rustTypeToTs = (rawType: string): string => {
  const value = rawType.trim().replace(/\s+/g, " ");

  if (!value || value === "()") return "void";
  if (value.startsWith("&")) return rustTypeToTs(value.slice(1));
  if (value.startsWith("Result<")) {
    const inner = splitTopLevel(value.slice("Result<".length, -1), ",")[0] ?? "unknown";
    return rustTypeToTs(inner);
  }
  if (value.startsWith("Option<")) {
    return `${rustTypeToTs(value.slice("Option<".length, -1))} | null`;
  }
  if (value.startsWith("Vec<")) {
    return `${rustTypeToTs(value.slice("Vec<".length, -1))}[]`;
  }
  if (value.startsWith("Map<")) {
    const [keyType, valueType] = splitTopLevel(value.slice("Map<".length, -1), ",");
    return `Record<${rustTypeToTs(keyType ?? "string")}, ${rustTypeToTs(valueType ?? "unknown")}>`;
  }
  if (value.startsWith("(") && value.endsWith(")")) {
    const members = splitTopLevel(value.slice(1, -1), ",").map((member) => rustTypeToTs(member));
    return members.length > 0 ? `[${members.join(", ")}]` : "void";
  }

  switch (value) {
    case "bool":
      return "boolean";
    case "String":
    case "str":
    case "Symbol":
    case "Bytes":
    case "BytesN":
    case "Address":
      return "string";
    case "u32":
    case "i32":
    case "usize":
    case "isize":
      return "number";
    case "u64":
    case "i64":
    case "u128":
    case "i128":
    case "u256":
    case "i256":
      return "bigint";
    default:
      return normaliseIdentifier(value, "unknown");
  }
};

const abiTypeToTs = (value: unknown): string => {
  if (typeof value === "string") {
    return rustTypeToTs(value);
  }

  if (!value || typeof value !== "object") {
    return "unknown";
  }

  const record = value as Record<string, unknown>;

  if (typeof record.type === "string") {
    return abiTypeToTs(record.type);
  }

  if (record.option) {
    return `${abiTypeToTs(record.option)} | null`;
  }

  if (record.vec) {
    return `${abiTypeToTs(record.vec)}[]`;
  }

  if (record.map && typeof record.map === "object") {
    const mapShape = record.map as Record<string, unknown>;
    return `Record<${abiTypeToTs(mapShape.key ?? "string")}, ${abiTypeToTs(mapShape.value ?? "unknown")}>`;
  }

  if (Array.isArray(record.tuple)) {
    return `[${record.tuple.map((entry) => abiTypeToTs(entry)).join(", ")}]`;
  }

  return "unknown";
};

const findContractNode = (nodes: FileNode[], contractFolderName: string | undefined): FileNode | null => {
  if (!contractFolderName) return nodes[0] ?? null;
  return nodes.find((node) => node.type === "folder" && node.name === contractFolderName) ?? null;
};

const flattenFiles = (nodes: FileNode[], parentPath: string[] = []) =>
  nodes.flatMap((node) => {
    const nextPath = [...parentPath, node.name];

    if (node.type === "folder") {
      return flattenFiles(node.children ?? [], nextPath);
    }

    return [{ path: nextPath, node }];
  });

const findBestAbiCandidate = (contractNode: FileNode) => {
  const files = flattenFiles(contractNode.children ?? [], [contractNode.name]).filter(
    ({ node }) => node.type === "file"
  );

  return files.find(({ node }) => ABI_FILE_PATTERN.test(node.name));
};

const inferFunctionsFromAbi = (rawAbi: unknown): BindingFunction[] => {
  const root = Array.isArray(rawAbi)
    ? rawAbi
    : typeof rawAbi === "object" && rawAbi !== null
      ? ((rawAbi as Record<string, unknown>).functions ??
          (rawAbi as Record<string, unknown>).methods ??
          (rawAbi as Record<string, unknown>).entries ??
          (rawAbi as Record<string, unknown>).spec ??
          [])
      : [];

  if (!Array.isArray(root)) return [];

  return root
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name : typeof record.function === "string" ? record.function : null;
      if (!name) return null;

      const inputEntries = Array.isArray(record.inputs)
        ? record.inputs
        : Array.isArray(record.args)
          ? record.args
          : Array.isArray(record.params)
            ? record.params
            : [];

      const outputEntries = Array.isArray(record.outputs)
        ? record.outputs
        : Array.isArray(record.returns)
          ? record.returns
          : record.output != null
            ? [record.output]
            : [];

      const inputs = inputEntries.map((input, inputIndex) => {
        const inputRecord = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
        const inputName =
          typeof inputRecord.name === "string"
            ? inputRecord.name
            : typeof inputRecord.arg === "string"
              ? inputRecord.arg
              : `arg${inputIndex + 1}`;

        return {
          name: normaliseIdentifier(inputName, `arg${inputIndex + 1}`),
          type: abiTypeToTs(inputRecord.type ?? inputRecord.value ?? input),
        };
      });

      const output = outputEntries.length === 0
        ? "void"
        : outputEntries.length === 1
          ? abiTypeToTs(
              typeof outputEntries[0] === "object" && outputEntries[0] !== null
                ? ((outputEntries[0] as Record<string, unknown>).type ?? outputEntries[0])
                : outputEntries[0]
            )
          : `[${outputEntries
              .map((outputEntry) =>
                abiTypeToTs(
                  typeof outputEntry === "object" && outputEntry !== null
                    ? ((outputEntry as Record<string, unknown>).type ?? outputEntry)
                    : outputEntry
                )
              )
              .join(", ")}]`;

      return {
        name: normaliseIdentifier(name, `method${index + 1}`),
        inputs,
        output,
      } satisfies BindingFunction;
    })
    .filter((entry): entry is BindingFunction => Boolean(entry));
};

const inferFunctionsFromRust = (content: string): BindingFunction[] => {
  const matches = content.matchAll(
    /pub\s+fn\s+([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*(?:->\s*([^{\n]+))?\s*\{/g
  );

  return Array.from(matches).map((match) => {
    const name = normaliseIdentifier(match[1] ?? "", "method");
    const argsBlock = match[2] ?? "";
    const outputType = rustTypeToTs(match[3] ?? "void");
    const inputs = splitTopLevel(argsBlock, ",")
      .map((segment) => segment.trim())
      .filter(Boolean)
      .filter((segment) => !/^&?self$/.test(segment) && !segment.startsWith("env:"))
      .map((segment, index) => {
        const [rawName, ...typeParts] = segment.split(":");
        return {
          name: normaliseIdentifier(rawName?.trim() ?? `arg${index + 1}`, `arg${index + 1}`),
          type: rustTypeToTs(typeParts.join(":")),
        };
      });

    return {
      name,
      inputs,
      output: outputType,
    };
  });
};

const renderArgsType = (fn: BindingFunction) => {
  if (fn.inputs.length === 0) return "";
  return `{ ${fn.inputs.map((input) => `${input.name}: ${input.type}`).join("; ")} }`;
};

const renderBindingsSource = (
  contractName: string,
  functions: BindingFunction[],
  mode: "abi" | "rust-lite"
) => {
  const className = `${toPascalCase(contractName)}Client`;
  const typeName = `${toPascalCase(contractName)}Bindings`;
  const methodUnion = functions.length
    ? functions.map((fn) => `"${fn.name}"`).join(" | ")
    : "never";

  const interfaceLines = functions.map((fn) => {
    const args = renderArgsType(fn);
    return `  ${fn.name}(${args ? `args: ${args}` : ""}): Promise<${fn.output}>;`;
  });

  const methodLines = functions.map((fn) => {
    const args = renderArgsType(fn);
    const invokeArgs = args ? "args" : "undefined";

    return [
      `  async ${fn.name}(${args ? `args: ${args}` : ""}): Promise<${fn.output}> {`,
      `    return this.invoke<${fn.output}>("${fn.name}", ${invokeArgs});`,
      "  }",
    ].join("\n");
  });

  return [
    `// Auto-generated by Stellar Suite IDE (${mode}).`,
    `// This file is a lightweight TypeScript client surface for the current contract.`,
    "",
    `export type ${className}Method = ${methodUnion};`,
    "",
    `export interface ${typeName} {`,
    ...(interfaceLines.length > 0 ? interfaceLines : ["  // No exported contract methods were detected."]),
    "}",
    "",
    `export class ${className} implements ${typeName} {`,
    `  constructor(`,
    `    private readonly invoke: <T = unknown>(`,
    `      method: ${className}Method,`,
    `      args?: Record<string, unknown>`,
    `    ) => Promise<T>`,
    `  ) {}`,
    "",
    ...(methodLines.length > 0 ? methodLines : ["  // No callable methods generated."]),
    "}",
    "",
  ].join("\n");
};

export const createBindingsExportFromWorkspace = (
  files: FileNode[],
  activeTabPath: string[]
): BindingsExportResult => {
  const contractNode = findContractNode(files, activeTabPath[0]);

  if (!contractNode || contractNode.type !== "folder") {
    throw new Error("Open a contract folder before exporting JS bindings.");
  }

  const contractName = contractNode.name;
  const abiCandidate = findBestAbiCandidate(contractNode);

  if (abiCandidate?.node.content) {
    try {
      const parsed = JSON.parse(abiCandidate.node.content);
      const functions = inferFunctionsFromAbi(parsed);

      if (functions.length > 0) {
        return {
          contractName,
          filename: `${contractName}.bindings.ts`,
          mode: "abi",
          source: renderBindingsSource(contractName, functions, "abi"),
        };
      }
    } catch {
      // Fall back to Rust source inference if ABI JSON is invalid.
    }
  }

  const rustEntry = flattenFiles(contractNode.children ?? [], [contractNode.name]).find(
    ({ node, path }) => node.type === "file" && (node.name === "lib.rs" || path[path.length - 1]?.endsWith(".rs"))
  );

  if (!rustEntry?.node.content) {
    throw new Error("No ABI JSON or Rust contract source was found for the active contract.");
  }

  const functions = inferFunctionsFromRust(rustEntry.node.content);

  if (functions.length === 0) {
    throw new Error("Could not infer exported contract methods from the active workspace files.");
  }

  return {
    contractName,
    filename: `${contractName}.bindings.ts`,
    mode: "rust-lite",
    source: renderBindingsSource(contractName, functions, "rust-lite"),
  };
};

export const downloadBindingsFile = (result: BindingsExportResult) => {
  const blob = new Blob([result.source], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.filename;
  anchor.click();
  URL.revokeObjectURL(url);
};
