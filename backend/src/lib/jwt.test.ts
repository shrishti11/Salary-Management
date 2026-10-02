import { describe, expect, it } from "vitest";

import { signToken, verifyToken } from "./jwt";

describe("jwt", () => {
  it("round-trips a payload through sign and verify", () => {
    const token = signToken({ sub: "user-123", role: "ADMIN" });
    const decoded = verifyToken(token);

    expect(decoded.sub).toBe("user-123");
    expect(decoded.role).toBe("ADMIN");
  });

  it("throws when verifying a tampered token", () => {
    const token = signToken({ sub: "user-123", role: "ADMIN" });
    const tampered = `${token}tampered`;

    expect(() => verifyToken(tampered)).toThrow();
  });

  it("throws when verifying garbage input", () => {
    expect(() => verifyToken("not-a-jwt")).toThrow();
  });
});
