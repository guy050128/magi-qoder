/** Keep DOM viewport coordinates aligned with the actual fixed canvas box.
 * Safari's keyboard/toolbar can make innerHeight differ from CSS vh. */
export function fitParticleCanvas(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  devicePixelRatio: number,
) {
  const box = canvas.getBoundingClientRect();
  if (![box.left, box.top, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) {
    throw new Error("Missing particle canvas geometry");
  }
  const dpr = Math.min(Math.max(devicePixelRatio || 1, 1), 2);
  canvas.width = Math.ceil(box.width * dpr);
  canvas.height = Math.ceil(box.height * dpr);
  const sx = canvas.width / box.width;
  const sy = canvas.height / box.height;
  context.setTransform(sx, 0, 0, sy, -box.left * sx, -box.top * sy);
}
