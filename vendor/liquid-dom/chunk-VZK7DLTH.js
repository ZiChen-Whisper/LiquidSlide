// src/corner-smoothing.ts
var CIRCULAR_CORNER_EXPONENT = 2;
var DEFAULT_CORNER_SMOOTHING = 0.6;
var IOS_LIKE_CORNER_EXPONENT = 4;
var CORNER_SMOOTHING_EXPONENT_DELTA = (IOS_LIKE_CORNER_EXPONENT - CIRCULAR_CORNER_EXPONENT) / DEFAULT_CORNER_SMOOTHING;
function sanitizeCornerRadius(radius) {
  return Number.isFinite(radius) ? Math.max(radius, 0) : 0;
}
function sanitizeCornerSmoothing(smoothing) {
  return Number.isFinite(smoothing) ? Math.min(Math.max(smoothing, 0), 1) : DEFAULT_CORNER_SMOOTHING;
}
function resolveCornerSmoothingExponent(cornerSmoothing) {
  return CIRCULAR_CORNER_EXPONENT + sanitizeCornerSmoothing(cornerSmoothing) * CORNER_SMOOTHING_EXPONENT_DELTA;
}

// src/matrix.ts
function identityMatrix() {
  return {
    a: 1,
    b: 0,
    c: 0,
    d: 1,
    e: 0,
    f: 0
  };
}
function multiply(left, right) {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f
  };
}
function translationMatrix(x, y) {
  return {
    a: 1,
    b: 0,
    c: 0,
    d: 1,
    e: x,
    f: y
  };
}
function scaleMatrix(x, y) {
  return {
    a: x,
    b: 0,
    c: 0,
    d: y,
    e: 0,
    f: 0
  };
}
function rotationMatrix(rotation) {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return {
    a: cosine,
    b: sine,
    c: -sine,
    d: cosine,
    e: 0,
    f: 0
  };
}
function composeTransform(transform) {
  return multiply(
    translationMatrix(transform.x, transform.y),
    multiply(
      translationMatrix(transform.origin.x, transform.origin.y),
      multiply(
        rotationMatrix(transform.rotation),
        multiply(
          scaleMatrix(transform.scaleX, transform.scaleY),
          translationMatrix(-transform.origin.x, -transform.origin.y)
        )
      )
    )
  );
}
function multiplyMatrices(left, right) {
  return multiply(left, right);
}
function invertMatrix(matrix) {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (Math.abs(determinant) < 1e-6) {
    return null;
  }
  const inverseDeterminant = 1 / determinant;
  return {
    a: matrix.d * inverseDeterminant,
    b: -matrix.b * inverseDeterminant,
    c: -matrix.c * inverseDeterminant,
    d: matrix.a * inverseDeterminant,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) * inverseDeterminant,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) * inverseDeterminant
  };
}
function scaleOutputMatrix(matrix, factor) {
  return {
    a: matrix.a * factor,
    b: matrix.b * factor,
    c: matrix.c * factor,
    d: matrix.d * factor,
    e: matrix.e * factor,
    f: matrix.f * factor
  };
}
function transformPoint(matrix, x, y) {
  return {
    x: matrix.a * x + matrix.c * y + matrix.e,
    y: matrix.b * x + matrix.d * y + matrix.f
  };
}
function getMinimumScale(matrix) {
  const scaleX = Math.hypot(matrix.a, matrix.b);
  const scaleY = Math.hypot(matrix.c, matrix.d);
  return Math.max(Math.min(scaleX, scaleY), 1e-4);
}

