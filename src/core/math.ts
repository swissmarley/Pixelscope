export function random(seed: number) {
  let n = seed >>> 0;
  return () => {
    n += 0x6d2b79f5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function gaussian(r: () => number) {
  return (
    Math.sqrt(-2 * Math.log(Math.max(r(), 1e-9))) * Math.cos(2 * Math.PI * r())
  );
}
export function sigmaAt(step: number, total: number) {
  return Math.max(0, 1 - step / Math.max(1, total)) ** 1.5;
}
export function cfg(unconditional: number, conditional: number, scale: number) {
  return unconditional + scale * (conditional - unconditional);
}
export function noising(signal: number, noise: number, alpha: number) {
  return Math.sqrt(alpha) * signal + Math.sqrt(1 - alpha) * noise;
}
