import {
  CIRCULAR_CORNER_EXPONENT,
  CORNER_SMOOTHING_EXPONENT_DELTA,
  Container,
  Glass,
  Group,
  Html,
  Scene,
  StackingContext,
  flattenContainerGlasses,
  flattenGlassHtml,
  flattenSceneLayers,
  getMinimumScale,
  invertMatrix,
  multiplyMatrices,
  resolveCornerSmoothingExponent,
  scaleOutputMatrix,
  transformPoint
} from "./chunk-VZK7DLTH.js";

// src/events.ts
var GlassPointerEvent = class extends Event {
  glass;
  renderer;
  nativeEvent;
  pointerId;
  pointerType;
  isPrimary;
  button;
  buttons;
  clientX;
  clientY;
  canvasX;
  canvasY;
  localX;
  localY;
  inside;
  constructor(type, init) {
    super(type, { bubbles: false, cancelable: true, composed: false });
    this.glass = init.glass;
    this.renderer = init.renderer;
    this.nativeEvent = init.nativeEvent;
    this.pointerId = init.nativeEvent.pointerId;
    this.pointerType = init.nativeEvent.pointerType;
    this.isPrimary = init.nativeEvent.isPrimary;
    this.button = init.nativeEvent.button;
    this.buttons = init.nativeEvent.buttons;
    this.clientX = init.nativeEvent.clientX;
    this.clientY = init.nativeEvent.clientY;
    this.canvasX = init.canvasX;
    this.canvasY = init.canvasY;
    this.localX = init.localX;
    this.localY = init.localY;
    this.inside = init.inside;
  }
};

// src/renderer/content.ts
var CONTENT_ATLAS_PADDING = 1;
function nextPowerOfTwo(value) {
  let next = 1;
  while (next < value) {
    next *= 2;
  }
  return next;
}
function getTextureBucketSize(requiredSize, maxTextureSize = Number.POSITIVE_INFINITY) {
  if (requiredSize > maxTextureSize) {
    throw new Error(`Texture size ${requiredSize} exceeds the maximum supported size ${maxTextureSize}.`);
  }
  return Math.min(nextPowerOfTwo(Math.max(1, requiredSize)), maxTextureSize);
}
function tryPackContentAtlas(entries, atlasWidth) {
  const rects = /* @__PURE__ */ new Map();
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  for (const entry of entries) {
    const rectWidth = getTextureBucketSize(entry.deviceWidth) + CONTENT_ATLAS_PADDING * 2;
    const rectHeight = getTextureBucketSize(entry.deviceHeight) + CONTENT_ATLAS_PADDING * 2;
    if (rectWidth > atlasWidth) {
      return null;
    }
    if (cursorX > 0 && cursorX + rectWidth > atlasWidth) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }
    rects.set(entry.html, {
      x: cursorX,
      y: cursorY
    });
    cursorX += rectWidth;
    rowHeight = Math.max(rowHeight, rectHeight);
  }
  return {
    width: atlasWidth,
    height: cursorY + rowHeight,
    rects
  };
}
function packContentAtlas(entries, maxTextureSize) {
  if (entries.length === 0) {
    throw new Error("Cannot build a glass content atlas without any content entries.");
  }
  let maxEntryWidth = 1;
  for (const entry of entries) {
    maxEntryWidth = Math.max(maxEntryWidth, getTextureBucketSize(entry.deviceWidth) + CONTENT_ATLAS_PADDING * 2);
  }
  let atlasWidth = nextPowerOfTwo(maxEntryWidth);
  while (atlasWidth <= maxTextureSize) {
    const layout = tryPackContentAtlas(entries, atlasWidth);
    if (layout) {
      const atlasHeight = nextPowerOfTwo(layout.height);
      if (atlasHeight <= maxTextureSize) {
        return {
          ...layout,
          height: atlasHeight
        };
      }
    }
    atlasWidth *= 2;
  }
  throw new Error("Glass content atlas exceeds the maximum supported texture size.");
}

// src/renderer/gpu-layout.ts
var FLOATS_PER_VEC4 = 4;
var BYTES_PER_FLOAT = Float32Array.BYTES_PER_ELEMENT;
function vec4(...fields) {
  if (fields.length > FLOATS_PER_VEC4) {
    throw new Error("A vec4 layout lane cannot contain more than four fields.");
  }
  return {
    type: "vec4f",
    fields
  };
}
function structLayout(definition) {
  const lanes = Object.keys(definition);
  const floatCount = lanes.length * FLOATS_PER_VEC4;
  const byteSize = floatCount * BYTES_PER_FLOAT;
  const writeAt = (target, index, values) => {
    const baseOffset = index * floatCount;
    if (baseOffset < 0 || baseOffset + floatCount > target.length) {
      throw new RangeError("GPU struct write is outside the target buffer.");
    }
    target.fill(0, baseOffset, baseOffset + floatCount);
    for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
      const lane = lanes[laneIndex];
      const fields = definition[lane].fields;
      const laneValues = values[lane];
      const laneOffset = baseOffset + laneIndex * FLOATS_PER_VEC4;
      for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
        target[laneOffset + fieldIndex] = laneValues[fields[fieldIndex]];
      }
    }
  };
  return {
    floatCount,
    byteSize,
    /** Creates CPU-side storage for one or more struct values. */
    createArray(count = 1) {
      return new Float32Array(Math.max(count, 1) * floatCount);
    },
    /** Generates the WGSL struct declaration matching this layout. */
    wgsl(name) {
      const members = lanes.map((lane) => `  ${lane}: vec4f,`).join("\n");
      return `struct ${name} {
${members}
};`;
    },
    /** Writes one struct value at the beginning of a target array. */
    write(target, values) {
      writeAt(target, 0, values);
    },
    /** Writes one struct value at a specific struct index in a target array. */
    writeAt
  };
}
var GpuStructBuffer = class {
  /** Allocates the GPU buffer for the provided layout and usage flags. */
  constructor(device, layout, usage) {
    this.device = device;
    this.layout = layout;
    this.data = layout.createArray();
    this.buffer = device.createBuffer({
      size: layout.byteSize,
      usage
    });
  }
  device;
  layout;
  /** CPU-side staging data written before queue upload. */
  data;
  /** GPU buffer backing this struct. */
  buffer;
  /** Binding resource for a bind group entry. */
  get bindingResource() {
    return { buffer: this.buffer };
  }
  /** Packs and uploads a complete struct value. */
  write(values) {
    this.layout.write(this.data, values);
    this.device.queue.writeBuffer(this.buffer, 0, this.data);
  }
  /** Destroys the underlying GPU buffer. */
  destroy() {
    this.buffer.destroy();
  }
};
var GpuStructArrayBuffer = class {
  /** Creates a growable struct-array buffer manager. */
  constructor(device, layout, usage) {
    this.device = device;
    this.layout = layout;
    this.usage = usage;
    this.data = layout.createArray();
  }
  device;
  layout;
  usage;
  /** CPU-side staging data sized to the current capacity. */
  data;
  /** GPU buffer backing the array, allocated on demand. */
  buffer = null;
  /** Number of struct elements currently allocated. */
  capacity = 0;
  /** Binding resource for a bind group entry. */
  get bindingResource() {
    if (!this.buffer) {
      throw new Error("GPU struct array buffer has not been allocated.");
    }
    return { buffer: this.buffer };
  }
  /** Ensures the GPU and staging buffers can hold the requested element count. */
  ensureCapacity(requiredCount) {
    const nextCapacity = Math.max(requiredCount, 1);
    if (this.buffer && nextCapacity <= this.capacity) {
      return;
    }
    this.buffer?.destroy();
    this.buffer = this.device.createBuffer({
      size: nextCapacity * this.layout.byteSize,
      usage: this.usage
    });
    this.data = this.layout.createArray(nextCapacity);
    this.capacity = nextCapacity;
  }
  /** Writes one struct value into the CPU-side staging array. */
  writeAt(index, values) {
    this.layout.writeAt(this.data, index, values);
  }
  /** Uploads the active prefix of the staging array to the GPU buffer. */
  upload(count) {
    if (!this.buffer) {
      return;
    }
    this.device.queue.writeBuffer(
      this.buffer,
      0,
      this.data,
      0,
      Math.max(count, 1) * this.layout.floatCount
    );
  }
  /** Destroys the GPU buffer and resets allocation state. */
  destroy() {
    this.buffer?.destroy();
    this.buffer = null;
    this.capacity = 0;
  }
};

// src/renderer/shader-layouts.ts
var BlurParamsLayout = structLayout({
  params: vec4("directionX", "directionY", "radius")
});
var GlobalsLayout = structLayout({
  canvas: vec4("width", "height"),
  container: vec4("opacity"),
  shape: vec4("smoothing", "bezelWidth", "shapeCount", "surfaceProfile"),
  sdf: vec4("normalDivergenceBlendPower", "normalDivergenceBlendEnabled"),
  contour: vec4("enabled", "pixelsPerCssPixel", "paddingPixels"),
  glass: vec4("thickness", "displacementFactor", "ior", "dispersion"),
  content: vec4("ior", "depth"),
  lighting: vec4("x", "y"),
  specular: vec4("strength", "width", "sharpness", "opacity"),
  specularSecondary: vec4("oppositeStrength", "falloff", "reflectionOffset"),
  tint: vec4("r", "g", "b", "a"),
  shadow: vec4("offsetX", "offsetY", "spread", "blur"),
  shadowColor: vec4("r", "g", "b", "a"),
  debug: vec4("displacement")
});
var ShapeDataLayout = structLayout({
  inverse0: vec4("a", "c", "e", "minimumScale"),
  inverse1: vec4("b", "d", "f", "cornerRadius"),
  geometry: vec4("halfWidth", "halfHeight", "cornerSmoothing"),
  contentRange: vec4("start", "count")
});
var ContentDataLayout = structLayout({
  inverse0: vec4("a", "c", "e", "copiedWidth"),
  inverse1: vec4("b", "d", "f", "copiedHeight"),
  atlasRect: vec4("u", "v", "uScale", "vScale"),
  opacity: vec4("value")
});
var BackdropMetricsBoundsLayout = structLayout({
  bounds: vec4("minX", "minY", "maxX", "maxY")
});
var HtmlCompositeParamsLayout = structLayout({
  canvas: vec4("width", "height", "uScale", "vScale"),
  inverse0: vec4("a", "c", "e", "copiedWidth"),
  inverse1: vec4("b", "d", "f", "copiedHeight"),
  opacity: vec4("value")
});

