import { describe, expect, it } from "vitest";
import { redact } from "./redact.js";

describe("redact", () => {
  it("redacts sensitive keys recursively", () => {
    const x = redact({
      email: "a@b.com",
      profile: { phone: "0200000000" },
      ok: "yes"
    });
    expect(x).toEqual({
      email: "[REDACTED]",
      profile: { phone: "[REDACTED]" },
      ok: "yes"
    });
  });
});

