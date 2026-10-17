import assert from "node:assert/strict";
import test from "node:test";
import { spacingNumericInitial, spacingNumericValue } from "./spacing-numeric-draft.ts";
import { appearanceFields } from "./components/appearance.ts";

const padding = appearanceFields.find(field => field.key === "paddingLeft");
const margin = appearanceFields.find(field => field.key === "marginLeft");

test("numeric drafts validate metadata bounds without snapping fractions", () => {
  for (const [text, expected] of [["12.251", 12.251], ["0", 0], ["1000", 1000], [" .125 ", 0.125], ["+12.0", 12]]) {
    assert.equal(spacingNumericValue(text, padding), expected);
  }
  assert.equal(spacingNumericValue("-1000", margin), -1000);
  assert.equal(spacingNumericValue("-12.251", margin), -12.251);
  for (const text of ["", " ", "NaN", "Infinity", "1e999", "0x10", "12px", "1 2", "-", "1000.001", "-0.001"]) {
    assert.equal(spacingNumericValue(text, padding), null, text);
  }
  assert.equal(spacingNumericValue("-1000.001", margin), null);
});

test("authored fractions survive layout rounding and unchanged numeric spellings", () => {
  const initial = spacingNumericInitial("12.251px", 12.25, padding);
  assert.equal(initial, 12.251);
  assert.equal(spacingNumericValue("12.2510", padding), initial);
  assert.equal(spacingNumericValue(String(initial), padding), initial);
  assert.equal(spacingNumericInitial("-12.251px", -12.25, margin), -12.251);
  for (const authored of ["", "var(--spacing)", "auto", "10%", "NaNpx", "1001px", "-1px"]) {
    assert.equal(spacingNumericInitial(authored, 12.25, padding), 12.25);
  }
});