// src/shaders.ts
var FULLSCREEN_VERTEX = (
  /* wgsl */
  `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -3.0),
    vec2f(-1.0, 1.0),
    vec2f(3.0, 1.0),
  );

  let position = positions[vertexIndex];
  var output: VertexOutput;
  output.position = vec4f(position, 0.0, 1.0);
  output.uv = vec2f(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
  return output;
}
`
);
var DOWNSAMPLE_SHADER = (
  /* wgsl */
  `
${FULLSCREEN_VERTEX}

@group(0) @binding(0) var downsampleSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4f {
  let textureSize = vec2f(textureDimensions(inputTexture));
  let texel = 1.0 / max(textureSize, vec2f(1.0));
  let clampedUv = clamp(in.uv, vec2f(0.0), vec2f(1.0));

  return (
    textureSampleLevel(inputTexture, downsampleSampler, clampedUv + texel * vec2f(-0.5, -0.5), 0.0) +
    textureSampleLevel(inputTexture, downsampleSampler, clampedUv + texel * vec2f(0.5, -0.5), 0.0) +
    textureSampleLevel(inputTexture, downsampleSampler, clampedUv + texel * vec2f(-0.5, 0.5), 0.0) +
    textureSampleLevel(inputTexture, downsampleSampler, clampedUv + texel * vec2f(0.5, 0.5), 0.0)
  ) * 0.25;
}
`
);
var UPSAMPLE_SHADER = (
  /* wgsl */
  `
${FULLSCREEN_VERTEX}

@group(0) @binding(0) var upsampleSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4f {
  return textureSampleLevel(inputTexture, upsampleSampler, in.uv, 0.0);
}
`
);
var TEXTURE_BLIT_SHADER = (
  /* wgsl */
  `
${FULLSCREEN_VERTEX}

@group(0) @binding(0) var blitSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4f {
  return textureSampleLevel(inputTexture, blitSampler, in.uv, 0.0);
}
`
);
var ADAPTIVE_BLUR_SHADER = (
  /* wgsl */
  `
${BlurParamsLayout.wgsl("BlurParams")}
${FULLSCREEN_VERTEX}

@group(0) @binding(0) var blurSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> blurParams: BlurParams;

const ADAPTIVE_BLUR_TAP_RADIUS: f32 = 6.0;
const ADAPTIVE_BLUR_CENTER_WEIGHT: f32 = 0.13702282;
const ADAPTIVE_BLUR_PAIR_OFFSETS: array<f32, 3> = array<f32, 3>(
  1.4584295,
  3.4039848,
  5.3518057,
);
const ADAPTIVE_BLUR_PAIR_WEIGHTS: array<f32, 3> = array<f32, 3>(
  0.23933733,
  0.1394403,
  0.052710965,
);

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4f {
  let textureSize = vec2f(textureDimensions(inputTexture));
  let blurStep =
    blurParams.params.xy /
    max(textureSize, vec2f(1.0)) *
    (blurParams.params.z / ADAPTIVE_BLUR_TAP_RADIUS);
  let clampedUv = clamp(in.uv, vec2f(0.0), vec2f(1.0));

  var color = textureSampleLevel(inputTexture, blurSampler, clampedUv, 0.0) * ADAPTIVE_BLUR_CENTER_WEIGHT;

  for (var i = 0u; i < 3u; i = i + 1u) {
    let offset = blurStep * ADAPTIVE_BLUR_PAIR_OFFSETS[i];
    let weight = ADAPTIVE_BLUR_PAIR_WEIGHTS[i];
    color =
      color +
      (
        textureSampleLevel(inputTexture, blurSampler, clamp(clampedUv + offset, vec2f(0.0), vec2f(1.0)), 0.0) +
        textureSampleLevel(inputTexture, blurSampler, clamp(clampedUv - offset, vec2f(0.0), vec2f(1.0)), 0.0)
      ) *
      weight;
  }

  return color;
}
`
);
var SHADER_SHARED = (
  /* wgsl */
  `
${GlobalsLayout.wgsl("Globals")}

${ShapeDataLayout.wgsl("ShapeData")}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

// Smooth union uses the classic polynomial smooth-min only after a normal gate.
// Nearly aligned normals are treated as duplicate or nested boundaries and fall
// back toward a hard union; diverging normals get the full blend radius so real
// corners can form a rounded transition.
// globals.sdf.x shapes a continuous ramp from aligned normals to opposed
// normals. A high power keeps smoothing very small until larger angle
// differences, without introducing a hard threshold in the blend radius.
// globals.sdf.y toggles that normal gate; when disabled, every pair receives
// the full configured smoothing distance.
const SDF_EPSILON: f32 = 0.0001;
const SDF_GRADIENT_STEP_PX: f32 = 1.0;
const DEBUG_DISPLACEMENT_ENCODE_SCALE: f32 = 0.01;
// Smooth blending can flatten the fused SDF so one distance unit covers
// more than one screen pixel. Specular is a screen-space rim effect, so it
// converts SDF distance back to pixels with derivatives and caps the correction
// when the local field becomes nearly flat.
const SPECULAR_DISTANCE_SCALE_FLOOR: f32 = 0.25;
// Width of the antialiased feather around the specular band edge in device
// pixels. This is separate from the configured specular band width.
const SPECULAR_EDGE_FEATHER_PX: f32 = 1.0;
const CIRCULAR_CORNER_EXPONENT: f32 = ${CIRCULAR_CORNER_EXPONENT.toFixed(8)};
const CORNER_SMOOTHING_EXPONENT_DELTA: f32 = ${CORNER_SMOOTHING_EXPONENT_DELTA.toFixed(8)};

// Keep the SDF value and its local normal together. The normal is used to decide
// when smoothing is a real edge-to-edge blend instead of an overlap artifact.
struct SdfSample {
  distance: f32,
  gradient: vec2f,
};

fn normalizeSdfGradient(gradient: vec2f) -> vec2f {
  let magnitude = length(gradient);
  if (magnitude < SDF_EPSILON) {
    return vec2f(0.0, -1.0);
  }
  return gradient / magnitude;
}

fn hardUnion(left: SdfSample, right: SdfSample) -> SdfSample {
  if (left.distance <= right.distance) {
    return left;
  }
  return right;
}

fn smoothUnion(left: SdfSample, right: SdfSample, smoothing: f32) -> SdfSample {
  let normalAlignment = clamp(dot(left.gradient, right.gradient), -1.0, 1.0);
  let normalDivergenceBlendPower = max(globals.sdf.x, 0.0001);
  let gatedNormalDivergence = pow((1.0 - normalAlignment) * 0.5, normalDivergenceBlendPower);
  let normalDivergence = select(1.0, gatedNormalDivergence, globals.sdf.y > 0.5);
  let blendDistance = smoothing * normalDivergence;

  if (blendDistance <= SDF_EPSILON) {
    return hardUnion(left, right);
  }

  let h = clamp(0.5 + 0.5 * (right.distance - left.distance) / blendDistance, 0.0, 1.0);
  return SdfSample(
    mix(right.distance, left.distance, h) - blendDistance * h * (1.0 - h),
    normalizeSdfGradient(mix(right.gradient, left.gradient, h)),
  );
}

fn shapeLocalPos(shape: ShapeData, pos: vec2f) -> vec2f {
  return vec2f(
    shape.inverse0.x * pos.x + shape.inverse0.y * pos.y + shape.inverse0.z,
    shape.inverse1.x * pos.x + shape.inverse1.y * pos.y + shape.inverse1.z,
  );
}

fn superellipseLength(v: vec2f, exponent: f32) -> f32 {
  let a = abs(v);
  return pow(pow(a.x, exponent) + pow(a.y, exponent), 1.0 / exponent);
}

// CPU hit testing mirrors this in renderer/interaction.ts. If this p-norm
// approximation changes, update that path at the same time.
fn sdSmoothRoundRect(localPos: vec2f, halfSize: vec2f, radius: f32, cornerSmoothing: f32) -> f32 {
  let cornerLimit = min(halfSize.x, halfSize.y);
  let clampedRadius = min(max(radius, 0.0), cornerLimit);
  let q = abs(localPos) - halfSize + vec2f(clampedRadius);
  let maxSmoothingThatFits = select(
    0.0,
    max(cornerLimit / max(radius, SDF_EPSILON) - 1.0, 0.0),
    radius > SDF_EPSILON,
  );
  let effectiveSmoothing = min(clamp(cornerSmoothing, 0.0, 1.0), maxSmoothingThatFits);
  let exponent = CIRCULAR_CORNER_EXPONENT + effectiveSmoothing * CORNER_SMOOTHING_EXPONENT_DELTA;
  let cornerDistance = superellipseLength(max(q, vec2f(0.0)), exponent);
  return cornerDistance + min(max(q.x, q.y), 0.0) - clampedRadius;
}

// LiquidSlide extension: only the shape distance source changes. All optical
// passes below retain the upstream implementation and use this same field.
@group(0) @binding(8) var contourDistances: texture_2d<u32>;

fn contourDistanceAt(localPos: vec2f) -> f32 {
  let dimensions = vec2i(textureDimensions(contourDistances));
  let position = localPos * globals.contour.y + vec2f(globals.contour.z - 0.5);
  let clamped = clamp(position, vec2f(0.0), vec2f(dimensions - vec2i(1)));
  let base = vec2i(floor(clamped));
  let next = min(base + vec2i(1), dimensions - vec2i(1));
  let fraction = fract(clamped);
  let top = mix(bitcast<f32>(textureLoad(contourDistances, base, 0).r),
                bitcast<f32>(textureLoad(contourDistances, vec2i(next.x, base.y), 0).r), fraction.x);
  let bottom = mix(bitcast<f32>(textureLoad(contourDistances, vec2i(base.x, next.y), 0).r),
                   bitcast<f32>(textureLoad(contourDistances, next, 0).r), fraction.x);
  // Continue positive exterior distances beyond the padded field, rather than
  // extending the border texel into an artificial flat region.
  return (mix(top, bottom, fraction.y) + length(position - clamped)) / globals.contour.y;
}

fn shapeDistanceFromLocal(shape: ShapeData, localPos: vec2f) -> f32 {
  if (globals.contour.x > 0.5) {
    return contourDistanceAt(localPos) * shape.inverse0.w;
  }
  let halfSize = shape.geometry.xy;
  let localDistance = sdSmoothRoundRect(
    localPos - halfSize,
    halfSize,
    shape.inverse1.w,
    shape.geometry.z,
  );
  return localDistance * shape.inverse0.w;
}

fn shapeDistance(shape: ShapeData, pos: vec2f) -> f32 {
  return shapeDistanceFromLocal(shape, shapeLocalPos(shape, pos));
}

fn shapeGradient(shape: ShapeData, pos: vec2f) -> vec2f {
  let eps = SDF_GRADIENT_STEP_PX;
  return normalizeSdfGradient(vec2f(
    shapeDistance(shape, pos + vec2f(eps, 0.0)) - shapeDistance(shape, pos - vec2f(eps, 0.0)),
    shapeDistance(shape, pos + vec2f(0.0, eps)) - shapeDistance(shape, pos - vec2f(0.0, eps)),
  ));
}

fn shapeSdfSample(shape: ShapeData, pos: vec2f) -> SdfSample {
  return SdfSample(
    shapeDistance(shape, pos),
    shapeGradient(shape, pos),
  );
}

fn sceneSdfSample(pos: vec2f, shapeCount: u32, smoothing: f32) -> SdfSample {
  var result = SdfSample(1e5, vec2f(0.0, -1.0));
  var found = false;

  for (var i = 0u; i < shapeCount; i = i + 1u) {
    let nextSample = shapeSdfSample(shapes[i], pos);
    if (!found) {
      result = nextSample;
      found = true;
    } else {
      result = smoothUnion(result, nextSample, smoothing);
    }
  }

  return result;
}

fn smootherstep(value: f32) -> f32 {
  let x = clamp(value, 0.0, 1.0);
  return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}

fn smootherstepDerivative(value: f32) -> f32 {
  let x = clamp(value, 0.0, 1.0);
  return 30.0 * x * x * (x * (x - 2.0) + 1.0);
}

fn convexSquircle(x: f32) -> vec2f {
  let u = 1.0 - clamp(x, 0.0, 1.0);
  let inside = max(1.0 - pow(u, 4.0), 0.0001);
  let height = sqrt(inside);
  let derivative = 2.0 * pow(u, 3.0) / sqrt(inside);
  return vec2f(height, derivative);
}

fn concaveCircle(x: f32) -> vec2f {
  let squircle = convexSquircle(x);
  return vec2f(1.0 - squircle.x, -squircle.y);
}

fn evaluateHeightProfile(profileIndex: f32, x: f32) -> vec2f {
  if (profileIndex < 0.5) {
    return convexSquircle(x);
  }

  if (profileIndex < 1.5) {
    return concaveCircle(x);
  }

  let convex = convexSquircle(x);
  let concave = concaveCircle(x);
  let blend = smootherstep(x);
  let blendDerivative = smootherstepDerivative(x);
  let height = mix(convex.x, concave.x, blend);
  let derivative = mix(convex.y, concave.y, blend) + (concave.x - convex.x) * blendDerivative;
  return vec2f(height, derivative);
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -3.0),
    vec2f(-1.0, 1.0),
    vec2f(3.0, 1.0),
  );

  let position = positions[vertexIndex];
  var output: VertexOutput;
  output.position = vec4f(position, 0.0, 1.0);
  output.uv = vec2f(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
  return output;
}
`
);
var DISPLACEMENT_FIELD_SHADER = (
  /* wgsl */
  `
${SHADER_SHARED}

@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<storage, read> shapes: array<ShapeData>;

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4f {
  let shapeCount = u32(globals.shape.z);
  let fragCoord = in.uv * globals.canvas.xy;
  let sdfSample = sceneSdfSample(fragCoord, shapeCount, globals.shape.x);
  let distance = sdfSample.distance;
  let fillMask = 1.0 - smoothstep(0.0, 1.4, distance);
  let pixelWidth = max(fwidth(distance), 0.75);
  let bezelWidth = max(globals.shape.y, pixelWidth * 2.0);
  let inwardDistance = max(-distance, 0.0);
  let bezelProgress = clamp(inwardDistance / bezelWidth, 0.0, 1.0);
  let surfaceDerivative = select(
    evaluateHeightProfile(globals.shape.w, bezelProgress).y,
    0.0,
    inwardDistance > bezelWidth,
  );
  let clampedSlope = min(surfaceDerivative, tan(1.4835298));
  let surfaceSlope = sdfSample.gradient * clampedSlope;

  return vec4f(surfaceSlope * fillMask, 0.0, fillMask);
}
`
);
var SHADOW_MASK_SHADER = (
  /* wgsl */
  `
${SHADER_SHARED}

@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<storage, read> shapes: array<ShapeData>;

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4f {
  let shapeCount = u32(globals.shape.z);
  let fragCoord = in.uv * globals.canvas.xy;
  let shadowCoord = fragCoord - globals.shadow.xy;
  let distance = sceneSdfSample(shadowCoord, shapeCount, globals.shape.x).distance - globals.shadow.z;
  let pixelWidth = max(fwidth(distance), 0.75);
  let alpha = 1.0 - smoothstep(0.0, pixelWidth, distance);

  return vec4f(0.0, 0.0, 0.0, alpha);
}
`
);
var SHADOW_COMPOSITE_SHADER = (
  /* wgsl */
  `
${GlobalsLayout.wgsl("Globals")}
${FULLSCREEN_VERTEX}

@group(0) @binding(0) var shadowSampler: sampler;
@group(0) @binding(1) var sceneTexture: texture_2d<f32>;
@group(0) @binding(2) var shadowMaskTexture: texture_2d<f32>;
@group(0) @binding(3) var<uniform> globals: Globals;

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4f {
  let sceneColor = textureSampleLevel(sceneTexture, shadowSampler, in.uv, 0.0);
  let shadowMask = textureSampleLevel(shadowMaskTexture, shadowSampler, in.uv, 0.0).a;
  let containerOpacity = clamp(globals.container.x, 0.0, 1.0);
  let shadowOpacity = clamp(shadowMask * globals.shadowColor.a * containerOpacity, 0.0, 1.0);
  let color = mix(sceneColor.rgb, globals.shadowColor.rgb, shadowOpacity);

  return vec4f(color, sceneColor.a);
}
`
);
var GLASS_SHADER = (
  /* wgsl */
  `
${SHADER_SHARED}

@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<storage, read> shapes: array<ShapeData>;
@group(0) @binding(2) var backgroundSampler: sampler;
@group(0) @binding(3) var backgroundTextureSharp: texture_2d<f32>;
@group(0) @binding(4) var backgroundTextureBlurred: texture_2d<f32>;
@group(0) @binding(5) var glassContentTexture: texture_2d<f32>;

${ContentDataLayout.wgsl("ContentData")}

@group(0) @binding(6) var<storage, read> contentEntries: array<ContentData>;
@group(0) @binding(7) var displacementFieldTexture: texture_2d<f32>;

fn sampleBackgroundSharp(uv: vec2f) -> vec3f {
  return textureSampleLevel(backgroundTextureSharp, backgroundSampler, uv, 0.0).rgb;
}

fn sampleBackgroundBlurred(uv: vec2f) -> vec3f {
  return textureSampleLevel(backgroundTextureBlurred, backgroundSampler, uv, 0.0).rgb;
}

fn sampleSurfaceSlope(uv: vec2f) -> vec2f {
  let field = textureSampleLevel(displacementFieldTexture, backgroundSampler, uv, 0.0);
  return select(vec2f(0.0), field.xy / max(field.a, SDF_EPSILON), field.a > SDF_EPSILON);
}

fn contentLocalPos(content: ContentData, glassLocalPos: vec2f) -> vec2f {
  return vec2f(
    content.inverse0.x * glassLocalPos.x + content.inverse0.y * glassLocalPos.y + content.inverse0.z,
    content.inverse1.x * glassLocalPos.x + content.inverse1.y * glassLocalPos.y + content.inverse1.z,
  );
}

fn sampleGlassContentAtlas(content: ContentData, localPos: vec2f) -> vec4f {
  let copiedSize = vec2f(content.inverse0.w, content.inverse1.w);
  if (
    any(copiedSize <= vec2f(0.0)) ||
    any(content.atlasRect.zw <= vec2f(0.0)) ||
    any(localPos < vec2f(0.0)) ||
    any(localPos > copiedSize)
  ) {
    return vec4f(0.0);
  }

  let atlasUv = content.atlasRect.xy + localPos * content.atlasRect.zw;
  let contentColor = textureSampleLevel(glassContentTexture, backgroundSampler, atlasUv, 0.0);
  return vec4f(contentColor.rgb, contentColor.a * clamp(content.opacity.x, 0.0, 1.0));
}

fn sampleGlassContentEntry(
  content: ContentData,
  glassLocalRed: vec2f,
  glassLocalGreen: vec2f,
  glassLocalBlue: vec2f,
  contentMask: f32,
) -> vec4f {
  if (contentMask <= 0.0) {
    return vec4f(0.0);
  }

  let contentRed = sampleGlassContentAtlas(content, contentLocalPos(content, glassLocalRed));
  let contentGreen = sampleGlassContentAtlas(content, contentLocalPos(content, glassLocalGreen));
  let contentBlue = sampleGlassContentAtlas(content, contentLocalPos(content, glassLocalBlue));
  let alpha = max(contentGreen.a, max(contentRed.a, contentBlue.a)) * contentMask;
  return vec4f(vec3f(contentRed.r, contentGreen.g, contentBlue.b), alpha);
}

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4f {
  let shapeCount = u32(globals.shape.z);
  let fragCoord = in.uv * globals.canvas.xy;
  let background = sampleBackgroundSharp(in.uv);
  let containerOpacity = clamp(globals.container.x, 0.0, 1.0);

  let sdfSample = sceneSdfSample(fragCoord, shapeCount, globals.shape.x);
  let distance = sdfSample.distance;
  let fillMask = 1.0 - smoothstep(0.0, 1.4, distance);
  let gradient = sdfSample.gradient;
  let pixelWidth = max(fwidth(distance), 0.75);
  let specularDistanceUnitsPerPx = max(
    length(vec2f(dpdx(distance), dpdy(distance))),
    SPECULAR_DISTANCE_SCALE_FLOOR,
  );
  let specularDistancePx = distance / specularDistanceUnitsPerPx;
  let specularInwardDistancePx = max(-specularDistancePx, 0.0);
  let rimWidthPx = max(globals.specular.y, 0.0001);
  let specularOuterMask = 1.0 - smoothstep(0.0, SPECULAR_EDGE_FEATHER_PX, specularDistancePx);
  let specularInnerMask = 1.0 - smoothstep(
    rimWidthPx,
    rimWidthPx + SPECULAR_EDGE_FEATHER_PX,
    specularInwardDistancePx,
  );
  let rimBandMask = specularOuterMask * specularInnerMask;
  let rimNormal = gradient;
  let lightDir = normalize(
    select(vec2f(1.0, 0.0), globals.lighting.xy, dot(globals.lighting.xy, globals.lighting.xy) > 0.0001),
  );
  let mirroredLightDir = -lightDir;

  let bezelWidth = max(globals.shape.y, pixelWidth * 2.0);
  let inwardDistance = max(-distance, 0.0);
  let bezelProgress = clamp(inwardDistance / bezelWidth, 0.0, 1.0);
  let profileResult = evaluateHeightProfile(globals.shape.w, bezelProgress);
  let profileHeight = profileResult.x * bezelWidth;
  let flatHeight = evaluateHeightProfile(globals.shape.w, 1.0).x * bezelWidth;
  let surfaceHeight = globals.glass.x + select(profileHeight, flatHeight, inwardDistance > bezelWidth);
  let surfaceSlope = sampleSurfaceSlope(in.uv);

  // The displacement prepass filters the 2D bevel slope before we rebuild the
  // 3D surface normal. Keeping this as a surface field, rather than a final
  // pixel displacement, lets the glass and content refraction paths still use
  // their own IOR, depth, and dispersion settings.
  let surfaceNormal = normalize(vec3f(surfaceSlope, 1.0));
  let dispersion = max(globals.glass.w, 0.0);
  let baseIor = max(globals.glass.z, 1.0001);
  let refractedRayRed = refract(
    vec3f(0.0, 0.0, -1.0),
    surfaceNormal,
    1.0 / max(baseIor + dispersion, 1.0001),
  );
  let refractedRayGreen = refract(vec3f(0.0, 0.0, -1.0), surfaceNormal, 1.0 / baseIor);
  let refractedRayBlue = refract(
    vec3f(0.0, 0.0, -1.0),
    surfaceNormal,
    1.0 / max(baseIor - dispersion, 1.0001),
  );
  let displacementPxRed = select(
    refractedRayRed.xy / max(-refractedRayRed.z, 0.0001) * surfaceHeight * globals.glass.y,
    vec2f(0.0),
    fillMask <= 0.0,
  );
  let displacementPxGreen = select(
    refractedRayGreen.xy / max(-refractedRayGreen.z, 0.0001) * surfaceHeight * globals.glass.y,
    vec2f(0.0),
    fillMask <= 0.0,
  );
  let displacementPxBlue = select(
    refractedRayBlue.xy / max(-refractedRayBlue.z, 0.0001) * surfaceHeight * globals.glass.y,
    vec2f(0.0),
    fillMask <= 0.0,
  );
  if (globals.debug.x > 0.5) {
    // Signed pixel displacement is centered at 0.5 for display in the color target:
    // red/green hold x/y displacement, blue stays zero.
    let debugDisplacement = displacementPxGreen * DEBUG_DISPLACEMENT_ENCODE_SCALE + vec2f(0.5);
    let debugColor = mix(background, vec3f(debugDisplacement, 0.0), fillMask);
    return vec4f(mix(background, debugColor, containerOpacity), 1.0);
  }
  let contentBaseIor = max(globals.content.x, 1.0001);
  let contentRefractedRayRed = refract(
    vec3f(0.0, 0.0, -1.0),
    surfaceNormal,
    1.0 / max(contentBaseIor + dispersion, 1.0001),
  );
  let contentRefractedRayGreen = refract(vec3f(0.0, 0.0, -1.0), surfaceNormal, 1.0 / contentBaseIor);
  let contentRefractedRayBlue = refract(
    vec3f(0.0, 0.0, -1.0),
    surfaceNormal,
    1.0 / max(contentBaseIor - dispersion, 1.0001),
  );
  let contentDisplacementPxRed = select(
    contentRefractedRayRed.xy /
      max(-contentRefractedRayRed.z, 0.0001) *
      globals.content.y *
      globals.glass.y,
    vec2f(0.0),
    fillMask <= 0.0,
  );
  let contentDisplacementPxGreen = select(
    contentRefractedRayGreen.xy /
      max(-contentRefractedRayGreen.z, 0.0001) *
      globals.content.y *
      globals.glass.y,
    vec2f(0.0),
    fillMask <= 0.0,
  );
  let contentDisplacementPxBlue = select(
    contentRefractedRayBlue.xy /
      max(-contentRefractedRayBlue.z, 0.0001) *
      globals.content.y *
      globals.glass.y,
    vec2f(0.0),
    fillMask <= 0.0,
  );
  let refractedUvRed = in.uv + displacementPxRed / globals.canvas.xy;
  let refractedUvGreen = in.uv + displacementPxGreen / globals.canvas.xy;
  let refractedUvBlue = in.uv + displacementPxBlue / globals.canvas.xy;
  let refractedColor = vec3f(
    sampleBackgroundBlurred(refractedUvRed).r,
    sampleBackgroundBlurred(refractedUvGreen).g,
    sampleBackgroundBlurred(refractedUvBlue).b,
  );
  let reflectedUv = in.uv + rimNormal * globals.specularSecondary.z / globals.canvas.xy;
  let reflectedColor = sampleBackgroundBlurred(reflectedUv);
  let glass = mix(refractedColor, globals.tint.rgb, globals.tint.a);
  let refractedLuma = dot(refractedColor, vec3f(0.2126, 0.7152, 0.0722));
  let reflectedLuma = dot(reflectedColor, vec3f(0.2126, 0.7152, 0.0722));

  // Reflection only shows when the reflected sample is bright enough and the refracted sample
  // underneath is dark enough to accept it.
  let reflectionPresence = smoothstep(0.2, 0.85, reflectedLuma);
  let refractionAcceptance = 1.0 - smoothstep(0.35, 0.85, refractedLuma);
  let reflectionBlend = reflectionPresence * refractionAcceptance;
  let edgeSpecularColor = mix(refractedColor, reflectedColor, reflectionBlend);

  // Content rendered into per-glass canvas children is sampled from its own sharp atlas,
  // refracted with the same displacement field, and then layered over the tinted backdrop
  // before any specular contributions are applied.
  var glassInterior = glass;
  for (var i = 0u; i < shapeCount; i = i + 1u) {
    let shape = shapes[i];
    let contentStart = u32(shape.contentRange.x);
    let contentCount = u32(shape.contentRange.y);
    let shapeDistanceAtFrag = shapeDistance(shape, fragCoord);
    let contentBand = max(globals.shape.x, pixelWidth);
    let contentMask = 1.0 - smoothstep(contentBand, contentBand + pixelWidth, shapeDistanceAtFrag);
    let glassLocalRed = shapeLocalPos(shape, fragCoord + contentDisplacementPxRed);
    let glassLocalGreen = shapeLocalPos(shape, fragCoord + contentDisplacementPxGreen);
    let glassLocalBlue = shapeLocalPos(shape, fragCoord + contentDisplacementPxBlue);

    for (var contentOffset = 0u; contentOffset < contentCount; contentOffset = contentOffset + 1u) {
      let contentLayer = sampleGlassContentEntry(
        contentEntries[contentStart + contentOffset],
        glassLocalRed,
        glassLocalGreen,
        glassLocalBlue,
        contentMask,
      );
      glassInterior = mix(glassInterior, contentLayer.rgb, contentLayer.a);
    }
  }

  // White specular is a separate rim-only highlight driven by 2D normal/light alignment and
  // then masked back to the configured rim band. The mask uses derivative-scaled
  // screen-pixel distance so smooth SDF blends do not stretch hairline highlights.
  let primaryBandProgress = clamp(
    specularInwardDistancePx / max(rimWidthPx, SPECULAR_EDGE_FEATHER_PX),
    0.0,
    1.0,
  );
  let oppositeBandProgress = primaryBandProgress;
  let primaryStrength = globals.specular.x - globals.specularSecondary.y * primaryBandProgress * primaryBandProgress;
  let oppositeStrength =
    globals.specularSecondary.x - globals.specularSecondary.y * oppositeBandProgress * oppositeBandProgress;
  let oppositeRimBandMask = rimBandMask;
  let rimSpecular = pow(max(dot(rimNormal, lightDir), 0.0), globals.specular.z);
  let mirroredRimSpecular = pow(max(dot(rimNormal, mirroredLightDir), 0.0), globals.specular.z);
  let primarySpecularOpacity = clamp(rimSpecular * primaryStrength, 0.0, 1.0);
  let oppositeSpecularOpacity = clamp(mirroredRimSpecular * oppositeStrength, 0.0, 1.0);
  let combinedRimSpecularOpacity = clamp(
    primarySpecularOpacity * rimBandMask + oppositeSpecularOpacity * oppositeRimBandMask,
    0.0,
    1.0,
  );
  let whiteSpecularOpacity = combinedRimSpecularOpacity * globals.specular.w;
  let coloredEdgeOpacity = combinedRimSpecularOpacity;
  let whiteSpecular = vec3f(1.0) * whiteSpecularOpacity;

  var color = background;
  if (fillMask > 0.0) {
    color = mix(color, glassInterior, fillMask);
    color = mix(color, edgeSpecularColor, coloredEdgeOpacity);
    color = color + whiteSpecular;
  }

  return vec4f(mix(background, color, containerOpacity), 1.0);
}
`
);
var METRICS_SHADER = (
  /* wgsl */
  `
${SHADER_SHARED}

${BackdropMetricsBoundsLayout.wgsl("MetricsBounds")}

@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<storage, read> shapes: array<ShapeData>;
@group(0) @binding(2) var metricsSampler: sampler;
@group(0) @binding(3) var blurredBackdrop: texture_2d<f32>;
@group(0) @binding(4) var<uniform> metricsBounds: MetricsBounds;

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4f {
  let shapeCount = u32(globals.shape.z);
  let positionPx = mix(metricsBounds.bounds.xy, metricsBounds.bounds.zw, in.uv);
  let insideCanvas =
    all(positionPx >= vec2f(0.0)) &&
    all(positionPx <= globals.canvas.xy);
  let distance = sceneSdfSample(positionPx, shapeCount, globals.shape.x).distance;
  // This uses bezel width as the interior cutoff. For heavily fused shapes with
  // spacing wider than the bezel, the transition band can extend past this threshold,
  // but we accept that simplification for now because it does not occur in our target use cases.
  let isInterior = insideCanvas && distance <= -globals.shape.y;
  let color = textureSampleLevel(blurredBackdrop, metricsSampler, positionPx / globals.canvas.xy, 0.0).rgb;
  return vec4f(color, select(0.0, 1.0, isInterior));
}
`
);
var HTML_COMPOSITE_SHADER = (
  /* wgsl */
  `
${HtmlCompositeParamsLayout.wgsl("HtmlCompositeParams")}

@group(0) @binding(0) var compositeSampler: sampler;
@group(0) @binding(1) var sceneTexture: texture_2d<f32>;
@group(0) @binding(2) var htmlTexture: texture_2d<f32>;
@group(0) @binding(3) var<uniform> params: HtmlCompositeParams;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -3.0),
    vec2f(-1.0, 1.0),
    vec2f(3.0, 1.0),
  );

  let position = positions[vertexIndex];
  var output: VertexOutput;
  output.position = vec4f(position, 0.0, 1.0);
  output.uv = vec2f(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
  return output;
}

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4f {
  let sceneColor = textureSampleLevel(sceneTexture, compositeSampler, in.uv, 0.0);
  let fragCoord = in.uv * params.canvas.xy;
  let localPos = vec2f(
    params.inverse0.x * fragCoord.x + params.inverse0.y * fragCoord.y + params.inverse0.z,
    params.inverse1.x * fragCoord.x + params.inverse1.y * fragCoord.y + params.inverse1.z,
  );
  let copiedSize = vec2f(params.inverse0.w, params.inverse1.w);

  if (
    any(params.canvas.zw <= vec2f(0.0)) ||
    any(copiedSize <= vec2f(0.0)) ||
    any(localPos < vec2f(0.0)) ||
    any(localPos > copiedSize)
  ) {
    return sceneColor;
  }

  let htmlColor = textureSampleLevel(htmlTexture, compositeSampler, localPos * params.canvas.zw, 0.0);
  let htmlAlpha = htmlColor.a * clamp(params.opacity.x, 0.0, 1.0);
  return vec4f(mix(sceneColor.rgb, htmlColor.rgb, htmlAlpha), 1.0);
}
`
);

