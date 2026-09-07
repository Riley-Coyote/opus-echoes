import { test, expect } from "bun:test";
import * as THREE from "three";
const savedWindow = globalThis.window;
globalThis.window = { matchMedia: () => ({ matches: false }) };
const { makeHover } = await import("../public/sanctuary-world/lab/door-common.js");
if (savedWindow === undefined) delete globalThis.window;
else globalThis.window = savedWindow;

test("furniture blocks room picks while rigid-batch source geometry stays pickable", () => {
  const saved = globalThis.document;
  globalThis.document = { createElement: () => ({ style: {} }) };
  try {
    const target = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.1), new THREE.MeshBasicMaterial());
    const blocker = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.4), new THREE.MeshBasicMaterial());
    blocker.position.z = 2;
    target.updateMatrixWorld();
    blocker.updateMatrixWorld();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 5;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const pointer = new THREE.Vector2(0, 0),
      parent = { appendChild() {} },
      dom = { capEl: { parentNode: parent }, canvas: { style: {} } };
    const defaultHover = makeHover(dom);
    defaultHover.setPicks([{ id: "board", root: target }]);
    expect(defaultHover.pickAt(pointer, camera)?.id).toBe("board");
    const roomHover = makeHover({ ...dom, occluders: [blocker] });
    roomHover.setPicks([{ id: "board", root: target }]);
    expect(roomHover.pickAt(pointer, camera)).toBeNull();
    blocker.position.x = 3;
    blocker.updateMatrixWorld();
    target.visible = false;
    target.userData.stationBatchSource = true;
    expect(roomHover.pickAt(pointer, camera)?.id).toBe("board");
  } finally {
    if (saved === undefined) delete globalThis.document;
    else globalThis.document = saved;
  }
});