// src/scene.ts
function clonePoint(point) {
  return point ? { x: point.x, y: point.y } : { x: 0, y: 0 };
}
function cloneColor(color) {
  return color ? { r: color.r, g: color.g, b: color.b, a: color.a } : { r: 0, g: 0, b: 0, a: 0 };
}
function applyTransformDefaults(target, options) {
  if (!options) {
    return;
  }
  if (options.x !== void 0) {
    target.x = options.x;
  }
  if (options.y !== void 0) {
    target.y = options.y;
  }
  if (options.scaleX !== void 0) {
    target.scaleX = options.scaleX;
  }
  if (options.scaleY !== void 0) {
    target.scaleY = options.scaleY;
  }
  if (options.rotation !== void 0) {
    target.rotation = options.rotation;
  }
  if (options.origin !== void 0) {
    target.origin = clonePoint(options.origin);
  }
}
function findScene(node) {
  let current = node instanceof Scene ? node : node?._parent ?? null;
  while (current) {
    if (current instanceof Scene) {
      return current;
    }
    current = current._parent;
  }
  return null;
}
function notifySceneMutation(node) {
  findScene(node)?._notifyMutation();
}
function removeFromParent(node) {
  const parent = node._parent;
  if (!parent) {
    return;
  }
  const scene = findScene(node);
  parent._children = parent._children.filter((child) => child !== node);
  node._parent = null;
  scene?._notifyMutation();
}
function ensureNoCycle(parent, child) {
  if (parent === child) {
    throw new Error("A Group cannot be added to itself.");
  }
  let current = parent;
  while (current) {
    if (current === child) {
      throw new Error("A Group cannot be added to one of its descendants.");
    }
    current = "_parent" in current ? current._parent : null;
  }
}
function getGroupContext(parent) {
  let current = parent;
  while (current instanceof Group) {
    current = current._parent;
  }
  return current;
}
function validateGroupChildForContext(child, context) {
  if (!context || child instanceof Group) {
    return;
  }
  if (context instanceof Scene && (child instanceof Container || child instanceof Html)) {
    return;
  }
  if (context instanceof Container && child instanceof Glass) {
    return;
  }
  if (context instanceof Glass && child instanceof Html) {
    return;
  }
  throw new Error("A Group child must match the node type accepted by its nearest non-group parent.");
}
function validateGroupForContext(group, context) {
  for (const child of group._children) {
    validateGroupChildForContext(child, context);
    if (child instanceof Group) {
      validateGroupForContext(child, context);
    }
  }
}
var Html = class {
  /** Horizontal translation in CSS pixels. */
  x = 0;
  /** Vertical translation in CSS pixels. */
  y = 0;
  /** Horizontal scale factor. */
  scaleX = 1;
  /** Vertical scale factor. */
  scaleY = 1;
  /** Clockwise rotation in radians. */
  rotation = 0;
  /** Local-space transform origin in CSS pixels. */
  origin = { x: 0, y: 0 };
  /** Host element copied by the renderer and used by the browser for hit testing. */
  host;
  _width = 0;
  _height = 0;
  _opacity = 1;
  _blur = 0;
  _zIndex = 0;
  _element = null;
  _elementVersion = 0;
  _parent = null;
  constructor(options = {}) {
    this.host = document.createElement("div");
    this.host.style.position = "absolute";
    this.host.style.left = "0";
    this.host.style.top = "0";
    this.host.style.display = "block";
    this.host.style.overflow = "hidden";
    this.host.style.transformOrigin = "0 0";
    applyTransformDefaults(this, options);
    if (options.width !== void 0) {
      this.width = options.width;
    } else {
      this.syncHostSize();
    }
    if (options.height !== void 0) {
      this.height = options.height;
    } else {
      this.syncHostSize();
    }
    if (options.opacity !== void 0) {
      this.opacity = options.opacity;
    }
    if (options.blur !== void 0) {
      this.blur = options.blur;
    }
    if (options.zIndex !== void 0) {
      this.zIndex = options.zIndex;
    }
    if (options.element !== void 0) {
      this.setElement(options.element);
    }
  }
  /** Node width in CSS pixels. */
  get width() {
    return this._width;
  }
  set width(value) {
    if (this._width === value) {
      return;
    }
    this._width = value;
    this.syncHostSize();
    notifySceneMutation(this);
  }
  /** Node height in CSS pixels. */
  get height() {
    return this._height;
  }
  set height(value) {
    if (this._height === value) {
      return;
    }
    this._height = value;
    this.syncHostSize();
    notifySceneMutation(this);
  }
  /** Final opacity used when compositing this HTML node into the rendered scene. */
  get opacity() {
    return this._opacity;
  }
  set opacity(value) {
    if (this._opacity === value) {
      return;
    }
    this._opacity = value;
    notifySceneMutation(this);
  }
  /** Content blur radius in CSS pixels applied when compositing this HTML node. */
  get blur() {
    return this._blur;
  }
  set blur(value) {
    if (this._blur === value) {
      return;
    }
    this._blur = value;
    notifySceneMutation(this);
  }
  /** Draw order among sibling scene or glass HTML nodes. */
  get zIndex() {
    return this._zIndex;
  }
  set zIndex(value) {
    if (this._zIndex === value) {
      return;
    }
    this._zIndex = value;
    notifySceneMutation(this);
  }
  /** The optional child element rendered inside this node's host. */
  get element() {
    return this._element;
  }
  /** Replaces the single child element inside this node's host. */
  setElement(element) {
    if (this._element === element) {
      return;
    }
    this._element = element;
    this._elementVersion += 1;
    this.host.replaceChildren();
    if (element) {
      this.host.append(element);
    }
    notifySceneMutation(this);
  }
  /** Detaches this HTML node from its parent scene or glass, if attached. */
  remove() {
    removeFromParent(this);
  }
  syncHostSize() {
    this.host.style.width = `${this._width}px`;
    this.host.style.height = `${this._height}px`;
  }
};
var Glass = class extends EventTarget {
  /** Horizontal translation in CSS pixels. */
  x = 0;
  /** Vertical translation in CSS pixels. */
  y = 0;
  /** Horizontal scale factor. */
  scaleX = 1;
  /** Vertical scale factor. */
  scaleY = 1;
  /** Clockwise rotation in radians. */
  rotation = 0;
  /** Local-space transform origin in CSS pixels. */
  origin = { x: 0, y: 0 };
  _width = 0;
  _height = 0;
  /** Shape width in CSS pixels. */
  get width() {
    return this._width;
  }
  set width(value) {
    if (this._width === value) {
      return;
    }
    this._width = value;
    notifySceneMutation(this);
  }
  /** Shape height in CSS pixels. */
  get height() {
    return this._height;
  }
  set height(value) {
    if (this._height === value) {
      return;
    }
    this._height = value;
    notifySceneMutation(this);
  }
  _cornerRadius = 0;
  _cornerSmoothing = DEFAULT_CORNER_SMOOTHING;
  /** Uniform corner radius in CSS pixels. */
  get cornerRadius() {
    return this._cornerRadius;
  }
  set cornerRadius(value) {
    const sanitized = sanitizeCornerRadius(value);
    if (this._cornerRadius === sanitized) {
      return;
    }
    this._cornerRadius = sanitized;
    notifySceneMutation(this);
  }
  /** Smooth-corner amount. 0 produces circular corners; 0.6 is tuned for an iOS-like squircle. */
  get cornerSmoothing() {
    return this._cornerSmoothing;
  }
  set cornerSmoothing(value) {
    const sanitized = sanitizeCornerSmoothing(value);
    if (this._cornerSmoothing === sanitized) {
      return;
    }
    this._cornerSmoothing = sanitized;
    notifySceneMutation(this);
  }
  _pointerEvents = false;
  _zIndex = 0;
  /** Enables renderer-side glass pointer events when set to `true`. */
  get pointerEvents() {
    return this._pointerEvents;
  }
  set pointerEvents(value) {
    if (this._pointerEvents === value) {
      return;
    }
    this._pointerEvents = value;
    notifySceneMutation(this);
  }
  /** Draw order among sibling glass nodes in the same container. */
  get zIndex() {
    return this._zIndex;
  }
  set zIndex(value) {
    if (this._zIndex === value) {
      return;
    }
    this._zIndex = value;
    notifySceneMutation(this);
  }
  _parent = null;
  _children = [];
  /**
   * Creates a glass shape descriptor.
   */
  constructor(options = {}) {
    super();
    applyTransformDefaults(this, options);
    if (options.width !== void 0) {
      this.width = options.width;
    }
    if (options.height !== void 0) {
      this.height = options.height;
    }
    if (options.cornerRadius !== void 0) {
      this.cornerRadius = options.cornerRadius;
    }
    if (options.cornerSmoothing !== void 0) {
      this.cornerSmoothing = options.cornerSmoothing;
    }
    if (options.pointerEvents !== void 0) {
      this.pointerEvents = options.pointerEvents;
    }
    if (options.zIndex !== void 0) {
      this.zIndex = options.zIndex;
    }
  }
  /** Adds an HTML child or transform-only group to this glass, reparenting it if needed. */
  add(child) {
    if (child instanceof Group) {
      ensureNoCycle(this, child);
      validateGroupForContext(child, this);
    }
    removeFromParent(child);
    this._children.push(child);
    child._parent = this;
    notifySceneMutation(child);
    return child;
  }
  /**
   * Detaches this glass from its parent container, if attached.
   */
  remove() {
    removeFromParent(this);
  }
  addEventListener(type, listener, options) {
    super.addEventListener(type, listener, options);
  }
  removeEventListener(type, listener, options) {
    super.removeEventListener(type, listener, options);
  }
};
var Container = class {
  /** Horizontal translation in CSS pixels. */
  x = 0;
  /** Vertical translation in CSS pixels. */
  y = 0;
  /** Horizontal scale factor. */
  scaleX = 1;
  /** Vertical scale factor. */
  scaleY = 1;
  /** Clockwise rotation in radians. */
  rotation = 0;
  /** Local-space transform origin in CSS pixels. */
  origin = { x: 0, y: 0 };
  /** Overall compositing opacity for the container's glass and shadow. */
  opacity = 1;
  /** Fusion distance used when blending neighboring shapes in CSS pixels. */
  spacing = 12;
  /** Backdrop blur radius in CSS pixels. */
  blur = 8;
  /** Width of the beveled edge in CSS pixels. */
  bezelWidth = 14;
  /** Base glass thickness in CSS pixels. */
  thickness = 90;
  /** Scalar applied to the physically-derived displacement amount. */
  displacementFactor = 1;
  /** Blur radius applied to the precomputed displacement field in CSS pixels. */
  displacementBlur = 6;
  /**
   * Exponent shaping SDF smooth-union normal gating.
   * Higher values suppress blending longer as boundary normals diverge.
   */
  normalDivergenceBlendPower = 0.5;
  /** Enables normal-based suppression of SDF smooth-union blending. */
  normalDivergenceBlendEnabled = true;
  /** Refractive index used for the displacement model. */
  ior = 1.5;
  /** Refractive index used when refracting DOM content rendered inside the glass. */
  contentIor = 1;
  /**
   * Content-only refraction depth in CSS pixels.
   * This is used instead of {@link thickness} when calculating DOM-content refraction.
   */
  contentDepth = 0;
  /** Strength of RGB channel separation applied to refraction. */
  dispersion = 0;
  /** Surface profile used for the beveled edge. */
  surfaceProfile = "convex";
  /** 2D light direction in radians, where 0 points upward in screen space. */
  lightDirection = -Math.PI / 4;
  /** Multiplier applied to the white specular term. */
  specularStrength = 1;
  /** Width of the specular band. Numeric values are CSS pixels; `'hairline'` is one device pixel. */
  specularWidth = 1;
  /** Amount by which specular strength falls off from the edge to the end of the band. */
  specularFalloff = 1;
  /** Multiplier applied to the opposite-side white specular term. */
  oppositeSpecularStrength = 1;
  /** Exponent controlling specular falloff. */
  specularSharpness = 2;
  /** Final opacity of the white specular contribution. */
  specularOpacity = 0.45;
  /** Offset in CSS pixels used when sampling the reflection color. */
  reflectionOffset = 18;
  /** RGBA tint color layered over the refracted glass interior. */
  tint = { r: 1, g: 1, b: 1, a: 0.15 };
  /** RGBA color used by the container's drop shadow. Alpha `0` disables shadows. */
  shadowColor = { r: 0, g: 0, b: 0, a: 0.12 };
  /** Horizontal drop shadow offset in CSS pixels. */
  shadowOffsetX = 0;
  /** Vertical drop shadow offset in CSS pixels. */
  shadowOffsetY = 10;
  /** Drop shadow blur radius in CSS pixels. */
  shadowBlur = 24;
  /** Drop shadow spread in CSS pixels. Positive values expand the silhouette. */
  shadowSpread = 0;
  /** Renders the calculated displacement field instead of the shaded glass. */
  debugDisplacement = false;
  /** Draw order among scene layers; higher values render later. */
  zIndex = 0;
  _parent = null;
  _children = [];
  /**
   * Creates a glass rendering layer with optical properties shared by its child shapes.
   */
  constructor(options = {}) {
    applyTransformDefaults(this, options);
    if (options.opacity !== void 0) {
      this.opacity = options.opacity;
    }
    if (options.spacing !== void 0) {
      this.spacing = options.spacing;
    }
    if (options.blur !== void 0) {
      this.blur = options.blur;
    }
    if (options.bezelWidth !== void 0) {
      this.bezelWidth = options.bezelWidth;
    }
    if (options.thickness !== void 0) {
      this.thickness = options.thickness;
    }
    if (options.displacementFactor !== void 0) {
      this.displacementFactor = options.displacementFactor;
    }
    if (options.displacementBlur !== void 0) {
      this.displacementBlur = options.displacementBlur;
    }
    if (options.normalDivergenceBlendPower !== void 0) {
      this.normalDivergenceBlendPower = options.normalDivergenceBlendPower;
    }
    if (options.normalDivergenceBlendEnabled !== void 0) {
      this.normalDivergenceBlendEnabled = options.normalDivergenceBlendEnabled;
    }
    if (options.ior !== void 0) {
      this.ior = options.ior;
    }
    if (options.contentIor !== void 0) {
      this.contentIor = options.contentIor;
    }
    if (options.contentDepth !== void 0) {
      this.contentDepth = options.contentDepth;
    }
    if (options.dispersion !== void 0) {
      this.dispersion = options.dispersion;
    }
    if (options.surfaceProfile !== void 0) {
      this.surfaceProfile = options.surfaceProfile;
    }
    if (options.lightDirection !== void 0) {
      this.lightDirection = options.lightDirection;
    }
    if (options.specularStrength !== void 0) {
      this.specularStrength = options.specularStrength;
    }
    if (options.specularWidth !== void 0) {
      this.specularWidth = options.specularWidth;
    }
    if (options.specularFalloff !== void 0) {
      this.specularFalloff = options.specularFalloff;
    }
    this.oppositeSpecularStrength = options.oppositeSpecularStrength ?? this.specularStrength;
    if (options.specularSharpness !== void 0) {
      this.specularSharpness = options.specularSharpness;
    }
    if (options.specularOpacity !== void 0) {
      this.specularOpacity = options.specularOpacity;
    }
    if (options.reflectionOffset !== void 0) {
      this.reflectionOffset = options.reflectionOffset;
    }
    if (options.tint !== void 0) {
      this.tint = cloneColor(options.tint);
    }
    if (options.shadowColor !== void 0) {
      this.shadowColor = cloneColor(options.shadowColor);
    }
    if (options.shadowOffsetX !== void 0) {
      this.shadowOffsetX = options.shadowOffsetX;
    }
    if (options.shadowOffsetY !== void 0) {
      this.shadowOffsetY = options.shadowOffsetY;
    }
    if (options.shadowBlur !== void 0) {
      this.shadowBlur = options.shadowBlur;
    }
    if (options.shadowSpread !== void 0) {
      this.shadowSpread = options.shadowSpread;
    }
    if (options.debugDisplacement !== void 0) {
      this.debugDisplacement = options.debugDisplacement;
    }
    if (options.zIndex !== void 0) {
      this.zIndex = options.zIndex;
    }
  }
  /**
   * Adds a glass shape or transform-only group to this container, reparenting it if needed.
   */
  add(child) {
    if (child instanceof Group) {
      ensureNoCycle(this, child);
      validateGroupForContext(child, this);
    }
    removeFromParent(child);
    this._children.push(child);
    child._parent = this;
    notifySceneMutation(child);
    return child;
  }
  /**
   * Detaches this container from its parent scene or group, if attached.
   */
  remove() {
    removeFromParent(this);
  }
};
var Group = class _Group {
  /** Horizontal translation in CSS pixels. */
  x = 0;
  /** Vertical translation in CSS pixels. */
  y = 0;
  /** Horizontal scale factor. */
  scaleX = 1;
  /** Vertical scale factor. */
  scaleY = 1;
  /** Clockwise rotation in radians. */
  rotation = 0;
  /** Local-space transform origin in CSS pixels. */
  origin = { x: 0, y: 0 };
  _parent = null;
  _children = [];
  /**
   * Creates a transform-only group node.
   */
  constructor(options = {}) {
    applyTransformDefaults(this, options);
  }
  /**
   * Adds a child node, reparenting it if needed.
   * Throws if the child type is invalid for this group's nearest non-group parent.
   */
  add(child) {
    if (child instanceof _Group) {
      ensureNoCycle(this, child);
    }
    const context = getGroupContext(this);
    validateGroupChildForContext(child, context);
    if (child instanceof _Group) {
      validateGroupForContext(child, context);
    }
    removeFromParent(child);
    this._children.push(child);
    child._parent = this;
    notifySceneMutation(child);
    return child;
  }
  /**
   * Detaches this group from its parent, if attached.
   */
  remove() {
    removeFromParent(this);
  }
};
var StackingContext = class extends Group {
  _zIndex = 0;
  /**
   * Creates a local stacking context.
   */
  constructor(options = {}) {
    super(options);
    if (options.zIndex !== void 0) {
      this._zIndex = options.zIndex;
    }
  }
  /** Draw order of this entire subtree in the nearest parent stacking context. */
  get zIndex() {
    return this._zIndex;
  }
  set zIndex(value) {
    if (this._zIndex === value) {
      return;
    }
    this._zIndex = value;
    notifySceneMutation(this);
  }
};
var Scene = class {
  _children = [];
  _listeners = /* @__PURE__ */ new Set();
  /**
   * Adds a container, HTML layer, transform-only group, or stacking context to the scene.
   */
  add(child) {
    if (child instanceof Group) {
      ensureNoCycle(this, child);
      validateGroupForContext(child, this);
    }
    removeFromParent(child);
    this._children.push(child);
    child._parent = this;
    this._notifyMutation();
    return child;
  }
  _subscribe(listener) {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }
  _notifyMutation() {
    for (const listener of this._listeners) {
      listener();
    }
  }
};
function flattenSceneLayers(scene) {
  const result = [];
  function visitContext(children, parentTransform) {
    const order = { value: 0 };
    const items = [];
    collectContextItems(children, parentTransform, order, (child, transform) => {
      if (child instanceof Container || child instanceof Html) {
        items.push({
          child,
          transform,
          zIndex: child.zIndex,
          order: order.value
        });
        order.value += 1;
      }
    }, (context, transform) => {
      items.push({
        child: context,
        transform,
        zIndex: context.zIndex,
        order: order.value
      });
      order.value += 1;
    });
    items.sort((left, right) => left.zIndex - right.zIndex || left.order - right.order);
    for (const item of items) {
      if (item.child instanceof StackingContext) {
        visitContext(item.child._children, item.transform);
        continue;
      }
      result.push({
        child: item.child,
        transform: item.transform,
        traversalIndex: result.length
      });
    }
  }
  visitContext(scene._children, identityMatrix());
  return result;
}
function flattenContainerGlasses(container) {
  const result = [];
  function visitContext(children, parentTransform) {
    const order = { value: 0 };
    const items = [];
    collectContextItems(children, parentTransform, order, (child, transform) => {
      if (child instanceof Glass) {
        items.push({
          child,
          transform,
          zIndex: child.zIndex,
          order: order.value
        });
        order.value += 1;
      }
    }, (context, transform) => {
      items.push({
        child: context,
        transform,
        zIndex: context.zIndex,
        order: order.value
      });
      order.value += 1;
    });
    items.sort((left, right) => left.zIndex - right.zIndex || left.order - right.order);
    for (const item of items) {
      if (item.child instanceof StackingContext) {
        visitContext(item.child._children, item.transform);
        continue;
      }
      result.push({
        glass: item.child,
        transform: item.transform,
        traversalIndex: result.length
      });
    }
  }
  visitContext(container._children, identityMatrix());
  return result;
}
function flattenGlassHtml(glass) {
  const result = [];
  function visitContext(children, parentTransform) {
    const order = { value: 0 };
    const items = [];
    collectContextItems(children, parentTransform, order, (child, transform) => {
      if (child instanceof Html) {
        items.push({
          child,
          transform,
          zIndex: child.zIndex,
          order: order.value
        });
        order.value += 1;
      }
    }, (context, transform) => {
      items.push({
        child: context,
        transform,
        zIndex: context.zIndex,
        order: order.value
      });
      order.value += 1;
    });
    items.sort((left, right) => left.zIndex - right.zIndex || left.order - right.order);
    for (const item of items) {
      if (item.child instanceof StackingContext) {
        visitContext(item.child._children, item.transform);
        continue;
      }
      result.push({
        html: item.child,
        transform: item.transform,
        traversalIndex: result.length
      });
    }
  }
  visitContext(glass._children, identityMatrix());
  return result;
}
function collectContextItems(children, parentTransform, order, addRenderable, addContext) {
  for (const child of children) {
    const transform = multiplyMatrices(parentTransform, composeTransform(child));
    if (child instanceof StackingContext) {
      addContext(child, transform);
      continue;
    }
    if (child instanceof Group) {
      collectContextItems(child._children, transform, order, addRenderable, addContext);
      continue;
    }
    addRenderable(child, transform);
  }
}

export {
  CIRCULAR_CORNER_EXPONENT,
  CORNER_SMOOTHING_EXPONENT_DELTA,
  resolveCornerSmoothingExponent,
  multiplyMatrices,
  invertMatrix,
  scaleOutputMatrix,
  transformPoint,
  getMinimumScale,
  Html,
  Glass,
  Container,
  Group,
  StackingContext,
  Scene,
  flattenSceneLayers,
  flattenContainerGlasses,
  flattenGlassHtml
};
//# sourceMappingURL=chunk-VZK7DLTH.js.map