// src/renderer/gpu-constants.ts
var GPU_BUFFER_USAGE = {
  MAP_READ: 1,
  UNIFORM: 64,
  STORAGE: 128,
  COPY_DST: 8
};
var GPU_TEXTURE_USAGE = {
  COPY_SRC: 1,
  TEXTURE_BINDING: 4,
  COPY_DST: 2,
  RENDER_ATTACHMENT: 16
};

// src/renderer/gpu-pass.ts
var OPAQUE_BLACK = { r: 0, g: 0, b: 0, a: 1 };
function createPipelineBindGroup(device, pipeline, entries) {
  return device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries
  });
}
function clearRenderTarget(encoder, target, clearValue = OPAQUE_BLACK) {
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        clearValue,
        loadOp: "clear",
        storeOp: "store",
        view: target.createView()
      }
    ]
  });
  pass.end();
}
function drawFullscreenPass(encoder, { pipeline, bindGroup, target, clearValue = OPAQUE_BLACK }) {
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        clearValue,
        loadOp: "clear",
        storeOp: "store",
        view: target.createView()
      }
    ]
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3);
  pass.end();
}
var PingPongComposer = class {
  /** Starts a composition sequence with sceneA cleared as the current texture. */
  constructor(device, targets) {
    this.device = device;
    this.encoder = device.createCommandEncoder();
    this.currentTexture = targets.sceneA;
    this.nextTexture = targets.sceneB;
    clearRenderTarget(this.encoder, this.currentTexture);
  }
  device;
  /** Active encoder for the current composition step. */
  encoder;
  currentTexture;
  nextTexture;
  /** Texture containing the latest submitted composition result. */
  get current() {
    return this.currentTexture;
  }
  /** Texture to render the next composition pass into. */
  get next() {
    return this.nextTexture;
  }
  /** Submits the current encoder and swaps current/next targets. */
  submitAndSwap() {
    this.device.queue.submit([this.encoder.finish()]);
    this.encoder = this.device.createCommandEncoder();
    const previousCurrent = this.currentTexture;
    this.currentTexture = this.nextTexture;
    this.nextTexture = previousCurrent;
  }
  /** Submits the final pending encoder without swapping targets. */
  submit() {
    this.device.queue.submit([this.encoder.finish()]);
  }
};

// src/renderer/adaptive-blur.ts
var ADAPTIVE_BLUR_DENSE_RADIUS_PX = 6;
var TRANSPARENT_BLACK = { r: 0, g: 0, b: 0, a: 0 };
function chooseAdaptiveBlurLevel(radiusPx, maxLevel) {
  const normalizedMaxLevel = Number.isFinite(maxLevel) ? Math.max(0, Math.floor(maxLevel)) : 0;
  const normalizedRadius = Number.isFinite(radiusPx) ? Math.max(radiusPx, 0) : 0;
  if (normalizedRadius <= 0) {
    return {
      skip: true,
      level: 0,
      scale: 1,
      effectiveRadius: 0
    };
  }
  const requestedLevel = Math.ceil(Math.log2(normalizedRadius / ADAPTIVE_BLUR_DENSE_RADIUS_PX));
  const level = Math.min(Math.max(requestedLevel, 0), normalizedMaxLevel);
  const scale = 2 ** level;
  return {
    skip: false,
    level,
    scale,
    effectiveRadius: normalizedRadius / scale
  };
}
function createAdaptiveBlurResources(device, format) {
  const downsampleModule = device.createShaderModule({ code: DOWNSAMPLE_SHADER });
  const blurModule = device.createShaderModule({ code: ADAPTIVE_BLUR_SHADER });
  const upsampleModule = device.createShaderModule({ code: UPSAMPLE_SHADER });
  const uniformBufferUsage = GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST;
  return {
    pipelines: {
      downsample: createFullscreenPipeline(device, format, downsampleModule),
      blur: createFullscreenPipeline(device, format, blurModule),
      upsample: createFullscreenPipeline(device, format, upsampleModule)
    },
    horizontalBuffer: new GpuStructBuffer(device, BlurParamsLayout, uniformBufferUsage),
    verticalBuffer: new GpuStructBuffer(device, BlurParamsLayout, uniformBufferUsage)
  };
}
function destroyAdaptiveBlurResources(resources) {
  resources?.horizontalBuffer.destroy();
  resources?.verticalBuffer.destroy();
}
function renderAdaptiveBlur({
  device,
  sampler,
  encoder,
  source,
  radiusPx,
  chain,
  resources
}) {
  if (chain.levels.length === 0) {
    return source;
  }
  const selection = chooseAdaptiveBlurLevel(radiusPx, chain.levels.length - 1);
  if (selection.skip) {
    return source;
  }
  let current = source;
  for (let levelIndex = 1; levelIndex <= selection.level; levelIndex += 1) {
    const targetLevel = chain.levels[levelIndex];
    const bindGroup = createPipelineBindGroup(device, resources.pipelines.downsample, [
      { binding: 0, resource: sampler },
      { binding: 1, resource: current.createView() }
    ]);
    drawFullscreenPass(encoder, {
      pipeline: resources.pipelines.downsample,
      bindGroup,
      target: targetLevel.ping,
      clearValue: TRANSPARENT_BLACK
    });
    current = targetLevel.ping;
  }
  const blurLevel = chain.levels[selection.level];
  writeAdaptiveBlurParams(selection.effectiveRadius, resources.horizontalBuffer, resources.verticalBuffer);
  const horizontalBindGroup = createPipelineBindGroup(device, resources.pipelines.blur, [
    { binding: 0, resource: sampler },
    { binding: 1, resource: current.createView() },
    { binding: 2, resource: resources.horizontalBuffer.bindingResource }
  ]);
  drawFullscreenPass(encoder, {
    pipeline: resources.pipelines.blur,
    bindGroup: horizontalBindGroup,
    target: blurLevel.pong,
    clearValue: TRANSPARENT_BLACK
  });
  const verticalBindGroup = createPipelineBindGroup(device, resources.pipelines.blur, [
    { binding: 0, resource: sampler },
    { binding: 1, resource: blurLevel.pong.createView() },
    { binding: 2, resource: resources.verticalBuffer.bindingResource }
  ]);
  drawFullscreenPass(encoder, {
    pipeline: resources.pipelines.blur,
    bindGroup: verticalBindGroup,
    target: blurLevel.ping,
    clearValue: TRANSPARENT_BLACK
  });
  current = blurLevel.ping;
  for (let levelIndex = selection.level - 1; levelIndex >= 0; levelIndex -= 1) {
    const targetLevel = chain.levels[levelIndex];
    const bindGroup = createPipelineBindGroup(device, resources.pipelines.upsample, [
      { binding: 0, resource: sampler },
      { binding: 1, resource: current.createView() }
    ]);
    drawFullscreenPass(encoder, {
      pipeline: resources.pipelines.upsample,
      bindGroup,
      target: targetLevel.pong,
      clearValue: TRANSPARENT_BLACK
    });
    current = targetLevel.pong;
  }
  return current;
}
function createFullscreenPipeline(device, format, module) {
  return device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module,
      entryPoint: "vertexMain"
    },
    fragment: {
      module,
      entryPoint: "fragmentMain",
      targets: [{ format }]
    },
    primitive: {
      topology: "triangle-list"
    }
  });
}
function writeAdaptiveBlurParams(radiusPx, horizontalBuffer, verticalBuffer) {
  const blurRadius = Math.max(radiusPx, 0);
  horizontalBuffer.write({
    params: {
      directionX: 1,
      directionY: 0,
      radius: blurRadius
    }
  });
  verticalBuffer.write({
    params: {
      directionX: 0,
      directionY: 1,
      radius: blurRadius
    }
  });
}

// src/renderer/gpu-targets.ts
function createRenderTarget(device, format, width, height) {
  return device.createTexture({
    size: {
      width,
      height,
      depthOrArrayLayers: 1
    },
    format,
    usage: GPU_TEXTURE_USAGE.COPY_SRC | GPU_TEXTURE_USAGE.TEXTURE_BINDING | GPU_TEXTURE_USAGE.RENDER_ATTACHMENT | GPU_TEXTURE_USAGE.COPY_DST
  });
}
function createAdaptiveBlurTargetChain(device, format, width, height) {
  const levels = [];
  let levelWidth = Math.max(Math.floor(width), 1);
  let levelHeight = Math.max(Math.floor(height), 1);
  while (true) {
    levels.push({
      ping: createRenderTarget(device, format, levelWidth, levelHeight),
      pong: createRenderTarget(device, format, levelWidth, levelHeight),
      width: levelWidth,
      height: levelHeight
    });
    if (levelWidth === 1 && levelHeight === 1) {
      break;
    }
    levelWidth = Math.max(Math.ceil(levelWidth / 2), 1);
    levelHeight = Math.max(Math.ceil(levelHeight / 2), 1);
  }
  return {
    format,
    levels
  };
}
function destroyAdaptiveBlurTargetChain(chain) {
  if (!chain) {
    return;
  }
  for (const level of chain.levels) {
    level.ping.destroy();
    level.pong.destroy();
  }
}
function destroyTargets(targets) {
  if (!targets) {
    return;
  }
  destroyAdaptiveBlurTargetChain(targets.backdropBlur);
  destroyAdaptiveBlurTargetChain(targets.displacementBlur);
  destroyAdaptiveBlurTargetChain(targets.shadowBlur);
  targets.sceneA.destroy();
  targets.sceneB.destroy();
}
function copyTextureRegion(encoder, source, destination, region) {
  const width = Math.floor(region.width);
  const height = Math.floor(region.height);
  if (width <= 0 || height <= 0) {
    return false;
  }
  encoder.copyTextureToTexture(
    {
      texture: source,
      origin: {
        x: Math.floor(region.sourceX),
        y: Math.floor(region.sourceY),
        z: 0
      }
    },
    {
      texture: destination,
      origin: {
        x: Math.floor(region.destinationX),
        y: Math.floor(region.destinationY),
        z: 0
      }
    },
    {
      width,
      height,
      depthOrArrayLayers: 1
    }
  );
  return true;
}

