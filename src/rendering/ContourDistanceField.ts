import { imageFromBase64 } from "./image";

const FAR = 1e20;
const yieldToPane = () => new Promise<void>(resolve => window.setTimeout(resolve, 0));

/** Exact squared Euclidean distance transform of a 1D row/column. */
function transformLine(input: Float32Array, output: Float32Array, count: number,
  sites: Int32Array, boundaries: Float64Array) {
  let k = 0;
  sites[0] = 0;
  boundaries[0] = -Infinity;
  boundaries[1] = Infinity;
  for (let q = 1; q < count; q++) {
    let intersection: number;
    do {
      const previous = sites[k];
      intersection = ((input[q] - input[previous]) + q * q - previous * previous) / (2 * (q - previous));
      if (intersection > boundaries[k]) break;
      k--;
    } while (k >= 0);
    k++;
    sites[k] = q;
    boundaries[k] = intersection!;
    boundaries[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < count; q++) {
    while (boundaries[k + 1] < q) k++;
    const delta = q - sites[k];
    output[q] = delta * delta + input[sites[k]];
  }
}

async function distanceTransform(field: Float32Array, width: number, height: number) {
  const length = Math.max(width, height);
  const input = new Float32Array(length), output = new Float32Array(length);
  const sites = new Int32Array(length), boundaries = new Float64Array(length + 1);
  for (let y = 0; y < height; y++) {
    if (y % 128 === 0) await yieldToPane();
    input.set(field.subarray(y * width, (y + 1) * width));
    transformLine(input, output, width, sites, boundaries);
    field.set(output.subarray(0, width), y * width);
  }
  for (let x = 0; x < width; x++) {
    if (x % 128 === 0) await yieldToPane();
    for (let y = 0; y < height; y++) input[y] = field[y * width + x];
    transformLine(input, output, height, sites, boundaries);
    for (let y = 0; y < height; y++) field[y * width + x] = output[y];
  }
}

/** Geometry only. Refraction, bevel profile, blur and lighting remain in liquid-dom. */
export async function createContourDistanceField(device: GPUDevice, maskBase64: string,
  cssWidth: number, cssHeight: number, outputScale: number, paddingCss: number) {
  // Compute geometry above output resolution, so diagonal/curved normals are
  // not quantized to the final PNG pixel grid. Keep the original local coordinates.
  const maxDimension = device.limits.maxTextureDimension2D;
  const extentX = cssWidth + paddingCss * 2 + 4;
  const extentY = cssHeight + paddingCss * 2 + 4;
  const fieldScale = Math.min(outputScale * 2,
    (maxDimension - 2) / extentX, (maxDimension - 2) / extentY,
    Math.sqrt(15000000 / (extentX * extentY)));
  if (fieldScale < outputScale) {
    throw new Error("图形轮廓输出过大，请降低输出倍率或缩小图形。");
  }
  const padding = Math.max(2, Math.ceil(paddingCss * fieldScale));
  const width = Math.ceil(cssWidth * fieldScale) + padding * 2;
  const height = Math.ceil(cssHeight * fieldScale) + padding * 2;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法创建图形轮廓画布。");
  const mask = await imageFromBase64(maskBase64);
  try { context.drawImage(mask, padding, padding, cssWidth * fieldScale, cssHeight * fieldScale); }
  finally { mask.close(); }
  const pixels = context.getImageData(0, 0, width, height).data;
  const distance = new Float32Array(width * height);
  let insideCount = 0;
  for (let i = 0; i < distance.length; i++) {
    const alpha = pixels[i * 4 + 3] / 255;
    if (alpha >= 0.5) insideCount++;
    // Fractional edge coverage seeds subpixel distances instead of thresholding
    // everything to a binary mask and then overwriting a discontinuous edge band.
    distance[i] = alpha === 1 ? FAR : Math.max(0, alpha - 0.5) ** 2;
  }
  if (!insideCount) throw new Error("没有读取到有效的填充轮廓，请使用有面积的图形。");
  await distanceTransform(distance, width, height);
  const signed = new Float32Array(distance.length);
  for (let i = 0; i < distance.length; i++) {
    signed[i] = -Math.sqrt(distance[i]);
    const alpha = pixels[i * 4 + 3] / 255;
    distance[i] = alpha === 0 ? FAR : Math.max(0, 0.5 - alpha) ** 2;
  }
  await distanceTransform(distance, width, height);
  for (let i = 0; i < distance.length; i++) {
    signed[i] += Math.sqrt(distance[i]);
  }
  // Float bits stored losslessly in an integer texture; WGSL bitcasts after loading.
  const texture = device.createTexture({ label: "LiquidSlide contour SDF", size: [width, height],
    format: "r32uint", usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING });
  try {
    device.queue.writeTexture({ texture }, signed, { bytesPerRow: width * 4 }, [width, height]);
    return { texture, pixelsPerCssPixel: fieldScale, paddingPixels: padding };
  } catch (error) { texture.destroy(); throw error; }
}
