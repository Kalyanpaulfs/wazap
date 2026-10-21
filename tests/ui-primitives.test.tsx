import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, IconButton, Input, Progress, Switch, Badge, cx, initials, nextTabIndex } from "@/app/ui";

describe("ui helpers", () => {
  it("cx drops falsy values", () => {
    expect(cx("a", false, null, undefined, "b")).toBe("a b");
  });

  it("initials uses up to two words and a fallback", () => {
    expect(initials("asha kumar rao")).toBe("AK");
    expect(initials("  ")).toBe("?");
  });

  it("nextTabIndex wraps and respects RTL", () => {
    expect(nextTabIndex("ArrowRight", 2, 3)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(nextTabIndex("ArrowRight", 0, 3, true)).toBe(2);
    expect(nextTabIndex("Home", 2, 3)).toBe(0);
    expect(nextTabIndex("End", 0, 3)).toBe(2);
    expect(nextTabIndex("a", 0, 3)).toBeNull();
  });
});

describe("ui markup and accessibility", () => {
  it("Button defaults to type=button and exposes loading via aria-busy", () => {
    const html = renderToStaticMarkup(<Button loading>Save</Button>);
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-busy="true"');
  });

  it("IconButton always has an accessible name", () => {
    expect(renderToStaticMarkup(<IconButton label="Close">x</IconButton>)).toContain('aria-label="Close"');
  });

  it("Input links its label, error and aria-invalid", () => {
    const html = renderToStaticMarkup(<Input label="Email" error="Required" />);
    expect(html).toMatch(/<label for="([^"]+)"/);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("Required");
    const id = html.match(/<label for="([^"]+)"/)![1];
    expect(html).toContain(`id="${id}"`);
    expect(html).toContain(`aria-describedby="${id}-note"`);
  });

  it("Progress clamps its value", () => {
    expect(renderToStaticMarkup(<Progress value={180} label="Quota" />)).toContain('aria-valuenow="100"');
    expect(renderToStaticMarkup(<Progress value={-5} label="Quota" />)).toContain('aria-valuenow="0"');
  });

  it("Switch reports its state", () => {
    const html = renderToStaticMarkup(<Switch checked onChange={() => {}} label="Routing" />);
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
  });

  it("Badge renders its tone", () => {
    expect(renderToStaticMarkup(<Badge tone="danger">Failed</Badge>)).toContain("text-danger");
  });
});
