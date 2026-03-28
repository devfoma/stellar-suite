import { xdr } from "@stellar/stellar-sdk";

/**
 * ScVal types from Stellar SDK
 * These represent the various data types in Soroban smart contracts
 */
export type ScValType =
  | "void"
  | "u64"
  | "i64"
  | "u32"
  | "i32"
  | "u128"
  | "i128"
  | "u256"
  | "i256"
  | "bool"
  | "symbol"
  | "string"
  | "bytes"
  | "map"
  | "vec"
  | "address"
  | "contract"
  | "ledgerkeynonce"
  | "duration"
  | "timepoint"
  | "noncekey"
  | "nonceval"
  | "unknown";

/**
 * Represents a decoded ledger entry with its key and value
 */
export interface DecodedLedgerEntry {
  key: ScValType;
  keyValue: string;
  value: ScValType;
  valueData: string;
  rawKey: string;
  rawValue: string;
  durability?: "persistent" | "temporary" | "instance";
}

/**
 * Converts a base64 encoded XDR string to a readable format
 */
function xdrToBase64(xdrString: string | Buffer): string {
  if (typeof xdrString === "string") {
    return xdrString;
  }
  return Buffer.from(xdrString).toString("base64");
}

/**
 * Decodes a ScVal into a human-readable string
 */
function decodeScVal(scVal: xdr.ScVal): { type: ScValType; value: string } {
  switch (scVal.switch().name) {
    case "scvVoid":
      return { type: "void", value: "(void)" };

    case "scvU64":
      return { type: "u64", value: scVal.u64().toString() };

    case "scvI64":
      return { type: "i64", value: scVal.i64().toString() };

    case "scvU32":
      return { type: "u32", value: scVal.u32().toString() };

    case "scvI32":
      return { type: "i32", value: scVal.i32().toString() };

    case "scvU128":
      return { type: "u128", value: scVal.u128().toString() };

    case "scvI128":
      return { type: "i128", value: scVal.i128().toString() };

    case "scvU256":
      return { type: "u256", value: scVal.u256().toString() };

    case "scvI256":
      return { type: "i256", value: scVal.i256().toString() };

    case "scvBool":
      return { type: "bool", value: scVal.b() ? "true" : "false" };

    case "scvSymbol":
      return { type: "symbol", value: scVal.sym().toString() };

    case "scvString":
      return { type: "string", value: scVal.str().toString() };

    case "scvBytes":
      return {
        type: "bytes",
        value: scVal.bytes().toString("base64"),
      };

    case "scvMap": {
      const mapEntries = scVal.map() ?? [];
      const entries = mapEntries.map((entry) => {
        const key = decodeScVal(entry.key());
        const val = decodeScVal(entry.val());
        return `${key.value}: ${val.value}`;
      });
      return { type: "map", value: `{${entries.join(", ")}}` };
    }

    case "scvVec": {
      const vecValues = scVal.vec() ?? [];
      const values = vecValues.map((v) => {
        const decoded = decodeScVal(v);
        return decoded.value;
      });
      return { type: "vec", value: `[${values.join(", ")}]` };
    }

    case "scvAddress":
      return { type: "address", value: scVal.address().toString() };

    case "scvContractInstance":
      return { type: "contract", value: scVal.instance().toString() };

    case "scvLedgerKeyContractInstance":
      return { type: "contract", value: "(ledger contract instance key)" };

    case "scvLedgerKeyNonce":
      return { type: "ledgerkeynonce", value: scVal.nonceKey().toString() };

    case "scvDuration":
      return { type: "duration", value: scVal.duration().toString() };

    case "scvTimepoint":
      return { type: "timepoint", value: scVal.timepoint().toString() };

    default:
      return { type: "unknown", value: "(unknown type)" };
  }
}

/**
 * Extracts the durability from a ledger key
 */
function getDurability(key: xdr.ScVal): "persistent" | "temporary" | "instance" | undefined {
  // This is a simplified check - in reality you'd need to parse the full key structure
  // For contract data, the key structure tells us about durability
  try {
    const mapVal = key.map();
    if (mapVal) {
      const entries = mapVal.entries?.() ?? [];
      // Look for durability indicator in the key
      for (const [, entry] of entries) {
        const keyVal = decodeScVal(entry.key());
        if (keyVal.value === "durability") {
          const val = decodeScVal(entry.val());
          return val.value as "persistent" | "temporary" | "instance";
        }
      }
    }
  } catch {
    // Not a map, might be instance storage
  }
  return undefined;
}

/**
 * Transforms a raw ledger entry into a decoded entry with human-readable values
 */
export function transformLedgerEntry(
  entry: { key: string | Buffer; val: string | Buffer },
): DecodedLedgerEntry {
  // Decode the key XDR
  const rawKey = xdrToBase64(entry.key);
  const keyXdr = typeof entry.key === "string"
    ? xdr.ScVal.fromXDR(entry.key, "base64")
    : xdr.ScVal.fromXDR(Buffer.from(entry.key), "raw");
  const keyDecoded = decodeScVal(keyXdr);

  // Decode the value XDR
  const rawValue = xdrToBase64(entry.val);
  const valXdr = typeof entry.val === "string"
    ? xdr.ScVal.fromXDR(entry.val, "base64")
    : xdr.ScVal.fromXDR(Buffer.from(entry.val), "raw");
  const valDecoded = decodeScVal(valXdr);

  // Determine durability from the key
  const durability = getDurability(keyXdr);

  return {
    key: keyDecoded.type,
    keyValue: keyDecoded.value,
    value: valDecoded.type,
    valueData: valDecoded.value,
    rawKey,
    rawValue,
    durability,
  };
}

/**
 * Filters decoded ledger entries by key type
 */
export function filterByKeyType(
  entries: DecodedLedgerEntry[],
  filter: "all" | "persistent" | "temporary" | "instance",
): DecodedLedgerEntry[] {
  if (filter === "all") {
    return entries;
  }
  return entries.filter((entry) => entry.durability === filter);
}

/**
 * Searches entries by key or value content
 */
export function searchEntries(
  entries: DecodedLedgerEntry[],
  searchTerm: string,
): DecodedLedgerEntry[] {
  const term = searchTerm.toLowerCase();
  return entries.filter(
    (entry) =>
      entry.keyValue.toLowerCase().includes(term) ||
      entry.valueData.toLowerCase().includes(term) ||
      entry.key.toLowerCase().includes(term) ||
      entry.value.toLowerCase().includes(term),
  );
}

/**
 * Formats a ScVal as JSON for pretty printing
 */
export function formatScValAsJson(scVal: xdr.ScVal | string): string {
  try {
    const decoded =
      typeof scVal === "string"
        ? xdr.ScVal.fromXDR(scVal, "base64")
        : scVal;
    return JSON.stringify(decodeScVal(decoded), null, 2);
  } catch {
    return JSON.stringify({ error: "Failed to decode ScVal" }, null, 2);
  }
}