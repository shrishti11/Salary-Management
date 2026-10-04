import { describe, expect, it } from "vitest";

import { csvCell, toCsv } from "./csv";

describe("csvCell", () => {
  it("leaves plain values alone and renders null as empty", () => {
    expect(csvCell("Asha")).toBe("Asha");
    expect(csvCell(12.5)).toBe("12.5");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(csvCell("Rao, Asha")).toBe('"Rao, Asha"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });

  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("-5")).toBe("'-5");
  });
});

describe("toCsv", () => {
  it("writes a BOM, a header, CRLF rows and a trailing newline", () => {
    expect(toCsv(["a", "b"], [["1", "x,y"]])).toBe('﻿a,b\r\n1,"x,y"\r\n');
  });
});
