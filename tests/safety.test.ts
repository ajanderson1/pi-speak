import { describe, expect, it } from "vitest";
import { redactForExternalUse } from "../src/safety.ts";

describe("redactForExternalUse", () => {
  it("redacts API-key assignments before external use", () => {
    const result = redactForExternalUse("api_key=api-key");

    expect(result.text).not.toContain("api-key");
    expect(result.text).toContain("[redacted]");
    expect(result.safe).toBe(true);
  });

  it("redacts authorization and password values", () => {
    const result = redactForExternalUse(
      "Authorization: Bearer example-token\npassword: example-password",
    );

    expect(result.text).toBe("Authorization: [redacted]\npassword: [redacted]");
  });

  it("refuses to send private-key material externally", () => {
    const result = redactForExternalUse("-----BEGIN PRIVATE KEY-----\nexample");

    expect(result.safe).toBe(false);
    expect(result.text).toBe("");
  });
});
