import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("routing cache", () => {
  it("never throws when the cache dir can't be created (prod 500 on rotator create, 19 Oct)", async () => {
    // A directory "inside" a regular file can never be created.
    const file = path.join(mkdtempSync(path.join(tmpdir(), "rc-")), "not-a-dir");
    writeFileSync(file, "");
    vi.resetModules();
    vi.stubEnv("WAZAP_ROUTING_CACHE_DIR", path.join(file, "cache"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { cacheRoute } = await import("@/lib/routing-cache");
    await expect(cacheRoute({ code: "ABC123", numbers: ["919876543210"], currentIdx: 0 })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    vi.unstubAllEnvs();
  });
});