// src/renderer/interaction.ts
var SDF_EPSILON = 1e-4;
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
function superellipseLength(x, y, exponent) {
  return (Math.abs(x) ** exponent + Math.abs(y) ** exponent) ** (1 / exponent);
}
function sdSmoothRoundRect(localX, localY, halfWidth, halfHeight, radius, cornerSmoothing) {
  const cornerLimit = Math.min(halfWidth, halfHeight);
  const clampedRadius = Math.min(Math.max(radius, 0), cornerLimit);
  const qx = Math.abs(localX) - halfWidth + clampedRadius;
  const qy = Math.abs(localY) - halfHeight + clampedRadius;
  const maxSmoothingThatFits = radius > SDF_EPSILON ? Math.max(cornerLimit / Math.max(radius, SDF_EPSILON) - 1, 0) : 0;
  const effectiveSmoothing = Math.min(clamp(cornerSmoothing, 0, 1), maxSmoothingThatFits);
  const exponent = resolveCornerSmoothingExponent(effectiveSmoothing);
  const cornerDistance = superellipseLength(Math.max(qx, 0), Math.max(qy, 0), exponent);
  return cornerDistance + Math.min(Math.max(qx, qy), 0) - clampedRadius;
}
function matrixToCssTransform(matrix) {
  return `matrix(${matrix.a}, ${matrix.b}, ${matrix.c}, ${matrix.d}, ${matrix.e}, ${matrix.f})`;
}
function createGlassInteractionEntries(containers) {
  const entriesByGlass = /* @__PURE__ */ new Map();
  const orderedEntries = [];
  for (let containerOrder = 0; containerOrder < containers.length; containerOrder += 1) {
    const entry = containers[containerOrder];
    for (const glassLayer of flattenContainerGlasses(entry.container)) {
      const glass = glassLayer.glass;
      if (!glass.pointerEvents || glass.width <= 0 || glass.height <= 0) {
        continue;
      }
      const transform = multiplyMatrices(entry.transform, glassLayer.transform);
      const inverseTransform = invertMatrix(transform);
      if (!inverseTransform) {
        continue;
      }
      const interactionEntry = {
        glass,
        container: entry.container,
        containerOrder,
        glassOrder: glassLayer.traversalIndex,
        transform,
        inverseTransform,
        halfWidth: glass.width * 0.5,
        halfHeight: glass.height * 0.5,
        cornerRadius: glass.cornerRadius,
        cornerSmoothing: glass.cornerSmoothing
      };
      entriesByGlass.set(glass, interactionEntry);
      orderedEntries.push(interactionEntry);
    }
  }
  orderedEntries.sort(
    (left, right) => left.containerOrder - right.containerOrder || left.glassOrder - right.glassOrder
  );
  return {
    entriesByGlass,
    orderedEntries
  };
}
function measureGlassInteractionEntry(entry, canvasX, canvasY) {
  const localPoint = transformPoint(entry.inverseTransform, canvasX, canvasY);
  const centeredX = localPoint.x - entry.halfWidth;
  const centeredY = localPoint.y - entry.halfHeight;
  return {
    localX: localPoint.x,
    localY: localPoint.y,
    inside: sdSmoothRoundRect(
      centeredX,
      centeredY,
      entry.halfWidth,
      entry.halfHeight,
      entry.cornerRadius,
      entry.cornerSmoothing
    ) <= 0
  };
}
function hitTestGlassInteractionEntries(entries, canvasX, canvasY) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (measureGlassInteractionEntry(entry, canvasX, canvasY).inside) {
      return entry;
    }
  }
  return null;
}

// src/renderer/scene-order.ts
function getSortedSceneLayers(scene) {
  return flattenSceneLayers(scene);
}
function getSortedGlassLayers(container) {
  return flattenContainerGlasses(container);
}
function getSortedGlassHtmlLayers(glass) {
  return flattenGlassHtml(glass);
}
function getLayerContainers(layers) {
  return layers.filter((entry) => entry.child instanceof Container).map((entry) => ({
    container: entry.child,
    transform: entry.transform
  }));
}
function getHtmlHostOrder(layers) {
  const order = /* @__PURE__ */ new Map();
  let nextOrder = 1;
  for (const layer of layers) {
    if (layer.child instanceof Html) {
      if (layer.child.width > 0 && layer.child.height > 0) {
        order.set(layer.child, nextOrder);
        nextOrder += 1;
      }
      continue;
    }
    for (const glassLayer of getSortedGlassLayers(layer.child)) {
      for (const htmlLayer of getSortedGlassHtmlLayers(glassLayer.glass)) {
        const html = htmlLayer.html;
        if (html.width > 0 && html.height > 0) {
          order.set(html, nextOrder);
          nextOrder += 1;
        }
      }
    }
  }
  return order;
}

