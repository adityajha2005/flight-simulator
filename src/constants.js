export const GEAR_HEIGHT = 3.4;
export const WHEEL_RADIUS = 0.48;

export const MPS_TO_KNOTS = 1.943844;
export const METERS_TO_FEET = 3.28084;
export const MPS_TO_FPM = 196.8504;

export function wrapPi(angle) {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function headingDegrees(radians) {
  const deg = (radians * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}
