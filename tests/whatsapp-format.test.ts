import { describe, expect, it } from "vitest";
import { parseWhatsApp, runsToWhatsApp, whatsAppToEditorHtml } from "@/lib/whatsapp-format";

describe("WhatsApp formatter copy (editor styles -> symbols)", () => {
  it("wraps each style in the right symbols", () => {
    expect(runsToWhatsApp([
      { text: "Viewing " }, { text: "confirmed", bold: true }, { text: " at " },
      { text: "2 pm", italic: true }, { text: " " }, { text: "old", strike: true }, { text: " " }, { text: "REF-01", mono: true },
    ])).toBe("Viewing *confirmed* at _2 pm_ ~old~ ```REF-01```");
  });

  it("combines styles on the same words", () => {
    expect(runsToWhatsApp([{ text: "hi", bold: true, italic: true }])).toBe("*_hi_*");
    expect(runsToWhatsApp([{ text: "hi", bold: true, mono: true }])).toBe("*```hi```*");
  });

  it("keeps spaces outside the symbols so WhatsApp still formats it", () => {
    expect(runsToWhatsApp([{ text: "say" }, { text: " hi ", bold: true }, { text: "now" }])).toBe("say *hi* now");
  });

  it("wraps every line on its own", () => {
    expect(runsToWhatsApp([{ text: "one\ntwo", bold: true }])).toBe("*one*\n*two*");
  });

  it("joins neighbouring pieces with the same style", () => {
    expect(runsToWhatsApp([{ text: "he", bold: true }, { text: "llo", bold: true }])).toBe("*hello*");
  });

  it("drops empty lines at the end", () => {
    expect(runsToWhatsApp([{ text: "hi\n\n" }])).toBe("hi");
  });
});

describe("WhatsApp formatter preview", () => {
  it("hides the symbols even when they touch other words", () => {
    expect(parseWhatsApp("dgds*_~```text```~_*")).toEqual([
      { type: "text", value: "dgds" },
      { type: "bold", children: [{ type: "italic", children: [{ type: "strike", children: [{ type: "mono", value: "text" }] }] }] },
    ]);
  });

  it("keeps a lone symbol as normal text", () => {
    expect(parseWhatsApp("5 * 3 = 15")).toEqual([{ type: "text", value: "5 * 3 = 15" }]);
  });

  it("does not join marks across lines", () => {
    expect(parseWhatsApp("a*b\nc*d")).toEqual([{ type: "text", value: "a*b\nc*d" }]);
  });
});

describe("pasting a WhatsApp message into the editor", () => {
  it("turns symbols into real styles and escapes HTML", () => {
    expect(whatsAppToEditorHtml("*hi* <b>\n~x~ ```y```")).toBe('<b>hi</b> &lt;b&gt;<br><strike>x</strike> <font face="monospace">y</font>');
  });
});