// src/renderer/dom-content-sync.ts
function changedElementsIncludeHost(changedElements, hosts) {
  for (const element of changedElements) {
    for (const host of hosts) {
      if (element === host || host.contains(element)) {
        return true;
      }
    }
  }
  return false;
}
function syncHtmlHost(host, canvas, transform, zIndex) {
  if (host.parentElement !== canvas) {
    canvas.append(host);
  }
  if (host.style.transform !== transform) {
    host.style.transform = transform;
  }
  if (host.style.zIndex !== zIndex) {
    host.style.zIndex = zIndex;
  }
}
function syncHtmlHostDomOrder(canvas, hostOrder) {
  const desiredHosts = [...hostOrder.entries()].sort((left, right) => left[1] - right[1]).map(([html]) => html.host).filter((host) => host.parentElement === canvas);
  const managedHosts = new Set(desiredHosts);
  const currentHosts = Array.from(canvas.children).filter((child) => managedHosts.has(child));
  if (currentHosts.length === desiredHosts.length && currentHosts.every((host, index) => host === desiredHosts[index])) {
    return;
  }
  for (const host of desiredHosts) {
    canvas.append(host);
  }
}
function getCopiedCssSize(copiedDeviceSize, deviceSize, cssSize) {
  if (copiedDeviceSize <= 0 || deviceSize <= 0 || cssSize <= 0) {
    return 0;
  }
  return copiedDeviceSize / deviceSize * cssSize;
}
function getTextureUvScale(deviceSize, cssSize, textureSize) {
  if (deviceSize <= 0 || cssSize <= 0 || textureSize <= 0) {
    return 0;
  }
  return deviceSize / cssSize / textureSize;
}
var DomContentSync = class {
  /** Creates a DOM content sync helper for one renderer canvas. */
  constructor(options) {
    this.options = options;
  }
  options;
  /** Hosts for scene-attached HTML nodes currently managed by the renderer. */
  sceneHtmlHosts = /* @__PURE__ */ new Set();
  /** Hosts for glass-attached HTML nodes currently managed by the renderer. */
  glassContentHosts = /* @__PURE__ */ new Set();
  device = null;
  presentationFormat = null;
  sceneHtmlEntries = /* @__PURE__ */ new Map();
  glassContentEntries = /* @__PURE__ */ new Map();
  glassContentRanges = /* @__PURE__ */ new Map();
  glassContentOrder = [];
  needsSceneHtmlCopy = false;
  needsSceneHtmlFilter = false;
  needsContentCopy = false;
  needsContentFilter = false;
  contentEntriesBuffer = null;
  glassContentAtlas = null;
  glassContentAtlasWidth = 0;
  glassContentAtlasHeight = 0;
  sampler = null;
  htmlBlurResources = null;
  /** Current atlas texture for glass-attached HTML content, if any exists. */
  get atlasTexture() {
    return this.glassContentAtlas;
  }
  /** Binding resource for content entries, or null before GPU allocation. */
  get contentEntriesBindingResource() {
    return this.contentEntriesBuffer?.buffer ? this.contentEntriesBuffer.bindingResource : null;
  }
  /** Attaches GPU resources and creates the fallback content-entry buffer. */
  setDevice(device, presentationFormat) {
    this.device = device;
    this.presentationFormat = presentationFormat;
    this.sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge"
    });
    destroyAdaptiveBlurResources(this.htmlBlurResources);
    this.htmlBlurResources = createAdaptiveBlurResources(device, presentationFormat);
    this.contentEntriesBuffer?.destroy();
    this.contentEntriesBuffer = new GpuStructArrayBuffer(
      device,
      ContentDataLayout,
      GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST
    );
    this.contentEntriesBuffer.ensureCapacity(0);
  }
  /** Removes DOM hosts and destroys all GPU resources owned by this helper. */
  destroy() {
    for (const entry of this.sceneHtmlEntries.values()) {
      entry.texture?.destroy();
      destroyAdaptiveBlurTargetChain(entry.blurTargetChain);
      entry.html.host.remove();
    }
    this.sceneHtmlEntries.clear();
    this.sceneHtmlHosts.clear();
    for (const entry of this.glassContentEntries.values()) {
      entry.sourceTexture?.destroy();
      destroyAdaptiveBlurTargetChain(entry.blurTargetChain);
      entry.html.host.remove();
    }
    this.glassContentEntries.clear();
    this.glassContentRanges.clear();
    this.glassContentOrder = [];
    this.glassContentHosts.clear();
    this.glassContentAtlas?.destroy();
    this.glassContentAtlas = null;
    this.glassContentAtlasWidth = 0;
    this.glassContentAtlasHeight = 0;
    this.contentEntriesBuffer?.destroy();
    this.contentEntriesBuffer = null;
    destroyAdaptiveBlurResources(this.htmlBlurResources);
    this.htmlBlurResources = null;
    this.sampler = null;
  }
  /** Handles canvas paint events by copying changed DOM hosts into textures. */
  handlePaintEvent(event) {
    if (!this.device) {
      return;
    }
    const changedElements = event.changedElements;
    const hasChangedElements = Array.isArray(changedElements);
    const shouldCopySceneHtml = this.needsSceneHtmlCopy || !hasChangedElements || changedElementsIncludeHost(changedElements, this.sceneHtmlHosts);
    const shouldCopyContent = this.needsContentCopy || !hasChangedElements || changedElementsIncludeHost(changedElements, this.glassContentHosts);
    if (shouldCopySceneHtml) {
      this.copySceneHtmlTextures();
    }
    if (this.needsSceneHtmlFilter) {
      this.filterSceneHtmlTextures();
    }
    if (shouldCopyContent) {
      this.copyGlassContentAtlas();
    }
    if (this.needsContentFilter) {
      this.filterGlassContentAtlas();
    }
  }
  /** Attempts any pending DOM-to-texture copies immediately. */
  copyPending() {
    if (this.needsSceneHtmlCopy) {
      this.copySceneHtmlTextures();
    }
    if (this.needsSceneHtmlFilter) {
      this.filterSceneHtmlTextures();
    }
    if (this.needsContentCopy) {
      this.copyGlassContentAtlas();
    }
    if (this.needsContentFilter) {
      this.filterGlassContentAtlas();
    }
  }
  /** Synchronizes managed HTML hosts and GPU content state with the scene. */
  sync(layers, containers, hostOrder) {
    this.syncSceneHtml(layers, hostOrder);
    this.syncGlassContent(containers, hostOrder);
    syncHtmlHostDomOrder(this.options.targetCanvas, hostOrder);
  }
  /** Returns GPU state for a scene-attached HTML node. */
  getSceneHtmlEntry(html) {
    return this.sceneHtmlEntries.get(html) ?? null;
  }
  /** Returns the storage-buffer range for a glass node's attached HTML. */
  getGlassContentRange(glass) {
    return this.glassContentRanges.get(glass) ?? null;
  }
  /** Removes one scene-attached HTML entry and optionally keeps its host mounted. */
  removeSceneHtmlEntry(html, keepHostMounted) {
    const entry = this.sceneHtmlEntries.get(html);
    if (!entry) {
      return;
    }
    entry.texture?.destroy();
    destroyAdaptiveBlurTargetChain(entry.blurTargetChain);
    this.sceneHtmlHosts.delete(html.host);
    this.sceneHtmlEntries.delete(html);
    if (!keepHostMounted) {
      html.host.remove();
    }
  }
  /** Removes one glass-attached HTML entry and optionally keeps its host mounted. */
  removeGlassContentEntry(html, keepHostMounted) {
    const entry = this.glassContentEntries.get(html);
    if (!entry) {
      return;
    }
    entry.sourceTexture?.destroy();
    destroyAdaptiveBlurTargetChain(entry.blurTargetChain);
    this.glassContentHosts.delete(html.host);
    this.glassContentEntries.delete(html);
    if (!keepHostMounted) {
      html.host.remove();
    }
  }
  /** Synchronizes textures and transforms for scene-attached HTML layers. */
  syncSceneHtml(layers, hostOrder) {
    const activeHtml = /* @__PURE__ */ new Set();
    let layoutChanged = false;
    let contentChanged = false;
    const currentDpr = this.options.getCurrentDpr();
    for (const layer of layers) {
      if (!(layer.child instanceof Html) || layer.child.width <= 0 || layer.child.height <= 0) {
        continue;
      }
      const html = layer.child;
      activeHtml.add(html);
      let entry = this.sceneHtmlEntries.get(html);
      if (!entry) {
        entry = {
          html,
          texture: null,
          filteredTexture: null,
          elementVersion: -1,
          blur: -1,
          width: -1,
          height: -1,
          deviceWidth: 0,
          deviceHeight: 0,
          copiedDeviceWidth: 0,
          copiedDeviceHeight: 0,
          textureWidth: 0,
          textureHeight: 0,
          blurTargetChain: null,
          transform: layer.transform,
          inverseTransform: null
        };
        this.sceneHtmlEntries.set(html, entry);
        layoutChanged = true;
        contentChanged = true;
      }
      entry.transform = layer.transform;
      entry.inverseTransform = invertMatrix(scaleOutputMatrix(layer.transform, currentDpr));
      if (entry.elementVersion !== html._elementVersion) {
        entry.elementVersion = html._elementVersion;
        contentChanged = true;
      }
      if (entry.blur !== html.blur) {
        entry.blur = html.blur;
        this.needsSceneHtmlFilter = true;
      }
      const previousDeviceWidth = entry.deviceWidth;
      const previousDeviceHeight = entry.deviceHeight;
      const nextDeviceWidth = Math.max(1, Math.round(html.width * currentDpr));
      const nextDeviceHeight = Math.max(1, Math.round(html.height * currentDpr));
      let nextTextureWidth = entry.textureWidth;
      let nextTextureHeight = entry.textureHeight;
      let textureSizeChanged = false;
      if (this.device) {
        nextTextureWidth = getTextureBucketSize(nextDeviceWidth, this.device.limits.maxTextureDimension2D);
        nextTextureHeight = getTextureBucketSize(nextDeviceHeight, this.device.limits.maxTextureDimension2D);
        textureSizeChanged = entry.textureWidth !== nextTextureWidth || entry.textureHeight !== nextTextureHeight;
      }
      const contentSizeChanged = entry.deviceWidth !== nextDeviceWidth || entry.deviceHeight !== nextDeviceHeight;
      if (entry.width !== html.width || entry.height !== html.height || contentSizeChanged) {
        entry.width = html.width;
        entry.height = html.height;
        entry.deviceWidth = nextDeviceWidth;
        entry.deviceHeight = nextDeviceHeight;
        layoutChanged = true;
        contentChanged = true;
      }
      if (this.device && this.presentationFormat) {
        const rebuildTexture = !entry.texture || textureSizeChanged;
        if (rebuildTexture) {
          const previousTexture = entry.texture;
          const nextTexture = this.device.createTexture({
            size: {
              width: nextTextureWidth,
              height: nextTextureHeight,
              depthOrArrayLayers: 1
            },
            format: this.presentationFormat,
            // Required by Chrome's experimental DOM-to-texture copy path for scene Html layers.
            usage: GPU_TEXTURE_USAGE.COPY_SRC | GPU_TEXTURE_USAGE.TEXTURE_BINDING | GPU_TEXTURE_USAGE.COPY_DST | GPU_TEXTURE_USAGE.RENDER_ATTACHMENT
          });
          if (previousTexture) {
            const encoder = this.device.createCommandEncoder();
            const copiedDeviceWidth = Math.min(entry.copiedDeviceWidth, previousDeviceWidth, nextTextureWidth);
            const copiedDeviceHeight = Math.min(entry.copiedDeviceHeight, previousDeviceHeight, nextTextureHeight);
            const copied = copyTextureRegion(encoder, previousTexture, nextTexture, {
              sourceX: 0,
              sourceY: 0,
              destinationX: 0,
              destinationY: 0,
              width: copiedDeviceWidth,
              height: copiedDeviceHeight
            });
            if (copied) {
              this.device.queue.submit([encoder.finish()]);
            }
            entry.copiedDeviceWidth = copiedDeviceWidth;
            entry.copiedDeviceHeight = copiedDeviceHeight;
          } else {
            entry.copiedDeviceWidth = 0;
            entry.copiedDeviceHeight = 0;
          }
          previousTexture?.destroy();
          destroyAdaptiveBlurTargetChain(entry.blurTargetChain);
          entry.texture = nextTexture;
          entry.filteredTexture = null;
          entry.blurTargetChain = null;
          entry.textureWidth = nextTextureWidth;
          entry.textureHeight = nextTextureHeight;
          layoutChanged = true;
          contentChanged = true;
        }
      }
      if (entry.texture) {
        this.sceneHtmlHosts.add(html.host);
        syncHtmlHost(
          html.host,
          this.options.targetCanvas,
          matrixToCssTransform(layer.transform),
          String(hostOrder.get(html) ?? 0)
        );
      }
    }
    for (const html of [...this.sceneHtmlEntries.keys()]) {
      if (!activeHtml.has(html)) {
        this.removeSceneHtmlEntry(html, hostOrder.has(html));
        layoutChanged = true;
        contentChanged = true;
      }
    }
    if (activeHtml.size === 0) {
      this.needsSceneHtmlCopy = false;
      this.needsSceneHtmlFilter = false;
      return;
    }
    if (layoutChanged || contentChanged) {
      this.needsSceneHtmlCopy = true;
    }
  }
  /** Synchronizes glass-attached HTML entries and atlas packing. */
  syncGlassContent(containers, hostOrder) {
    const activeContentHtml = /* @__PURE__ */ new Set();
    const activeEntries = [];
    const nextRanges = /* @__PURE__ */ new Map();
    const previousAtlasTexture = this.glassContentAtlas;
    const previousAtlasEntries = /* @__PURE__ */ new Map();
    const currentDpr = this.options.getCurrentDpr();
    let layoutChanged = false;
    let contentChanged = false;
    if (previousAtlasTexture) {
      for (const entry of this.glassContentEntries.values()) {
        previousAtlasEntries.set(entry.html, {
          copiedDeviceWidth: entry.copiedDeviceWidth,
          copiedDeviceHeight: entry.copiedDeviceHeight,
          atlasX: entry.atlasX,
          atlasY: entry.atlasY
        });
      }
    }
    for (const containerEntry of containers) {
      const containerTransform = containerEntry.transform;
      for (const glassLayer of getSortedGlassLayers(containerEntry.container)) {
        const glass = glassLayer.glass;
        if (glass.width <= 0 || glass.height <= 0) {
          continue;
        }
        const glassTransform = multiplyMatrices(containerTransform, glassLayer.transform);
        const contentStart = activeEntries.length;
        for (const htmlLayer of getSortedGlassHtmlLayers(glass)) {
          const html = htmlLayer.html;
          if (html.width <= 0 || html.height <= 0) {
            continue;
          }
          const inverseTransform = invertMatrix(htmlLayer.transform);
          this.glassContentHosts.add(html.host);
          syncHtmlHost(
            html.host,
            this.options.targetCanvas,
            matrixToCssTransform(multiplyMatrices(glassTransform, htmlLayer.transform)),
            String(hostOrder.get(html) ?? 0)
          );
          if (!inverseTransform) {
            continue;
          }
          activeContentHtml.add(html);
          let contentEntry = this.glassContentEntries.get(html);
          if (!contentEntry) {
            contentEntry = {
              html,
              glass,
              elementVersion: -1,
              blur: -1,
              width: -1,
              height: -1,
              deviceWidth: 0,
              deviceHeight: 0,
              copiedDeviceWidth: 0,
              copiedDeviceHeight: 0,
              sourceTexture: null,
              sourceTextureWidth: 0,
              sourceTextureHeight: 0,
              filteredTexture: null,
              blurTargetChain: null,
              atlasX: 0,
              atlasY: 0,
              inverseTransform
            };
            this.glassContentEntries.set(html, contentEntry);
            layoutChanged = true;
            contentChanged = true;
          }
          if (contentEntry.glass !== glass) {
            contentEntry.glass = glass;
            layoutChanged = true;
          }
          contentEntry.inverseTransform = inverseTransform;
          if (contentEntry.elementVersion !== html._elementVersion) {
            contentEntry.elementVersion = html._elementVersion;
            contentChanged = true;
          }
          const nextDeviceWidth = Math.max(1, Math.round(html.width * currentDpr));
          const nextDeviceHeight = Math.max(1, Math.round(html.height * currentDpr));
          let nextSourceTextureWidth = contentEntry.sourceTextureWidth;
          let nextSourceTextureHeight = contentEntry.sourceTextureHeight;
          let sourceTextureSizeChanged = false;
          if (this.device) {
            nextSourceTextureWidth = getTextureBucketSize(nextDeviceWidth, this.device.limits.maxTextureDimension2D);
            nextSourceTextureHeight = getTextureBucketSize(nextDeviceHeight, this.device.limits.maxTextureDimension2D);
            sourceTextureSizeChanged = contentEntry.sourceTextureWidth !== nextSourceTextureWidth || contentEntry.sourceTextureHeight !== nextSourceTextureHeight;
          }
          if (contentEntry.width !== html.width || contentEntry.height !== html.height || contentEntry.deviceWidth !== nextDeviceWidth || contentEntry.deviceHeight !== nextDeviceHeight) {
            contentEntry.width = html.width;
            contentEntry.height = html.height;
            contentEntry.deviceWidth = nextDeviceWidth;
            contentEntry.deviceHeight = nextDeviceHeight;
            layoutChanged = true;
            contentChanged = true;
          }
          if (contentEntry.blur !== html.blur) {
            contentEntry.blur = html.blur;
            this.needsContentFilter = true;
          }
          if (this.device && this.presentationFormat) {
            const rebuildSourceTexture = !contentEntry.sourceTexture || sourceTextureSizeChanged;
            if (rebuildSourceTexture) {
              contentEntry.sourceTexture?.destroy();
              destroyAdaptiveBlurTargetChain(contentEntry.blurTargetChain);
              contentEntry.sourceTexture = createRenderTarget(
                this.device,
                this.presentationFormat,
                nextSourceTextureWidth,
                nextSourceTextureHeight
              );
              contentEntry.sourceTextureWidth = nextSourceTextureWidth;
              contentEntry.sourceTextureHeight = nextSourceTextureHeight;
              contentEntry.filteredTexture = null;
              contentEntry.blurTargetChain = null;
              contentEntry.copiedDeviceWidth = 0;
              contentEntry.copiedDeviceHeight = 0;
              contentChanged = true;
            }
          }
          activeEntries.push(contentEntry);
        }
        const contentCount = activeEntries.length - contentStart;
        if (contentCount > 0) {
          nextRanges.set(glass, {
            start: contentStart,
            count: contentCount
          });
        }
      }
    }
    for (const html of [...this.glassContentEntries.keys()]) {
      if (!activeContentHtml.has(html)) {
        this.removeGlassContentEntry(html, hostOrder.has(html));
        layoutChanged = true;
        contentChanged = true;
      }
    }
    this.glassContentOrder = activeEntries;
    this.glassContentRanges.clear();
    for (const [glass, range] of nextRanges) {
      this.glassContentRanges.set(glass, range);
    }
    if (!this.device) {
      this.needsContentCopy = false;
      return;
    }
    if (activeEntries.length === 0) {
      this.glassContentAtlas?.destroy();
      this.glassContentAtlas = null;
      this.glassContentAtlasWidth = 0;
      this.glassContentAtlasHeight = 0;
      this.needsContentCopy = false;
      this.needsContentFilter = false;
      return;
    }
    if (layoutChanged || !this.glassContentAtlas) {
      const layout = packContentAtlas(activeEntries, this.device.limits.maxTextureDimension2D);
      const nextAtlasWidth = layout.width;
      const nextAtlasHeight = layout.height;
      const previousAtlasWidth = this.glassContentAtlasWidth;
      const previousAtlasHeight = this.glassContentAtlasHeight;
      const atlasLayoutChanged = !this.glassContentAtlas || nextAtlasWidth !== this.glassContentAtlasWidth || nextAtlasHeight !== this.glassContentAtlasHeight || activeEntries.some((entry) => {
        const rect = layout.rects.get(entry.html);
        return entry.atlasX !== rect.x || entry.atlasY !== rect.y;
      });
      if (atlasLayoutChanged) {
        const nextAtlas = this.device.createTexture({
          size: {
            width: nextAtlasWidth,
            height: nextAtlasHeight,
            depthOrArrayLayers: 1
          },
          format: this.presentationFormat ?? "bgra8unorm",
          usage: GPU_TEXTURE_USAGE.COPY_SRC | GPU_TEXTURE_USAGE.TEXTURE_BINDING | GPU_TEXTURE_USAGE.COPY_DST | GPU_TEXTURE_USAGE.RENDER_ATTACHMENT
        });
        if (previousAtlasTexture) {
          const encoder = this.device.createCommandEncoder();
          let copiedAny = false;
          for (const entry of activeEntries) {
            const previousEntry = previousAtlasEntries.get(entry.html);
            const rect = layout.rects.get(entry.html);
            if (!previousEntry) {
              entry.copiedDeviceWidth = 0;
              entry.copiedDeviceHeight = 0;
              continue;
            }
            const sourceX = previousEntry.atlasX + CONTENT_ATLAS_PADDING;
            const sourceY = previousEntry.atlasY + CONTENT_ATLAS_PADDING;
            const destinationX = rect.x + CONTENT_ATLAS_PADDING;
            const destinationY = rect.y + CONTENT_ATLAS_PADDING;
            const copiedDeviceWidth = Math.min(
              previousEntry.copiedDeviceWidth,
              previousAtlasWidth - sourceX,
              nextAtlasWidth - destinationX
            );
            const copiedDeviceHeight = Math.min(
              previousEntry.copiedDeviceHeight,
              previousAtlasHeight - sourceY,
              nextAtlasHeight - destinationY
            );
            copiedAny = copyTextureRegion(encoder, previousAtlasTexture, nextAtlas, {
              sourceX,
              sourceY,
              destinationX,
              destinationY,
              width: copiedDeviceWidth,
              height: copiedDeviceHeight
            }) || copiedAny;
            entry.copiedDeviceWidth = Math.max(0, copiedDeviceWidth);
            entry.copiedDeviceHeight = Math.max(0, copiedDeviceHeight);
          }
          if (copiedAny) {
            this.device.queue.submit([encoder.finish()]);
          }
        } else {
          for (const entry of activeEntries) {
            entry.copiedDeviceWidth = 0;
            entry.copiedDeviceHeight = 0;
          }
        }
        previousAtlasTexture?.destroy();
        this.glassContentAtlas = nextAtlas;
        this.glassContentAtlasWidth = nextAtlasWidth;
        this.glassContentAtlasHeight = nextAtlasHeight;
      }
      for (const entry of activeEntries) {
        const rect = layout.rects.get(entry.html);
        entry.atlasX = rect.x;
        entry.atlasY = rect.y;
      }
      this.needsContentCopy = true;
      this.needsContentFilter = true;
    } else if (contentChanged) {
      this.needsContentCopy = true;
    }
    this.writeContentEntries(activeEntries);
  }
  /** Writes glass content metadata into the storage buffer. */
  writeContentEntries(entries) {
    if (!this.contentEntriesBuffer) {
      return;
    }
    this.contentEntriesBuffer.ensureCapacity(entries.length);
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const inverse = entry.inverseTransform;
      this.contentEntriesBuffer.writeAt(index, {
        inverse0: {
          a: inverse.a,
          c: inverse.c,
          e: inverse.e,
          copiedWidth: getCopiedCssSize(entry.copiedDeviceWidth, entry.deviceWidth, entry.width)
        },
        inverse1: {
          b: inverse.b,
          d: inverse.d,
          f: inverse.f,
          copiedHeight: getCopiedCssSize(entry.copiedDeviceHeight, entry.deviceHeight, entry.height)
        },
        atlasRect: {
          u: (entry.atlasX + CONTENT_ATLAS_PADDING) / this.glassContentAtlasWidth,
          v: (entry.atlasY + CONTENT_ATLAS_PADDING) / this.glassContentAtlasHeight,
          uScale: getTextureUvScale(entry.deviceWidth, entry.width, this.glassContentAtlasWidth),
          vScale: getTextureUvScale(entry.deviceHeight, entry.height, this.glassContentAtlasHeight)
        },
        opacity: {
          value: entry.html.opacity
        }
      });
    }
    this.contentEntriesBuffer.upload(entries.length);
  }
  /** Copies scene-attached HTML hosts into their individual textures. */
  copySceneHtmlTextures() {
    if (!this.device || this.sceneHtmlEntries.size === 0) {
      this.needsSceneHtmlCopy = false;
      return true;
    }
    let copiedAll = true;
    let copiedAny = false;
    for (const entry of this.sceneHtmlEntries.values()) {
      if (!entry.texture) {
        copiedAll = false;
        continue;
      }
      try {
        ;
        this.device.queue.copyElementImageToTexture(
          entry.html.host,
          entry.deviceWidth,
          entry.deviceHeight,
          { texture: entry.texture }
        );
        entry.copiedDeviceWidth = entry.deviceWidth;
        entry.copiedDeviceHeight = entry.deviceHeight;
        copiedAny = true;
      } catch (error) {
        copiedAll = false;
        if (!(error instanceof DOMException && error.name === "InvalidStateError")) {
          console.error(error);
        }
      }
    }
    if (copiedAny) {
      this.needsSceneHtmlFilter = true;
    }
    this.needsSceneHtmlCopy = !copiedAll;
    return copiedAll;
  }
  /** Applies GPU blur to scene-attached HTML textures when requested. */
  filterSceneHtmlTextures() {
    if (!this.device || !this.sampler || !this.htmlBlurResources) {
      this.needsSceneHtmlFilter = false;
      return true;
    }
    const encoder = this.device.createCommandEncoder();
    let filteredAny = false;
    for (const entry of this.sceneHtmlEntries.values()) {
      entry.filteredTexture = null;
      if (!entry.texture || entry.copiedDeviceWidth <= 0 || entry.copiedDeviceHeight <= 0) {
        continue;
      }
      const blurRadiusPx = entry.html.blur * this.options.getCurrentDpr();
      if (blurRadiusPx <= 0) {
        continue;
      }
      if (!entry.blurTargetChain || entry.blurTargetChain.levels[0]?.width !== entry.textureWidth || entry.blurTargetChain.levels[0]?.height !== entry.textureHeight) {
        destroyAdaptiveBlurTargetChain(entry.blurTargetChain);
        entry.blurTargetChain = createAdaptiveBlurTargetChain(
          this.device,
          this.presentationFormat ?? "bgra8unorm",
          entry.textureWidth,
          entry.textureHeight
        );
      }
      entry.filteredTexture = renderAdaptiveBlur({
        device: this.device,
        sampler: this.sampler,
        encoder,
        source: entry.texture,
        radiusPx: blurRadiusPx,
        chain: entry.blurTargetChain,
        resources: this.htmlBlurResources
      });
      filteredAny = true;
    }
    if (filteredAny) {
      this.device.queue.submit([encoder.finish()]);
    }
    this.needsSceneHtmlFilter = false;
    return true;
  }
  /** Copies glass-attached HTML hosts into per-node source textures. */
  copyGlassContentAtlas() {
    if (!this.device || this.glassContentOrder.length === 0) {
      this.needsContentCopy = false;
      return true;
    }
    let copiedAll = true;
    let copiedAny = false;
    for (const entry of this.glassContentOrder) {
      if (!entry.sourceTexture) {
        copiedAll = false;
        continue;
      }
      try {
        ;
        this.device.queue.copyElementImageToTexture(
          entry.html.host,
          entry.deviceWidth,
          entry.deviceHeight,
          { texture: entry.sourceTexture }
        );
        entry.copiedDeviceWidth = entry.deviceWidth;
        entry.copiedDeviceHeight = entry.deviceHeight;
        copiedAny = true;
      } catch (error) {
        copiedAll = false;
        if (!(error instanceof DOMException && error.name === "InvalidStateError")) {
          console.error(error);
        }
      }
    }
    if (copiedAny) {
      this.needsContentFilter = true;
    }
    this.needsContentCopy = !copiedAll;
    return copiedAll;
  }
  /** Applies GPU blur to glass-attached HTML sources and writes the result into the content atlas. */
  filterGlassContentAtlas() {
    if (!this.device || !this.sampler || !this.htmlBlurResources || !this.glassContentAtlas || this.glassContentOrder.length === 0) {
      this.needsContentFilter = false;
      return true;
    }
    const encoder = this.device.createCommandEncoder();
    let copiedAny = false;
    for (const entry of this.glassContentOrder) {
      if (!entry.sourceTexture || entry.copiedDeviceWidth <= 0 || entry.copiedDeviceHeight <= 0) {
        continue;
      }
      let sourceTexture = entry.sourceTexture;
      const blurRadiusPx = entry.html.blur * this.options.getCurrentDpr();
      entry.filteredTexture = null;
      if (blurRadiusPx > 0) {
        if (!entry.blurTargetChain || entry.blurTargetChain.levels[0]?.width !== entry.sourceTextureWidth || entry.blurTargetChain.levels[0]?.height !== entry.sourceTextureHeight) {
          destroyAdaptiveBlurTargetChain(entry.blurTargetChain);
          entry.blurTargetChain = createAdaptiveBlurTargetChain(
            this.device,
            this.presentationFormat ?? "bgra8unorm",
            entry.sourceTextureWidth,
            entry.sourceTextureHeight
          );
        }
        entry.filteredTexture = renderAdaptiveBlur({
          device: this.device,
          sampler: this.sampler,
          encoder,
          source: entry.sourceTexture,
          radiusPx: blurRadiusPx,
          chain: entry.blurTargetChain,
          resources: this.htmlBlurResources
        });
        sourceTexture = entry.filteredTexture;
      }
      copiedAny = copyTextureRegion(encoder, sourceTexture, this.glassContentAtlas, {
        sourceX: 0,
        sourceY: 0,
        destinationX: entry.atlasX + CONTENT_ATLAS_PADDING,
        destinationY: entry.atlasY + CONTENT_ATLAS_PADDING,
        width: entry.copiedDeviceWidth,
        height: entry.copiedDeviceHeight
      }) || copiedAny;
    }
    if (copiedAny) {
      this.writeContentEntries(this.glassContentOrder);
      this.device.queue.submit([encoder.finish()]);
    }
    this.needsContentFilter = false;
    return true;
  }
};

