import { describe, expect, it } from "vitest";
import { ExampleDto } from "./example";

describe("ExampleDto", () => {
  it("validates a correct payload", () => {
    const r = ExampleDto.safeParse({
      id: "00000000-0000-0000-0000-000000000000",
      createdAt: new Date().toISOString()
    });
    expect(r.success).toBe(true);
  });
});