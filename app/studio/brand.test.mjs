import assert from "node:assert/strict";
import test from "node:test";
import { brandSvg, brandSvgDataUri } from "./brand.ts";

test("browser-safe brand encoding retains exact UTF-8 base64 output", () => {
  for (const options of [undefined, { color: "#123456", strokeWidth: 10 }, { color: "é雪", strokeWidth: 1 }]) {
    assert.equal(brandSvgDataUri(options), `data:image/svg+xml;base64,${Buffer.from(brandSvg(options)).toString("base64")}`);
  }
});