// src/renderer/pointer-controller.ts
function eventTargetsHost(event, hosts) {
  const path = event.composedPath();
  for (const host of hosts) {
    if (path.includes(host)) {
      return true;
    }
  }
  return false;
}
var PointerController = class {
  /** Creates a pointer controller for one renderer canvas. */
  constructor(options) {
    this.options = options;
  }
  options;
  glassInteractionEntries = /* @__PURE__ */ new Map();
  glassInteractionOrder = [];
  pointerStates = /* @__PURE__ */ new Map();
  /** Native pointermove listener wired to the renderer canvas. */
  handlePointerMove = (event) => {
    this.handleNativePointerEvent("pointermove", event);
  };
  /** Native pointerdown listener wired to the renderer canvas. */
  handlePointerDown = (event) => {
    this.handleNativePointerEvent("pointerdown", event);
  };
  /** Native pointerup listener wired to the renderer canvas. */
  handlePointerUp = (event) => {
    this.handleNativePointerEvent("pointerup", event);
  };
  /** Native pointercancel listener wired to the renderer canvas. */
  handlePointerCancel = (event) => {
    this.handleNativePointerEvent("pointercancel", event);
  };
  /** Native pointerleave listener wired to the renderer canvas. */
  handlePointerLeave = (event) => {
    if (!this.isTargetCanvasLeave(event)) {
      return;
    }
    this.handleNativePointerEvent("pointerleave", event);
  };
  /** Rebuilds hit-test entries after scene or layout changes. */
  syncInteractions(containers) {
    const previousEntries = this.glassInteractionEntries;
    const { entriesByGlass, orderedEntries } = createGlassInteractionEntries(containers);
    this.glassInteractionEntries = entriesByGlass;
    this.glassInteractionOrder = orderedEntries;
    this.handleRemovedInteractionTargets(previousEntries);
  }
  /** Clears cached hit-test entries and pointer state. */
  clear() {
    this.glassInteractionEntries.clear();
    this.glassInteractionOrder = [];
    this.pointerStates.clear();
  }
  /** Returns existing pointer state or initializes one for a native pointer id. */
  getPointerState(pointerId) {
    let state = this.pointerStates.get(pointerId);
    if (state) {
      return state;
    }
    state = {
      hoveredGlass: null,
      capturedGlass: null,
      capturedWithNativePointerCapture: false,
      pressedGlass: null,
      lastSnapshot: null
    };
    this.pointerStates.set(pointerId, state);
    return state;
  }
  /** Captures canvas-relative pointer coordinates for event dispatch. */
  createPointerSnapshot(event) {
    const bounds = this.options.targetCanvas.getBoundingClientRect();
    return {
      nativeEvent: event,
      canvasX: event.clientX - bounds.left,
      canvasY: event.clientY - bounds.top
    };
  }
  /** Returns whether a native pointerleave means the pointer left the renderer canvas itself. */
  isTargetCanvasLeave(event) {
    if (event.target !== this.options.targetCanvas) {
      return false;
    }
    const relatedTarget = event.relatedTarget;
    return !(relatedTarget instanceof Node && this.options.targetCanvas.contains(relatedTarget));
  }
  /** Dispatches a synthetic glass pointer event and mirrors preventDefault. */
  dispatchGlassPointerEvent(type, glass, entry, snapshot, inside) {
    const localPoint = entry ? measureGlassInteractionEntry(entry, snapshot.canvasX, snapshot.canvasY) : { localX: 0, localY: 0 };
    const event = new GlassPointerEvent(type, {
      glass,
      renderer: this.options.renderer,
      nativeEvent: snapshot.nativeEvent,
      canvasX: snapshot.canvasX,
      canvasY: snapshot.canvasY,
      localX: localPoint.localX,
      localY: localPoint.localY,
      inside
    });
    glass.dispatchEvent(event);
    if (event.defaultPrevented) {
      snapshot.nativeEvent.preventDefault();
    }
  }
  /** Sends enter/leave events when the hovered glass target changes. */
  updateHoveredGlass(state, nextEntry, snapshot) {
    const currentGlass = state.hoveredGlass;
    const nextGlass = nextEntry?.glass ?? null;
    if (currentGlass === nextGlass) {
      return;
    }
    if (currentGlass) {
      const currentEntry = this.glassInteractionEntries.get(currentGlass) ?? null;
      this.dispatchGlassPointerEvent("pointerleave", currentGlass, currentEntry, snapshot, false);
    }
    state.hoveredGlass = nextGlass;
    if (nextEntry) {
      this.dispatchGlassPointerEvent("pointerenter", nextEntry.glass, nextEntry, snapshot, true);
    }
  }
  /** Releases native pointer capture when the canvas currently owns it. */
  releaseNativePointerCapture(pointerId) {
    if (!this.options.targetCanvas.hasPointerCapture(pointerId)) {
      return;
    }
    try {
      this.options.targetCanvas.releasePointerCapture(pointerId);
    } catch {
    }
  }
  /** Removes idle pointer state after hover, capture, and press state are clear. */
  cleanupPointerState(pointerId, state) {
    if (state.hoveredGlass || state.capturedGlass || state.pressedGlass) {
      return;
    }
    this.pointerStates.delete(pointerId);
  }
  /** Flushes scene sync after handling an event and prunes idle pointer state. */
  finishPointerEvent(pointerId, state) {
    this.options.flushSceneContentSync();
    this.cleanupPointerState(pointerId, state);
  }
  /** Cancels or retargets pointer state when glass nodes leave the scene. */
  handleRemovedInteractionTargets(previousEntries) {
    for (const [pointerId, state] of this.pointerStates) {
      const snapshot = state.lastSnapshot;
      const capturedGlass = state.capturedGlass;
      if (capturedGlass && !this.glassInteractionEntries.has(capturedGlass)) {
        const previousEntry = previousEntries.get(capturedGlass) ?? null;
        if (snapshot) {
          this.dispatchGlassPointerEvent("pointercancel", capturedGlass, previousEntry, snapshot, false);
        }
        state.capturedGlass = null;
        state.capturedWithNativePointerCapture = false;
        state.pressedGlass = null;
        this.releaseNativePointerCapture(pointerId);
      }
      const hoveredGlass = state.hoveredGlass;
      if (hoveredGlass && !this.glassInteractionEntries.has(hoveredGlass)) {
        const previousEntry = previousEntries.get(hoveredGlass) ?? null;
        if (snapshot) {
          this.dispatchGlassPointerEvent("pointerleave", hoveredGlass, previousEntry, snapshot, false);
        }
        state.hoveredGlass = null;
      }
      if (!state.capturedGlass && snapshot) {
        this.updateHoveredGlass(
          state,
          hitTestGlassInteractionEntries(this.glassInteractionOrder, snapshot.canvasX, snapshot.canvasY),
          snapshot
        );
      }
      this.cleanupPointerState(pointerId, state);
    }
  }
  /** Handles native pointer events and dispatches the matching glass events. */
  handleNativePointerEvent(type, event) {
    if (this.options.isDestroyed()) {
      return;
    }
    this.options.flushSceneContentSync();
    const state = this.getPointerState(event.pointerId);
    const snapshot = this.createPointerSnapshot(event);
    state.lastSnapshot = snapshot;
    const capturedEntry = state.capturedGlass ? this.glassInteractionEntries.get(state.capturedGlass) ?? null : null;
    if (capturedEntry) {
      if (type === "pointerleave") {
        if (!state.capturedWithNativePointerCapture) {
          this.dispatchGlassPointerEvent("pointercancel", capturedEntry.glass, capturedEntry, snapshot, false);
          state.capturedGlass = null;
          state.capturedWithNativePointerCapture = false;
          state.pressedGlass = null;
          this.updateHoveredGlass(state, null, snapshot);
          this.cleanupPointerState(event.pointerId, state);
        }
        return;
      }
      const measurement = measureGlassInteractionEntry(capturedEntry, snapshot.canvasX, snapshot.canvasY);
      this.dispatchGlassPointerEvent(type, capturedEntry.glass, capturedEntry, snapshot, measurement.inside);
      if (type === "pointerup" || type === "pointercancel") {
        if (type === "pointerup" && event.button === 0 && state.pressedGlass === capturedEntry.glass && measurement.inside) {
          this.dispatchGlassPointerEvent("click", capturedEntry.glass, capturedEntry, snapshot, true);
        }
        state.capturedGlass = null;
        state.capturedWithNativePointerCapture = false;
        state.pressedGlass = null;
        this.releaseNativePointerCapture(event.pointerId);
        this.updateHoveredGlass(
          state,
          hitTestGlassInteractionEntries(this.glassInteractionOrder, snapshot.canvasX, snapshot.canvasY),
          snapshot
        );
      }
      this.finishPointerEvent(event.pointerId, state);
      return;
    }
    if (type === "pointerleave") {
      if (state.hoveredGlass) {
        const hoveredEntry = this.glassInteractionEntries.get(state.hoveredGlass) ?? null;
        this.dispatchGlassPointerEvent("pointerleave", state.hoveredGlass, hoveredEntry, snapshot, false);
        state.hoveredGlass = null;
      }
      this.finishPointerEvent(event.pointerId, state);
      return;
    }
    const hitEntry = hitTestGlassInteractionEntries(
      this.glassInteractionOrder,
      snapshot.canvasX,
      snapshot.canvasY
    );
    this.updateHoveredGlass(state, hitEntry, snapshot);
    if (hitEntry) {
      this.dispatchGlassPointerEvent(type, hitEntry.glass, hitEntry, snapshot, true);
      if (type === "pointerdown") {
        state.pressedGlass = hitEntry.glass;
        this.options.flushSceneContentSync();
        if (this.glassInteractionEntries.has(hitEntry.glass)) {
          state.capturedGlass = hitEntry.glass;
          state.capturedWithNativePointerCapture = false;
          if (!eventTargetsHost(event, this.options.getSceneHtmlHosts()) && !eventTargetsHost(event, this.options.getGlassContentHosts())) {
            try {
              this.options.targetCanvas.setPointerCapture(event.pointerId);
              state.capturedWithNativePointerCapture = true;
            } catch {
              state.capturedGlass = null;
              state.pressedGlass = null;
            }
          }
        }
      }
    }
    this.finishPointerEvent(event.pointerId, state);
  }
};

// src/renderer/metrics.ts
var BACKDROP_METRICS_SIZE = 32;
var BACKDROP_METRICS_BYTES_PER_ROW = 256;
var BACKDROP_METRICS_BUFFER_SIZE = BACKDROP_METRICS_BYTES_PER_ROW * BACKDROP_METRICS_SIZE;
function clamp2(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
function createEmptyBounds() {
  return {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY
  };
}
function expandBounds(bounds, x, y) {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
}
function hasBounds(bounds) {
  return Number.isFinite(bounds.minX) && Number.isFinite(bounds.minY) && Number.isFinite(bounds.maxX) && Number.isFinite(bounds.maxY) && bounds.maxX > bounds.minX && bounds.maxY > bounds.minY;
}
function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }
  if (values.length === 1) {
    return values[0];
  }
  const index = clamp2((values.length - 1) * p, 0, values.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const blend = index - lower;
  return values[lower] + (values[upper] - values[lower]) * blend;
}
function parseBackdropMetrics(buffer) {
  const bytes = new Uint8Array(buffer.getMappedRange());
  const luminances = [];
  let red = 0;
  let green = 0;
  let blue = 0;
  for (let y = 0; y < BACKDROP_METRICS_SIZE; y += 1) {
    const rowOffset = y * BACKDROP_METRICS_BYTES_PER_ROW;
    for (let x = 0; x < BACKDROP_METRICS_SIZE; x += 1) {
      const offset = rowOffset + x * 4;
      const alpha = bytes[offset + 3] / 255;
      if (alpha <= 0.5) {
        continue;
      }
      const linearRed = bytes[offset] / 255;
      const linearGreen = bytes[offset + 1] / 255;
      const linearBlue = bytes[offset + 2] / 255;
      const luminance = linearRed * 0.2126 + linearGreen * 0.7152 + linearBlue * 0.0722;
      red += linearRed;
      green += linearGreen;
      blue += linearBlue;
      luminances.push(luminance);
    }
  }
  if (luminances.length === 0) {
    return null;
  }
  luminances.sort((left, right) => left - right);
  const count = luminances.length;
  return {
    averageLinearColor: {
      r: red / count,
      g: green / count,
      b: blue / count
    },
    averageLuminance: luminances.reduce((sum, value) => sum + value, 0) / count,
    luminanceP10: percentile(luminances, 0.1),
    luminanceP50: percentile(luminances, 0.5),
    luminanceP90: percentile(luminances, 0.9)
  };
}

// src/renderer/backdrop-metrics-state.ts
var BackdropMetricsTracker = class {
  /** Creates a tracker that can query renderer teardown state. */
  constructor(isDestroyed) {
    this.isDestroyed = isDestroyed;
  }
  isDestroyed;
  device = null;
  stateByContainer = /* @__PURE__ */ new WeakMap();
  trackedContainers = /* @__PURE__ */ new Set();
  pendingStates = /* @__PURE__ */ new Set();
  /** Attaches the GPU device and allocates buffers for already tracked containers. */
  setDevice(device) {
    this.device = device;
    for (const container of this.trackedContainers) {
      const state = this.stateByContainer.get(container);
      if (state) {
        this.ensureResources(state);
      }
    }
  }
  /** Enables or disables metrics tracking for a container. */
  setTracking(container, enabled) {
    if (enabled) {
      const state2 = this.getOrCreateState(container);
      state2.cleanupAfterPending = false;
      this.trackedContainers.add(container);
      this.ensureResources(state2);
      return;
    }
    this.trackedContainers.delete(container);
    const state = this.stateByContainer.get(container);
    if (!state) {
      return;
    }
    state.metrics = null;
    state.inScene = false;
    if (state.pendingReadback) {
      state.cleanupAfterPending = true;
      return;
    }
    this.cleanupState(state);
  }
  /** Returns the latest completed metrics for a tracked in-scene container. */
  getMetrics(container) {
    if (!this.trackedContainers.has(container)) {
      return null;
    }
    const state = this.stateByContainer.get(container);
    if (!state || !state.inScene) {
      return null;
    }
    return state.metrics;
  }
  /** Returns mutable state for a tracked container, creating it if needed. */
  getTrackedState(container) {
    if (!this.trackedContainers.has(container)) {
      return null;
    }
    return this.getOrCreateState(container);
  }
  /** Allocates the readback buffer for a metrics state if possible. */
  ensureResources(state) {
    if (!this.device || state.readbackBuffer) {
      return;
    }
    state.readbackBuffer = this.device.createBuffer({
      size: BACKDROP_METRICS_BUFFER_SIZE,
      usage: GPU_BUFFER_USAGE.MAP_READ | GPU_BUFFER_USAGE.COPY_DST
    });
  }
  /** Marks which tracked containers were seen in the latest rendered scene. */
  markSceneMembership(seenContainers) {
    for (const container of this.trackedContainers) {
      const state = this.stateByContainer.get(container);
      if (!state) {
        continue;
      }
      state.inScene = seenContainers.has(container);
      if (!state.inScene) {
        state.metrics = null;
      }
    }
  }
  /** Starts an asynchronous readback and parses metrics when mapping completes. */
  scheduleReadback(state) {
    const readbackBuffer = state.readbackBuffer;
    if (!readbackBuffer || state.pendingReadback) {
      return;
    }
    state.pendingReadback = true;
    this.pendingStates.add(state);
    void readbackBuffer.mapAsync(GPUMapMode.READ).then(() => {
      if (this.isDestroyed() || !this.trackedContainers.has(state.container) || !state.inScene) {
        state.metrics = null;
        return;
      }
      const nextMetrics = parseBackdropMetrics(readbackBuffer);
      if (!nextMetrics) {
        state.metrics = null;
        return;
      }
      state.metrics = nextMetrics;
    }).catch((error) => {
      if (!this.isDestroyed() && !state.cleanupAfterPending) {
        console.error(error);
      }
      state.metrics = null;
    }).finally(() => {
      if (readbackBuffer.mapState === "mapped") {
        readbackBuffer.unmap();
      }
      state.pendingReadback = false;
      this.pendingStates.delete(state);
      if (this.isDestroyed() || state.cleanupAfterPending) {
        this.cleanupState(state);
      }
    });
  }
  /** Releases completed resources and marks pending readbacks for cleanup. */
  destroy() {
    for (const container of this.trackedContainers) {
      const state = this.stateByContainer.get(container);
      if (!state) {
        continue;
      }
      if (state.pendingReadback) {
        state.cleanupAfterPending = true;
      } else {
        this.cleanupState(state);
      }
    }
    this.trackedContainers.clear();
    for (const state of this.pendingStates) {
      state.cleanupAfterPending = true;
    }
  }
  /** Returns existing metrics state for a container or creates a new one. */
  getOrCreateState(container) {
    let state = this.stateByContainer.get(container);
    if (state) {
      return state;
    }
    state = {
      container,
      readbackBuffer: null,
      metrics: null,
      pendingReadback: false,
      inScene: false,
      cleanupAfterPending: false
    };
    this.stateByContainer.set(container, state);
    return state;
  }
  /** Releases a state readback buffer once it is no longer pending. */
  cleanupState(state) {
    if (state.pendingReadback) {
      state.cleanupAfterPending = true;
      return;
    }
    state.metrics = null;
    state.inScene = false;
    state.cleanupAfterPending = false;
    this.pendingStates.delete(state);
    state.readbackBuffer?.destroy();
    state.readbackBuffer = null;
  }
};

