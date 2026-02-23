import { describe, expect, it } from "vitest";
import { parseDuckDuckGoLiteSnapshot } from "./web-search-browser.js";

describe("parseDuckDuckGoLiteSnapshot", () => {
  it("parses numbered DDG lite results", () => {
    const snapshot = `
Web results:

1. TypeScript: JavaScript With Syntax For Types
   https://www.typescriptlang.org/
   TypeScript is a strongly typed programming language that builds on JavaScript.

2. TypeScript - Wikipedia
   https://en.wikipedia.org/wiki/TypeScript
   TypeScript is a free and open-source high-level programming language developed by Microsoft.

3. TypeScript Tutorial
   https://www.w3schools.com/typescript/
   Learn TypeScript with examples and exercises.
`;

    const results = parseDuckDuckGoLiteSnapshot(snapshot, 5);

    expect(results).toHaveLength(3);

    expect(results[0].url).toBe("https://www.typescriptlang.org/");
    expect(results[0].siteName).toBe("typescriptlang.org");

    expect(results[1].url).toBe("https://en.wikipedia.org/wiki/TypeScript");
    expect(results[1].siteName).toBe("en.wikipedia.org");

    expect(results[2].url).toBe("https://www.w3schools.com/typescript/");
    expect(results[2].siteName).toBe("w3schools.com");
  });

  it("respects maxResults limit", () => {
    const snapshot = `
1. Result One
   https://example.com/1
   First result

2. Result Two
   https://example.com/2
   Second result

3. Result Three
   https://example.com/3
   Third result
`;

    const results = parseDuckDuckGoLiteSnapshot(snapshot, 2);
    expect(results).toHaveLength(2);
    expect(results[0].url).toBe("https://example.com/1");
    expect(results[1].url).toBe("https://example.com/2");
  });

  it("returns empty array for text without numbered results", () => {
    const snapshot = "No results found for your query.";
    const results = parseDuckDuckGoLiteSnapshot(snapshot, 5);
    expect(results).toHaveLength(0);
  });

  it("skips entries without a valid URL", () => {
    const snapshot = `
1. Some title without URL
   Just a description with no link

2. Valid Result
   https://example.com/valid
   Has a proper URL
`;

    const results = parseDuckDuckGoLiteSnapshot(snapshot, 5);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe("https://example.com/valid");
  });

  it("handles URLs with query parameters and fragments", () => {
    const snapshot = `
1. Complex URL Result
   https://example.com/path?q=test&page=2#section
   Description of the result
`;

    const results = parseDuckDuckGoLiteSnapshot(snapshot, 5);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe("https://example.com/path?q=test&page=2#section");
  });

  it("handles empty input", () => {
    expect(parseDuckDuckGoLiteSnapshot("", 5)).toHaveLength(0);
  });
});
