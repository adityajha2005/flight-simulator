const BLOCKED = new Set([
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

export function createInput() {
  const down = new Set();

  const onKeyDown = (event) => {
    if (BLOCKED.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    down.add(event.code);
  };

  const onKeyUp = (event) => {
    down.delete(event.code);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", () => down.clear());

  return {
    down,
    sample() {
      const noseUp = down.has("KeyW") || down.has("ArrowUp");
      const noseDown = down.has("KeyS") || down.has("ArrowDown");
      const rollRight = down.has("KeyD") || down.has("ArrowRight");
      const rollLeft = down.has("KeyA") || down.has("ArrowLeft");
      return {
        pitch: (noseUp ? 1 : 0) - (noseDown ? 1 : 0),
        roll: (rollRight ? 1 : 0) - (rollLeft ? 1 : 0),
        yaw: (down.has("KeyE") ? 1 : 0) - (down.has("KeyQ") ? 1 : 0),
        throttleUp: down.has("ShiftLeft") || down.has("ShiftRight"),
        throttleDown: down.has("ControlLeft") || down.has("ControlRight"),
        brake: down.has("Space"),
        helpPressed: down.has("KeyH"),
        restartPressed: down.has("KeyR"),
      };
    },
  };
}
