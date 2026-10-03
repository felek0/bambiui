import assert from "node:assert/strict";
import test from "node:test";
import { toScene, toViewport, zoomAt, clampZoom, sceneBounds, fitCamera, INITIAL_CAMERA } from "./camera.ts";
import { geometryDraft, frameIdRemap, movedFrame, nextFramePosition } from "./frames.ts";
import { createComposerFrame } from "./model.ts";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test("camera inverse preserves translated negative coordinates at every zoom", () => {
  for (const zoom of [0.1, 0.5, 1, 2, 4]) {
    const point = { x: -180, y: 750 }, camera = { x: 42, y: -65, zoom };
    const inverse = toScene(toViewport(point, camera), camera);
    near(inverse.x, point.x); near(inverse.y, point.y);
  }
});
test("pointer anchored zoom remains anchored even at the bounds", () => {
  const camera = { x: -21, y: 41, zoom: 0.7 }, pointer = { x: 327, y: 128 }, scene = toScene(pointer, camera);
  for (const target of [0.001, 0.1, 1, 4, 100]) {
    const next = zoomAt(camera, target, pointer), projected = toViewport(scene, next);
    near(projected.x, pointer.x); near(projected.y, pointer.y); assert.equal(next.zoom, clampZoom(target));
  }
});
test("fit centers all independent frames including title bounds, without changing geometry", () => {
  const frames = [createComposerFrame("a", "roota"), { ...createComposerFrame("b", "rootb", "mobile"), x: 1520, y: -100 }];
  const before = structuredClone(frames), bounds = sceneBounds(frames), camera = fitCamera(bounds, { width: 900, height: 600 });
  assert.deepEqual(bounds, { x: 0, y: -136, width: 1910, height: 1036 });
  const start = toViewport(bounds, camera), end = toViewport({ x: bounds.x + bounds.width, y: bounds.y + bounds.height }, camera);
  assert.ok(start.x >= 32 && start.y >= 32 && end.x <= 868 && end.y <= 568);
  assert.deepEqual(frames, before); assert.deepEqual(fitCamera(null, { width: 1, height: 1 }), INITIAL_CAMERA);
  assert.equal(fitCamera(bounds, { width: 1, height: 1 }).zoom, 0.1);
});
test("geometry drafts reject blank, partial and invalid values without rounding historical decimals", () => {
  for (const draft of ["", " ", "-", "NaN", "Infinity", "10001", "0", "1e"]) assert.equal(geometryDraft(draft, "width"), null);
  assert.equal(geometryDraft("123.456", "height"), 123.456);
  assert.equal(geometryDraft("-0.75", "x"), -0.75);
  assert.equal(geometryDraft("-100001", "y"), null);
});
test("duplicate map includes exactly root and descendants and positions do not overlap", () => {
  const frame = createComposerFrame("f", "root"); frame.root.children = [{ id: "text", kind: "text", text: "Hello" }];
  let id = 0;
  assert.deepEqual({ ...frameIdRemap(frame, () => `n${++id}`).nodeIds }, { root: "n1", text: "n2" });
  assert.deepEqual(nextFramePosition([frame]), { x: 1520, y: 0 });
  assert.deepEqual(movedFrame(frame, 200000, -200000), { x: 100000, y: -100000 });
  assert.equal(frame.x, 0);
});
