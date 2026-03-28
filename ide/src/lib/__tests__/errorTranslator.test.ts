/**
 * src/lib/__tests__/errorTranslator.test.ts
 * ============================================================
 * Test suite for ErrorTranslator service
 * ============================================================
 */

import { describe, it, expect } from "vitest";
import { ErrorTranslator } from "../errorTranslator";

describe("ErrorTranslator", () => {
  it("translates host error codes to human-readable messages", () => {
    const result = ErrorTranslator.translate("Error 115: Authorization failed", { operation: "contract invocation" });
    expect(result.title).toBeTruthy();
    expect(result.message).toBeTruthy();
    expect(result.details.errorType).toBe("host-error");
  });

  it("translates unauthorized/access-denied keyword errors", () => {
    const result = ErrorTranslator.translate("unauthorized access denied", { functionName: "transfer" });
    expect(result.severity).toBe("error");
    expect(result.details.errorType).toBeTruthy();
  });

  it("translates RPC errors", () => {
    const result = ErrorTranslator.translate("RPC method not found: simulateTransaction", { operation: "simulation" });
    expect(result.title).toBeTruthy();
    expect(result.details.errorType).toBe("rpc-error");
  });

  it("falls back gracefully for unknown errors", () => {
    const result = ErrorTranslator.translate("Something went terribly wrong");
    expect(result.title).toBeTruthy();
    expect(result.code).toBeTruthy();
  });

  it("formatForDisplay returns title and description", () => {
    const translated = ErrorTranslator.translate("Error 107", { functionName: "transfer" });
    const formatted = ErrorTranslator.formatForDisplay(translated, false);
    expect(formatted.title).toBe(translated.title);
    expect(formatted.description).toContain(translated.message);
  });
});