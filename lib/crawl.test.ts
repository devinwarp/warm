import { describe, expect, it } from "vitest";
import { htmlToText } from "./crawl";

describe("htmlToText", () => {
  it("drops script and style bodies, keeps prose", () => {
    const html = `
      <html><head><style>.a{color:red}</style></head>
      <body><script>var x = "Book now";</script>
      <h1>Serene Skin &amp; Hair</h1><p>Open 10am&nbsp;&ndash; 8pm</p></body></html>`;

    const text = htmlToText(html);

    expect(text).toContain("Serene Skin & Hair");
    expect(text).toContain("Open 10am");
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("var x");
  });
});