// src/renderer/core.ts
function resolveSpecularWidthPx(specularWidth, dpr) {
  return specularWidth === "hairline" ? 1 : specularWidth * dpr;
}
var DISPLACEMENT_FIELD_FORMAT = "rgba16float";
var SHADOW_MASK_FORMAT = "rgba8unorm";
function getSurfaceProfileIndex(profile) {
  if (profile === "convex") {
    return 0;
  }
  if (profile === "concave") {
    return 1;
  }
  return 2;
}
var WebGpuGlassCore = class {
  backdropMetrics = new BackdropMetricsTracker(() => this.destroyed);
  destroyed = false;
  currentDpr = 1;
  width = 1;
  height = 1;
  contentSource = null;
  contour = null;
  emptyContourTexture;
  device;
  format;
  globalsBuffer;
  shapesBuffer = null;
  backdropMetricsBoundsBuffer;
  htmlCompositeParamsBuffer;
  emptyContentEntriesBuffer;
  sampler;
  backdropBlurResources;
  displacementBlurResources;
  shadowBlurResources;
  displacementFieldPipeline;
  shadowMaskPipeline;
  shadowCompositePipeline;
  glassPipeline;
  htmlCompositePipeline;
  backdropMetricsPipeline;
  blitPipeline;
  targets = null;
  backdropMetricsTarget;
  /** Creates reusable GPU resources for a host-owned WebGPU device. */
  constructor({ device, format }) {
    this.device = device;
    this.format = format;
    // Store IEEE float bits in r32uint; explicit loads need no optional float filtering.
    this.emptyContourTexture = device.createTexture({ size: [1, 1], format: "r32uint",
      usage: GPU_TEXTURE_USAGE.TEXTURE_BINDING | GPU_TEXTURE_USAGE.COPY_DST });
    device.queue.writeTexture({ texture: this.emptyContourTexture }, new Float32Array([1]), {}, [1, 1]);
    this.sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge"
    });
    const uniformBufferUsage = GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST;
    this.globalsBuffer = new GpuStructBuffer(device, GlobalsLayout, uniformBufferUsage);
    this.backdropMetricsBoundsBuffer = new GpuStructBuffer(device, BackdropMetricsBoundsLayout, uniformBufferUsage);
    this.htmlCompositeParamsBuffer = new GpuStructBuffer(device, HtmlCompositeParamsLayout, uniformBufferUsage);
    this.emptyContentEntriesBuffer = new GpuStructArrayBuffer(
      device,
      ContentDataLayout,
      GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST
    );
    this.emptyContentEntriesBuffer.ensureCapacity(0);
    this.backdropBlurResources = createAdaptiveBlurResources(device, format);
    this.displacementBlurResources = createAdaptiveBlurResources(device, DISPLACEMENT_FIELD_FORMAT);
    this.shadowBlurResources = createAdaptiveBlurResources(device, SHADOW_MASK_FORMAT);
    this.displacementFieldPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: device.createShaderModule({ code: DISPLACEMENT_FIELD_SHADER }),
        entryPoint: "vertexMain"
      },
      fragment: {
        module: device.createShaderModule({ code: DISPLACEMENT_FIELD_SHADER }),
        entryPoint: "fragmentMain",
        targets: [{ format: DISPLACEMENT_FIELD_FORMAT }]
      },
      primitive: {
        topology: "triangle-list"
      }
    });
    this.glassPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: device.createShaderModule({ code: GLASS_SHADER }),
        entryPoint: "vertexMain"
      },
      fragment: {
        module: device.createShaderModule({ code: GLASS_SHADER }),
        entryPoint: "fragmentMain",
        targets: [{ format }]
      },
      primitive: {
        topology: "triangle-list"
      }
    });
    this.shadowMaskPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: device.createShaderModule({ code: SHADOW_MASK_SHADER }),
        entryPoint: "vertexMain"
      },
      fragment: {
        module: device.createShaderModule({ code: SHADOW_MASK_SHADER }),
        entryPoint: "fragmentMain",
        targets: [{ format: SHADOW_MASK_FORMAT }]
      },
      primitive: {
        topology: "triangle-list"
      }
    });
    this.shadowCompositePipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: device.createShaderModule({ code: SHADOW_COMPOSITE_SHADER }),
        entryPoint: "vertexMain"
      },
      fragment: {
        module: device.createShaderModule({ code: SHADOW_COMPOSITE_SHADER }),
        entryPoint: "fragmentMain",
        targets: [{ format }]
      },
      primitive: {
        topology: "triangle-list"
      }
    });
    this.htmlCompositePipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: device.createShaderModule({ code: HTML_COMPOSITE_SHADER }),
        entryPoint: "vertexMain"
      },
      fragment: {
        module: device.createShaderModule({ code: HTML_COMPOSITE_SHADER }),
        entryPoint: "fragmentMain",
        targets: [{ format }]
      },
      primitive: {
        topology: "triangle-list"
      }
    });
    this.backdropMetricsPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: device.createShaderModule({ code: METRICS_SHADER }),
        entryPoint: "vertexMain"
      },
      fragment: {
        module: device.createShaderModule({ code: METRICS_SHADER }),
        entryPoint: "fragmentMain",
        targets: [{ format: "rgba8unorm" }]
      },
      primitive: {
        topology: "triangle-list"
      }
    });
    this.blitPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: device.createShaderModule({ code: TEXTURE_BLIT_SHADER }),
        entryPoint: "vertexMain"
      },
      fragment: {
        module: device.createShaderModule({ code: TEXTURE_BLIT_SHADER }),
        entryPoint: "fragmentMain",
        targets: [{ format }]
      },
      primitive: {
        topology: "triangle-list"
      }
    });
    this.backdropMetricsTarget = device.createTexture({
      size: {
        width: BACKDROP_METRICS_SIZE,
        height: BACKDROP_METRICS_SIZE,
        depthOrArrayLayers: 1
      },
      format: "rgba8unorm",
      usage: GPU_TEXTURE_USAGE.RENDER_ATTACHMENT | GPU_TEXTURE_USAGE.COPY_SRC
    });
    this.backdropMetrics.setDevice(device);
  }
  /** Enables or disables cached backdrop metrics for a container. */
  setBackdropMetricsTracking(container, enabled) {
    this.backdropMetrics.setTracking(container, enabled);
  }
  /** Returns the latest completed cached backdrop metrics for a tracked container. */
  getBackdropMetrics(container) {
    return this.backdropMetrics.getMetrics(container);
  }
  /** Draws one frame into a host-provided output texture. */
  render(options) {
    if (this.destroyed) {
      return;
    }
    this.width = Math.max(1, Math.floor(options.width));
    this.height = Math.max(1, Math.floor(options.height));
    this.currentDpr = Math.max(options.dpr, 1e-4);
    this.contentSource = options.contentSource ?? null;
    this.contour = options.contour ?? null;
    this.syncTargets();
    const layers = options.layers ?? (options.scene ? getSortedSceneLayers(options.scene) : []);
    try {
      this.drawFrame(layers, options.outputTexture, options.backdropTexture ?? null);
    } finally {
      this.contentSource = null;
      this.contour = null;
    }
  }
  /** Releases GPU resources owned by the core. */
  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    destroyTargets(this.targets);
    this.targets = null;
    this.backdropMetricsTarget.destroy();
    this.emptyContourTexture.destroy();
    this.globalsBuffer.destroy();
    this.shapesBuffer?.destroy();
    this.emptyContentEntriesBuffer.destroy();
    destroyAdaptiveBlurResources(this.backdropBlurResources);
    destroyAdaptiveBlurResources(this.displacementBlurResources);
    destroyAdaptiveBlurResources(this.shadowBlurResources);
    this.backdropMetricsBoundsBuffer.destroy();
    this.htmlCompositeParamsBuffer.destroy();
    this.backdropMetrics.destroy();
  }
  /** Synchronizes internal render-target dimensions with the host output. */
  syncTargets() {
    if (this.targets && this.targets.backdropBlur.levels[0]?.width === this.width && this.targets.backdropBlur.levels[0]?.height === this.height) {
      return;
    }
    destroyTargets(this.targets);
    this.targets = {
      backdropBlur: createAdaptiveBlurTargetChain(this.device, this.format, this.width, this.height),
      displacementBlur: createAdaptiveBlurTargetChain(this.device, DISPLACEMENT_FIELD_FORMAT, this.width, this.height),
      shadowBlur: createAdaptiveBlurTargetChain(this.device, SHADOW_MASK_FORMAT, this.width, this.height),
      sceneA: createRenderTarget(this.device, this.format, this.width, this.height),
      sceneB: createRenderTarget(this.device, this.format, this.width, this.height)
    };
  }
  /** Ensures the shape storage buffer can hold the active glass count. */
  ensureShapesBuffer(requiredCount) {
    if (!this.shapesBuffer) {
      this.shapesBuffer = new GpuStructArrayBuffer(
        this.device,
        ShapeDataLayout,
        GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST
      );
    }
    this.shapesBuffer.ensureCapacity(requiredCount);
  }
  /** Writes per-container global shader parameters. */
  writeGlobals(container, shapeCount) {
    const dpr = this.currentDpr;
    this.globalsBuffer.write({
      canvas: {
        width: this.width,
        height: this.height
      },
      container: {
        opacity: container.opacity
      },
      shape: {
        smoothing: container.spacing * dpr,
        bezelWidth: container.bezelWidth * dpr,
        shapeCount,
        surfaceProfile: getSurfaceProfileIndex(container.surfaceProfile)
      },
      sdf: {
        normalDivergenceBlendPower: container.normalDivergenceBlendPower,
        normalDivergenceBlendEnabled: container.normalDivergenceBlendEnabled ? 1 : 0
      },
      contour: {
        enabled: this.contour ? 1 : 0,
        pixelsPerCssPixel: this.contour?.pixelsPerCssPixel ?? 1,
        paddingPixels: this.contour?.paddingPixels ?? 0
      },
      glass: {
        thickness: container.thickness * dpr,
        displacementFactor: container.displacementFactor,
        ior: container.ior,
        dispersion: container.dispersion
      },
      content: {
        ior: container.contentIor,
        depth: container.contentDepth * dpr
      },
      lighting: {
        x: Math.sin(container.lightDirection),
        y: -Math.cos(container.lightDirection)
      },
      specular: {
        strength: container.specularStrength,
        width: resolveSpecularWidthPx(container.specularWidth, dpr),
        sharpness: container.specularSharpness,
        opacity: container.specularOpacity
      },
      specularSecondary: {
        oppositeStrength: container.oppositeSpecularStrength,
        falloff: container.specularFalloff,
        reflectionOffset: container.reflectionOffset * dpr
      },
      tint: {
        r: container.tint.r,
        g: container.tint.g,
        b: container.tint.b,
        a: container.tint.a
      },
      shadow: {
        offsetX: container.shadowOffsetX * dpr,
        offsetY: container.shadowOffsetY * dpr,
        spread: container.shadowSpread * dpr,
        blur: container.shadowBlur * dpr
      },
      shadowColor: {
        r: container.shadowColor.r,
        g: container.shadowColor.g,
        b: container.shadowColor.b,
        a: container.shadowColor.a
      },
      debug: {
        displacement: container.debugDisplacement ? 1 : 0
      }
    });
  }
  /** Writes the device-pixel bounds sampled by the backdrop metrics pass. */
  writeBackdropMetricsBounds(bounds) {
    this.backdropMetricsBoundsBuffer.write({
      bounds: {
        minX: bounds.minX,
        minY: bounds.minY,
        maxX: bounds.maxX,
        maxY: bounds.maxY
      }
    });
  }
  /** Packs visible glass shapes into the storage buffer and accumulates bounds. */
  packShapes(container, containerTransform) {
    const dpr = this.currentDpr;
    const glassLayers = getSortedGlassLayers(container);
    if (this.contour && glassLayers.length !== 1) {
      throw new Error("A contour render requires exactly one Glass per container.");
    }
    const bounds = createEmptyBounds();
    let activeCount = 0;
    this.ensureShapesBuffer(glassLayers.length);
    const shapesBuffer = this.shapesBuffer;
    for (const glassLayer of glassLayers) {
      const glass = glassLayer.glass;
      if (glass.width <= 0 || glass.height <= 0) {
        continue;
      }
      const worldCss = multiplyMatrices(containerTransform, glassLayer.transform);
      const worldDevice = scaleOutputMatrix(worldCss, dpr);
      const inverse = invertMatrix(worldDevice);
      if (!inverse) {
        continue;
      }
      const topLeft = transformPoint(worldDevice, 0, 0);
      const topRight = transformPoint(worldDevice, glass.width, 0);
      const bottomLeft = transformPoint(worldDevice, 0, glass.height);
      const bottomRight = transformPoint(worldDevice, glass.width, glass.height);
      expandBounds(bounds, topLeft.x, topLeft.y);
      expandBounds(bounds, topRight.x, topRight.y);
      expandBounds(bounds, bottomLeft.x, bottomLeft.y);
      expandBounds(bounds, bottomRight.x, bottomRight.y);
      const contentRange = this.contentSource?.getGlassContentRange?.(glass);
      const halfWidth = glass.width * 0.5;
      const halfHeight = glass.height * 0.5;
      shapesBuffer?.writeAt(activeCount, {
        inverse0: {
          a: inverse.a,
          c: inverse.c,
          e: inverse.e,
          minimumScale: getMinimumScale(worldDevice)
        },
        inverse1: {
          b: inverse.b,
          d: inverse.d,
          f: inverse.f,
          cornerRadius: glass.cornerRadius
        },
        geometry: {
          halfWidth,
          halfHeight,
          cornerSmoothing: glass.cornerSmoothing
        },
        contentRange: {
          start: contentRange?.start ?? 0,
          count: contentRange?.count ?? 0
        }
      });
      activeCount += 1;
    }
    shapesBuffer?.upload(activeCount);
    return {
      shapeCount: activeCount,
      bounds: hasBounds(bounds) ? bounds : null
    };
  }
  /** Renders and filters the premultiplied surface field used for refraction displacement. */
  renderDisplacementField(encoder, targetContainer) {
    if (!this.shapesBuffer?.buffer || !this.targets) {
      return null;
    }
    const rawLevel = this.targets.displacementBlur.levels[0];
    const fieldBindGroup = createPipelineBindGroup(this.device, this.displacementFieldPipeline, [
      { binding: 0, resource: this.globalsBuffer.bindingResource },
      { binding: 1, resource: this.shapesBuffer.bindingResource },
      { binding: 8, resource: (this.contour?.texture ?? this.emptyContourTexture).createView() }
    ]);
    drawFullscreenPass(encoder, {
      pipeline: this.displacementFieldPipeline,
      bindGroup: fieldBindGroup,
      target: rawLevel.ping,
      clearValue: { r: 0, g: 0, b: 0, a: 0 }
    });
    return renderAdaptiveBlur({
      device: this.device,
      sampler: this.sampler,
      encoder,
      source: rawLevel.ping,
      radiusPx: targetContainer.displacementBlur * this.currentDpr,
      chain: this.targets.displacementBlur,
      resources: this.displacementBlurResources
    });
  }
  /** Renders the container shadow mask, blurs it, and composites it under the glass. */
  renderShadow(encoder, source, target, targetContainer) {
    if (targetContainer.opacity <= 0 || targetContainer.shadowColor.a <= 0 || !this.shapesBuffer?.buffer || !this.targets) {
      return false;
    }
    const rawLevel = this.targets.shadowBlur.levels[0];
    const maskBindGroup = createPipelineBindGroup(this.device, this.shadowMaskPipeline, [
      { binding: 0, resource: this.globalsBuffer.bindingResource },
      { binding: 1, resource: this.shapesBuffer.bindingResource },
      { binding: 8, resource: (this.contour?.texture ?? this.emptyContourTexture).createView() }
    ]);
    drawFullscreenPass(encoder, {
      pipeline: this.shadowMaskPipeline,
      bindGroup: maskBindGroup,
      target: rawLevel.ping,
      clearValue: { r: 0, g: 0, b: 0, a: 0 }
    });
    const blurredMask = renderAdaptiveBlur({
      device: this.device,
      sampler: this.sampler,
      encoder,
      source: rawLevel.ping,
      radiusPx: targetContainer.shadowBlur * this.currentDpr,
      chain: this.targets.shadowBlur,
      resources: this.shadowBlurResources
    });
    const compositeBindGroup = createPipelineBindGroup(this.device, this.shadowCompositePipeline, [
      { binding: 0, resource: this.sampler },
      { binding: 1, resource: source.createView() },
      { binding: 2, resource: blurredMask.createView() },
      { binding: 3, resource: this.globalsBuffer.bindingResource }
    ]);
    drawFullscreenPass(encoder, {
      pipeline: this.shadowCompositePipeline,
      bindGroup: compositeBindGroup,
      target
    });
    return true;
  }
  /** Returns whether rendering this container will add a shadow composition pass. */
  shouldRenderShadow(targetContainer) {
    return targetContainer.opacity > 0 && targetContainer.shadowColor.a > 0 && Boolean(this.shapesBuffer?.buffer) && Boolean(this.targets);
  }
  /** Renders and queues copy commands for one backdrop metrics target. */
  renderBackdropMetrics(encoder, state, bounds, blurredBackdrop) {
    if (!this.shapesBuffer?.buffer || !bounds || state.pendingReadback) {
      if (!bounds && !state.pendingReadback) {
        state.metrics = null;
      }
      return false;
    }
    this.backdropMetrics.ensureResources(state);
    if (!state.readbackBuffer) {
      return false;
    }
    this.writeBackdropMetricsBounds(bounds);
    const bindGroup = createPipelineBindGroup(this.device, this.backdropMetricsPipeline, [
      { binding: 0, resource: this.globalsBuffer.bindingResource },
      { binding: 1, resource: this.shapesBuffer.bindingResource },
      { binding: 2, resource: this.sampler },
      { binding: 3, resource: blurredBackdrop.createView() },
      { binding: 4, resource: this.backdropMetricsBoundsBuffer.bindingResource },
      { binding: 8, resource: (this.contour?.texture ?? this.emptyContourTexture).createView() }
    ]);
    drawFullscreenPass(encoder, {
      pipeline: this.backdropMetricsPipeline,
      bindGroup,
      target: this.backdropMetricsTarget,
      clearValue: { r: 0, g: 0, b: 0, a: 0 }
    });
    encoder.copyTextureToBuffer(
      { texture: this.backdropMetricsTarget },
      {
        buffer: state.readbackBuffer,
        bytesPerRow: BACKDROP_METRICS_BYTES_PER_ROW,
        rowsPerImage: BACKDROP_METRICS_SIZE
      },
      {
        width: BACKDROP_METRICS_SIZE,
        height: BACKDROP_METRICS_SIZE,
        depthOrArrayLayers: 1
      }
    );
    return true;
  }
  /** Renders one container's glass shapes over the current scene texture. */
  renderContainer(encoder, sharpSource, blurredBackdrop, displacementField, target) {
    if (!this.shapesBuffer?.buffer) {
      return;
    }
    const contentEntriesBindingResource = this.contentSource?.contentEntriesBindingResource ?? this.emptyContentEntriesBuffer.bindingResource;
    const contentTexture = this.contentSource?.atlasTexture ?? sharpSource;
    const bindGroup = createPipelineBindGroup(this.device, this.glassPipeline, [
      { binding: 0, resource: this.globalsBuffer.bindingResource },
      { binding: 1, resource: this.shapesBuffer.bindingResource },
      { binding: 2, resource: this.sampler },
      { binding: 3, resource: sharpSource.createView() },
      { binding: 4, resource: blurredBackdrop.createView() },
      { binding: 5, resource: contentTexture.createView() },
      { binding: 6, resource: contentEntriesBindingResource },
      { binding: 7, resource: displacementField.createView() },
      { binding: 8, resource: (this.contour?.texture ?? this.emptyContourTexture).createView() }
    ]);
    drawFullscreenPass(encoder, {
      pipeline: this.glassPipeline,
      bindGroup,
      target
    });
  }
  /** Writes uniforms for compositing one scene-attached HTML texture. */
  writeHtmlCompositeParams(entry) {
    if (!entry.inverseTransform) {
      return;
    }
    const inverse = entry.inverseTransform;
    this.htmlCompositeParamsBuffer.write({
      canvas: {
        width: this.width,
        height: this.height,
        uScale: getTextureUvScale(entry.deviceWidth, entry.width, entry.textureWidth),
        vScale: getTextureUvScale(entry.deviceHeight, entry.height, entry.textureHeight)
      },
      inverse0: {
        a: inverse.a,
        c: inverse.c,
        e: inverse.e,
        copiedWidth: getCopiedCssSize(entry.copiedDeviceWidth, entry.deviceWidth, entry.width)
      },
      inverse1: {
        b: inverse.b,
        d: inverse.d,
        f: inverse.f,
        copiedHeight: getCopiedCssSize(entry.copiedDeviceHeight, entry.deviceHeight, entry.height)
      },
      opacity: {
        value: entry.html.opacity
      }
    });
  }
  /** Composites a scene-attached HTML layer over the current scene texture. */
  compositeHtmlLayer(encoder, sharpSource, target, entry) {
    if (!entry.filteredTexture && !entry.texture || !entry.inverseTransform) {
      return;
    }
    this.writeHtmlCompositeParams(entry);
    const bindGroup = createPipelineBindGroup(this.device, this.htmlCompositePipeline, [
      { binding: 0, resource: this.sampler },
      { binding: 1, resource: sharpSource.createView() },
      { binding: 2, resource: (entry.filteredTexture ?? entry.texture).createView() },
      { binding: 3, resource: this.htmlCompositeParamsBuffer.bindingResource }
    ]);
    drawFullscreenPass(encoder, {
      pipeline: this.htmlCompositePipeline,
      bindGroup,
      target
    });
  }
  /** Samples one texture into another render attachment. */
  blitTexture(encoder, source, target) {
    const bindGroup = createPipelineBindGroup(this.device, this.blitPipeline, [
      { binding: 0, resource: this.sampler },
      { binding: 1, resource: source.createView() }
    ]);
    drawFullscreenPass(encoder, {
      pipeline: this.blitPipeline,
      bindGroup,
      target
    });
  }
  /** Draws a complete frame for the provided sorted scene layers. */
  drawFrame(layers, outputTexture, backdropTexture) {
    if (this.destroyed || !this.targets) {
      return;
    }
    const seenContainers = /* @__PURE__ */ new Set();
    const composer = new PingPongComposer(this.device, this.targets);
    if (backdropTexture) {
      this.blitTexture(composer.encoder, backdropTexture, composer.current);
    }
    for (const entry of layers) {
      if (entry.child instanceof Html) {
        if (entry.child.opacity <= 0) {
          continue;
        }
        const htmlEntry = this.contentSource?.getSceneHtmlEntry?.(entry.child);
        if (!htmlEntry || !htmlEntry.texture || !htmlEntry.inverseTransform) {
          continue;
        }
        this.compositeHtmlLayer(composer.encoder, composer.current, composer.next, htmlEntry);
        composer.submitAndSwap();
        continue;
      }
      if (entry.child.opacity <= 0) {
        continue;
      }
      const packedShapes = this.packShapes(entry.child, entry.transform);
      this.writeGlobals(entry.child, packedShapes.shapeCount);
      const blurRadiusPx = entry.child.blur * this.currentDpr;
      let blurredBackdrop = renderAdaptiveBlur({
        device: this.device,
        sampler: this.sampler,
        encoder: composer.encoder,
        source: composer.current,
        radiusPx: blurRadiusPx,
        chain: this.targets.backdropBlur,
        resources: this.backdropBlurResources
      });
      if (blurRadiusPx <= 0 && this.shouldRenderShadow(entry.child)) {
        blurredBackdrop = this.targets.backdropBlur.levels[0].pong;
        this.blitTexture(composer.encoder, composer.current, blurredBackdrop);
      }
      const displacementField = this.renderDisplacementField(composer.encoder, entry.child);
      if (!displacementField) {
        continue;
      }
      const metricsState = this.backdropMetrics.getTrackedState(entry.child);
      let scheduledMetricsReadback = false;
      if (metricsState) {
        seenContainers.add(entry.child);
        scheduledMetricsReadback = this.renderBackdropMetrics(
          composer.encoder,
          metricsState,
          packedShapes.bounds,
          blurredBackdrop
        );
      }
      if (this.renderShadow(composer.encoder, composer.current, composer.next, entry.child)) {
        composer.submitAndSwap();
      }
      this.renderContainer(composer.encoder, composer.current, blurredBackdrop, displacementField, composer.next);
      composer.submitAndSwap();
      if (metricsState && scheduledMetricsReadback) {
        this.backdropMetrics.scheduleReadback(metricsState);
      }
    }
    this.backdropMetrics.markSceneMembership(seenContainers);
    this.blitTexture(composer.encoder, composer.current, outputTexture);
    composer.submit();
  }
};

// src/renderer/dom-content-source.ts
var WebGpuDomContentSource = class {
  scene;
  targetCanvas;
  domContent;
  destroyed = false;
  handlePaintEvent = (event) => {
    if (!this.destroyed) {
      this.domContent.handlePaintEvent(event);
    }
  };
  constructor({ targetCanvas, getCurrentDpr, scene }) {
    this.targetCanvas = targetCanvas;
    this.scene = scene ?? null;
    this.domContent = new DomContentSync({ targetCanvas, getCurrentDpr });
    this.targetCanvas.setAttribute("layoutsubtree", "true");
    this.targetCanvas.addEventListener("paint", this.handlePaintEvent);
  }
  /** Current atlas texture for glass-attached HTML content, if any exists. */
  get atlasTexture() {
    return this.domContent.atlasTexture;
  }
  /** Binding resource for glass content entries, or null before GPU allocation. */
  get contentEntriesBindingResource() {
    return this.domContent.contentEntriesBindingResource;
  }
  /** Attaches GPU resources used for DOM content textures and storage buffers. */
  setDevice(device, presentationFormat) {
    this.domContent.setDevice(device, presentationFormat);
  }
  /** Synchronizes DOM hosts, atlas metadata, and pending DOM-to-texture copies. */
  sync(scene = this.scene) {
    if (!scene) {
      throw new Error("WebGpuDomContentSource.sync requires a scene.");
    }
    const layers = getSortedSceneLayers(scene);
    this.domContent.sync(layers, getLayerContainers(layers), getHtmlHostOrder(layers));
    this.domContent.copyPending();
    return layers;
  }
  /** Returns GPU state for a scene-attached HTML node. */
  getSceneHtmlEntry(html) {
    return this.domContent.getSceneHtmlEntry(html);
  }
  /** Returns the storage-buffer range for a glass node's attached HTML. */
  getGlassContentRange(glass) {
    return this.domContent.getGlassContentRange(glass);
  }
  /** Removes DOM hosts and destroys GPU resources owned by this content source. */
  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.targetCanvas.removeEventListener("paint", this.handlePaintEvent);
    this.domContent.destroy();
  }
};

// src/renderer/index.ts
var Renderer = class {
  /** Scene currently rendered by this renderer. */
  scene;
  /** Canvas element that presents the rendered output. */
  canvas;
  /** Maximum device pixel ratio used for internal render targets. */
  maxDpr;
  targetCanvas;
  domContent;
  pointerController;
  unsubscribeSceneMutations = null;
  initError = null;
  destroyed = false;
  initialized = false;
  pendingSceneContentSync = true;
  sceneContentSyncQueued = false;
  currentDpr = 1;
  resizeObserver = null;
  device = null;
  context = null;
  presentationFormat = null;
  core = null;
  canvasConfigured = false;
  lastFrameTexture = null;
  /** Handles canvas paint events by copying managed DOM content into GPU textures. */
  handlePaintEvent = (event) => {
    if (this.destroyed || !this.core) {
      return;
    }
    this.domContent.handlePaintEvent(event);
  };
  /** Marks scene-derived DOM and interaction state as dirty after scene mutations. */
  handleSceneMutation = () => {
    this.queueSceneContentSync();
  };
  /**
   * Creates a renderer and begins asynchronous WebGPU initialization immediately.
   */
  constructor(options = {}) {
    this.scene = options.scene ?? new Scene();
    this.maxDpr = options.maxDpr ?? 2;
    this.targetCanvas = document.createElement("canvas");
    this.targetCanvas.setAttribute("layoutsubtree", "true");
    this.targetCanvas.style.display = "block";
    this.domContent = new DomContentSync({
      targetCanvas: this.targetCanvas,
      getCurrentDpr: () => this.currentDpr
    });
    this.pointerController = new PointerController({
      targetCanvas: this.targetCanvas,
      renderer: this,
      isDestroyed: () => this.destroyed,
      flushSceneContentSync: () => this.flushSceneContentSync(),
      getSceneHtmlHosts: () => this.domContent.sceneHtmlHosts,
      getGlassContentHosts: () => this.domContent.glassContentHosts
    });
    this.targetCanvas.addEventListener("paint", this.handlePaintEvent);
    this.targetCanvas.addEventListener("pointermove", this.pointerController.handlePointerMove, true);
    this.targetCanvas.addEventListener("pointerdown", this.pointerController.handlePointerDown, true);
    this.targetCanvas.addEventListener("pointerup", this.pointerController.handlePointerUp, true);
    this.targetCanvas.addEventListener("pointercancel", this.pointerController.handlePointerCancel, true);
    this.targetCanvas.addEventListener("pointerleave", this.pointerController.handlePointerLeave, true);
    this.unsubscribeSceneMutations = this.scene._subscribe(this.handleSceneMutation);
    this.canvas = this.targetCanvas;
    void this.initialize().catch((error) => {
      this.initError = error;
      console.error(error);
    });
  }
  /** Enables or disables cached backdrop metrics for a container. */
  setBackdropMetricsTracking(container, enabled) {
    this.core?.setBackdropMetricsTracking(container, enabled);
  }
  /** Returns the latest completed cached backdrop metrics for a tracked container. */
  getBackdropMetrics(container) {
    return this.core?.getBackdropMetrics(container) ?? null;
  }
  /** Renders one frame if the renderer is initialized. */
  render() {
    if (this.destroyed) {
      return;
    }
    if (this.initError) {
      throw this.initError;
    }
    const layers = this.syncSceneNow();
    if (!this.initialized) {
      return;
    }
    this.drawFrame(layers);
  }
  /** Tears down observers, event listeners, and GPU resources owned by this renderer. */
  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.targetCanvas.removeEventListener("paint", this.handlePaintEvent);
    this.targetCanvas.removeEventListener("pointermove", this.pointerController.handlePointerMove, true);
    this.targetCanvas.removeEventListener("pointerdown", this.pointerController.handlePointerDown, true);
    this.targetCanvas.removeEventListener("pointerup", this.pointerController.handlePointerUp, true);
    this.targetCanvas.removeEventListener("pointercancel", this.pointerController.handlePointerCancel, true);
    this.targetCanvas.removeEventListener("pointerleave", this.pointerController.handlePointerLeave, true);
    this.unsubscribeSceneMutations?.();
    this.unsubscribeSceneMutations = null;
    this.resizeObserver?.disconnect();
    this.core?.destroy();
    this.core = null;
    this.lastFrameTexture?.destroy();
    this.lastFrameTexture = null;
    this.domContent.destroy();
    this.pointerController.clear();
  }
  /** Creates WebGPU resources and pipelines needed by the renderer. */
  async initialize() {
    const gpuNavigator = navigator;
    if (!gpuNavigator.gpu) {
      throw new Error("WebGPU is not available in this browser.");
    }
    const adapter = await gpuNavigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No compatible GPU adapter was returned.");
    }
    const device = await adapter.requestDevice();
    const context = this.targetCanvas.getContext("webgpu");
    if (!context) {
      throw new Error("Unable to acquire a WebGPU canvas context.");
    }
    const presentationFormat = gpuNavigator.gpu.getPreferredCanvasFormat();
    this.device = device;
    this.context = context;
    this.presentationFormat = presentationFormat;
    this.core = new WebGpuGlassCore({ device, format: presentationFormat });
    this.domContent.setDevice(device, presentationFormat);
    this.initialized = true;
    this.syncCanvasSize();
    this.resizeObserver = new ResizeObserver(() => {
      this.syncCanvasSize();
    });
    this.resizeObserver.observe(this.targetCanvas);
    this.queueSceneContentSync();
  }
  /** Synchronizes canvas/backing texture dimensions with CSS size and DPR. */
  syncCanvasSize() {
    if (!this.device || !this.context || !this.presentationFormat) {
      return;
    }
    const bounds = this.targetCanvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const nextWidth = Math.max(1, Math.round(bounds.width * dpr));
    const nextHeight = Math.max(1, Math.round(bounds.height * dpr));
    this.currentDpr = dpr;
    if (!this.canvasConfigured || this.targetCanvas.width !== nextWidth || this.targetCanvas.height !== nextHeight) {
      const previousLastFrame = this.lastFrameTexture;
      const previousWidth = this.targetCanvas.width;
      const previousHeight = this.targetCanvas.height;
      this.targetCanvas.width = nextWidth;
      this.targetCanvas.height = nextHeight;
      this.context.configure({
        device: this.device,
        format: this.presentationFormat,
        usage: GPU_TEXTURE_USAGE.RENDER_ATTACHMENT | GPU_TEXTURE_USAGE.COPY_SRC | GPU_TEXTURE_USAGE.COPY_DST,
        alphaMode: "opaque"
      });
      this.canvasConfigured = true;
      this.lastFrameTexture = createRenderTarget(this.device, this.presentationFormat, nextWidth, nextHeight);
      this.preservePreviousFrameAfterResize(previousLastFrame, previousWidth, previousHeight);
      previousLastFrame?.destroy();
    }
    this.syncSceneNow();
  }
  /** Paints the previous completed frame into the newly configured canvas target. */
  preservePreviousFrameAfterResize(previousFrame, previousWidth, previousHeight) {
    if (!previousFrame || !this.device || !this.context || !this.lastFrameTexture || previousWidth <= 0 || previousHeight <= 0) {
      return;
    }
    const copyWidth = Math.min(previousWidth, this.targetCanvas.width);
    const copyHeight = Math.min(previousHeight, this.targetCanvas.height);
    const encoder = this.device.createCommandEncoder();
    const currentTexture = this.context.getCurrentTexture();
    const region = {
      sourceX: 0,
      sourceY: 0,
      destinationX: 0,
      destinationY: 0,
      width: copyWidth,
      height: copyHeight
    };
    clearRenderTarget(encoder, this.lastFrameTexture);
    clearRenderTarget(encoder, currentTexture);
    copyTextureRegion(encoder, previousFrame, this.lastFrameTexture, region);
    copyTextureRegion(encoder, previousFrame, currentTexture, region);
    this.device.queue.submit([encoder.finish()]);
  }
  /** Queues scene-derived DOM and pointer state synchronization on a microtask. */
  queueSceneContentSync() {
    this.pendingSceneContentSync = true;
    if (this.sceneContentSyncQueued || this.destroyed) {
      return;
    }
    this.sceneContentSyncQueued = true;
    queueMicrotask(() => {
      this.sceneContentSyncQueued = false;
      if (this.destroyed || !this.pendingSceneContentSync) {
        return;
      }
      this.syncSceneNow();
    });
  }
  /** Immediately synchronizes scene-derived DOM, content, and pointer caches. */
  syncSceneNow() {
    const layers = getSortedSceneLayers(this.scene);
    const containers = getLayerContainers(layers);
    const hostOrder = getHtmlHostOrder(layers);
    this.pointerController.syncInteractions(containers);
    this.domContent.sync(layers, containers, hostOrder);
    this.domContent.copyPending();
    this.pendingSceneContentSync = false;
    return layers;
  }
  /** Flushes any queued scene content synchronization before pointer work. */
  flushSceneContentSync() {
    if (this.pendingSceneContentSync) {
      this.syncSceneNow();
    }
  }
  /** Draws a complete frame for the provided sorted scene layers. */
  drawFrame(layers = getSortedSceneLayers(this.scene)) {
    if (this.destroyed || !this.context || !this.core || !this.device || !this.lastFrameTexture || this.targetCanvas.width <= 0 || this.targetCanvas.height <= 0) {
      return;
    }
    this.core.render({
      layers,
      width: this.targetCanvas.width,
      height: this.targetCanvas.height,
      dpr: this.currentDpr,
      outputTexture: this.lastFrameTexture,
      contentSource: this.domContent
    });
    const encoder = this.device.createCommandEncoder();
    copyTextureRegion(encoder, this.lastFrameTexture, this.context.getCurrentTexture(), {
      sourceX: 0,
      sourceY: 0,
      destinationX: 0,
      destinationY: 0,
      width: this.targetCanvas.width,
      height: this.targetCanvas.height
    });
    this.device.queue.submit([encoder.finish()]);
  }
};
export {
  Container,
  Glass,
  GlassPointerEvent,
  Group,
  Html,
  Renderer,
  Scene,
  StackingContext,
  WebGpuDomContentSource,
  WebGpuGlassCore,
  resolveSpecularWidthPx
};
