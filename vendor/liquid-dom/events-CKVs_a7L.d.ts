/**
 * A 2D point in CSS pixel space.
 */
type Point = {
    x: number;
    y: number;
};
/**
 * A non-premultiplied RGBA color with normalized channel values.
 */
type RgbaColor = {
    /** Red channel in the range `0..1`. */
    r: number;
    /** Green channel in the range `0..1`. */
    g: number;
    /** Blue channel in the range `0..1`. */
    b: number;
    /** Alpha channel in the range `0..1`. */
    a: number;
};
/**
 * Width of the white specular rim.
 *
 * Numeric values are CSS pixels. `'hairline'` resolves at render time to one
 * device pixel for the renderer's current DPR.
 */
type SpecularWidth = number | 'hairline';
/**
 * Cached backdrop statistics measured for a tracked container in a specific renderer.
 */
type BackdropMetrics = {
    /**
     * Mean backdrop color in linear RGB over the sampled interior region.
     */
    averageLinearColor: {
        r: number;
        g: number;
        b: number;
    };
    /**
     * Mean linear luminance over the sampled interior region.
     */
    averageLuminance: number;
    /**
     * 10th percentile of the sampled linear luminance distribution.
     */
    luminanceP10: number;
    /**
     * 50th percentile of the sampled linear luminance distribution.
     */
    luminanceP50: number;
    /**
     * 90th percentile of the sampled linear luminance distribution.
     */
    luminanceP90: number;
};
/**
 * A local transform in the same coordinate space as normal HTML layout.
 */
interface Transform {
    /** Horizontal translation in CSS pixels. */
    x: number;
    /** Vertical translation in CSS pixels. */
    y: number;
    /** Horizontal scale factor. */
    scaleX: number;
    /** Vertical scale factor. */
    scaleY: number;
    /** Clockwise rotation in radians. */
    rotation: number;
    /** Local-space transform origin in CSS pixels. */
    origin: Point;
}
/**
 * Surface profile used for the beveled glass edge.
 */
type SurfaceProfile = 'convex' | 'concave' | 'lip';

type Matrix2D = {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
};

/**
 * Constructor options for a {@link Html} node.
 */
type HtmlInit = Partial<Transform> & {
    width?: number;
    height?: number;
    opacity?: number;
    blur?: number;
    zIndex?: number;
    element?: HTMLElement | null;
};
/**
 * Constructor options for a {@link Glass} node.
 */
type GlassInit = Partial<Transform> & {
    width?: number;
    height?: number;
    cornerRadius?: number;
    cornerSmoothing?: number;
    pointerEvents?: boolean;
    zIndex?: number;
};
interface GlassEventMap {
    click: GlassPointerEvent;
    pointerenter: GlassPointerEvent;
    pointerleave: GlassPointerEvent;
    pointermove: GlassPointerEvent;
    pointerdown: GlassPointerEvent;
    pointerup: GlassPointerEvent;
    pointercancel: GlassPointerEvent;
}
/**
 * Constructor options for a {@link Container}.
 */
type ContainerInit = Partial<Transform> & {
    opacity?: number;
    spacing?: number;
    blur?: number;
    bezelWidth?: number;
    thickness?: number;
    displacementFactor?: number;
    displacementBlur?: number;
    normalDivergenceBlendPower?: number;
    normalDivergenceBlendEnabled?: boolean;
    ior?: number;
    contentIor?: number;
    contentDepth?: number;
    dispersion?: number;
    surfaceProfile?: SurfaceProfile;
    lightDirection?: number;
    specularStrength?: number;
    specularWidth?: SpecularWidth;
    specularFalloff?: number;
    oppositeSpecularStrength?: number;
    specularSharpness?: number;
    specularOpacity?: number;
    reflectionOffset?: number;
    tint?: RgbaColor;
    shadowColor?: RgbaColor;
    shadowOffsetX?: number;
    shadowOffsetY?: number;
    shadowBlur?: number;
    shadowSpread?: number;
    debugDisplacement?: boolean;
    zIndex?: number;
};
/**
 * Constructor options for a {@link Group}.
 */
type GroupInit = Partial<Transform>;
/**
 * Constructor options for a {@link StackingContext}.
 */
type StackingContextInit = GroupInit & {
    zIndex?: number;
};
type SceneChild = Container | Html | Group;
type RenderSceneChild = Container | Html;
type ContainerChild = Glass | Group;
type GlassChild = Html | Group;
type GroupChild = Container | Glass | Html | Group;
type SceneMutationListener = () => void;
/** Flattened scene render layer with its composed world transform and stable traversal order. */
type TraversedSceneLayer = {
    /** Renderable scene node reached through the scene hierarchy. */
    child: RenderSceneChild;
    /** Scene-layer transform composed with any ancestor groups. */
    transform: Matrix2D;
    /** Stable preorder index among flattened scene layers. */
    traversalIndex: number;
};
/**
 * A DOM-backed scene node that can be layered directly in the scene or inside a glass shape.
 */
declare class Html implements Transform {
    /** Horizontal translation in CSS pixels. */
    x: number;
    /** Vertical translation in CSS pixels. */
    y: number;
    /** Horizontal scale factor. */
    scaleX: number;
    /** Vertical scale factor. */
    scaleY: number;
    /** Clockwise rotation in radians. */
    rotation: number;
    /** Local-space transform origin in CSS pixels. */
    origin: Point;
    /** Host element copied by the renderer and used by the browser for hit testing. */
    readonly host: HTMLDivElement;
    private _width;
    private _height;
    private _opacity;
    private _blur;
    private _zIndex;
    private _element;
    _elementVersion: number;
    _parent: Scene | Glass | Group | null;
    constructor(options?: HtmlInit);
    /** Node width in CSS pixels. */
    get width(): number;
    set width(value: number);
    /** Node height in CSS pixels. */
    get height(): number;
    set height(value: number);
    /** Final opacity used when compositing this HTML node into the rendered scene. */
    get opacity(): number;
    set opacity(value: number);
    /** Content blur radius in CSS pixels applied when compositing this HTML node. */
    get blur(): number;
    set blur(value: number);
    /** Draw order among sibling scene or glass HTML nodes. */
    get zIndex(): number;
    set zIndex(value: number);
    /** The optional child element rendered inside this node's host. */
    get element(): HTMLElement | null;
    /** Replaces the single child element inside this node's host. */
    setElement(element: HTMLElement | null): void;
    /** Detaches this HTML node from its parent scene or glass, if attached. */
    remove(): void;
    private syncHostSize;
}
/**
 * A single rounded glass shape inside a {@link Container}.
 */
declare class Glass extends EventTarget implements Transform {
    /** Horizontal translation in CSS pixels. */
    x: number;
    /** Vertical translation in CSS pixels. */
    y: number;
    /** Horizontal scale factor. */
    scaleX: number;
    /** Vertical scale factor. */
    scaleY: number;
    /** Clockwise rotation in radians. */
    rotation: number;
    /** Local-space transform origin in CSS pixels. */
    origin: Point;
    private _width;
    private _height;
    /** Shape width in CSS pixels. */
    get width(): number;
    set width(value: number);
    /** Shape height in CSS pixels. */
    get height(): number;
    set height(value: number);
    private _cornerRadius;
    private _cornerSmoothing;
    /** Uniform corner radius in CSS pixels. */
    get cornerRadius(): number;
    set cornerRadius(value: number);
    /** Smooth-corner amount. 0 produces circular corners; 0.6 is tuned for an iOS-like squircle. */
    get cornerSmoothing(): number;
    set cornerSmoothing(value: number);
    private _pointerEvents;
    private _zIndex;
    /** Enables renderer-side glass pointer events when set to `true`. */
    get pointerEvents(): boolean;
    set pointerEvents(value: boolean);
    /** Draw order among sibling glass nodes in the same container. */
    get zIndex(): number;
    set zIndex(value: number);
    _parent: Container | Group | null;
    _children: GlassChild[];
    /**
     * Creates a glass shape descriptor.
     */
    constructor(options?: GlassInit);
    /** Adds an HTML child or transform-only group to this glass, reparenting it if needed. */
    add<T extends GlassChild>(child: T): T;
    /**
     * Detaches this glass from its parent container, if attached.
     */
    remove(): void;
    addEventListener<T extends GlassPointerEventType>(type: T, listener: ((event: GlassEventMap[T]) => void) | null, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<T extends GlassPointerEventType>(type: T, listener: ((event: GlassEventMap[T]) => void) | null, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void;
}
/**
 * A renderable glass layer whose child {@link Glass} nodes blend into a single SDF field.
 */
declare class Container implements Transform {
    /** Horizontal translation in CSS pixels. */
    x: number;
    /** Vertical translation in CSS pixels. */
    y: number;
    /** Horizontal scale factor. */
    scaleX: number;
    /** Vertical scale factor. */
    scaleY: number;
    /** Clockwise rotation in radians. */
    rotation: number;
    /** Local-space transform origin in CSS pixels. */
    origin: Point;
    /** Overall compositing opacity for the container's glass and shadow. */
    opacity: number;
    /** Fusion distance used when blending neighboring shapes in CSS pixels. */
    spacing: number;
    /** Backdrop blur radius in CSS pixels. */
    blur: number;
    /** Width of the beveled edge in CSS pixels. */
    bezelWidth: number;
    /** Base glass thickness in CSS pixels. */
    thickness: number;
    /** Scalar applied to the physically-derived displacement amount. */
    displacementFactor: number;
    /** Blur radius applied to the precomputed displacement field in CSS pixels. */
    displacementBlur: number;
    /**
     * Exponent shaping SDF smooth-union normal gating.
     * Higher values suppress blending longer as boundary normals diverge.
     */
    normalDivergenceBlendPower: number;
    /** Enables normal-based suppression of SDF smooth-union blending. */
    normalDivergenceBlendEnabled: boolean;
    /** Refractive index used for the displacement model. */
    ior: number;
    /** Refractive index used when refracting DOM content rendered inside the glass. */
    contentIor: number;
    /**
     * Content-only refraction depth in CSS pixels.
     * This is used instead of {@link thickness} when calculating DOM-content refraction.
     */
    contentDepth: number;
    /** Strength of RGB channel separation applied to refraction. */
    dispersion: number;
    /** Surface profile used for the beveled edge. */
    surfaceProfile: SurfaceProfile;
    /** 2D light direction in radians, where 0 points upward in screen space. */
    lightDirection: number;
    /** Multiplier applied to the white specular term. */
    specularStrength: number;
    /** Width of the specular band. Numeric values are CSS pixels; `'hairline'` is one device pixel. */
    specularWidth: SpecularWidth;
    /** Amount by which specular strength falls off from the edge to the end of the band. */
    specularFalloff: number;
    /** Multiplier applied to the opposite-side white specular term. */
    oppositeSpecularStrength: number;
    /** Exponent controlling specular falloff. */
    specularSharpness: number;
    /** Final opacity of the white specular contribution. */
    specularOpacity: number;
    /** Offset in CSS pixels used when sampling the reflection color. */
    reflectionOffset: number;
    /** RGBA tint color layered over the refracted glass interior. */
    tint: RgbaColor;
    /** RGBA color used by the container's drop shadow. Alpha `0` disables shadows. */
    shadowColor: RgbaColor;
    /** Horizontal drop shadow offset in CSS pixels. */
    shadowOffsetX: number;
    /** Vertical drop shadow offset in CSS pixels. */
    shadowOffsetY: number;
    /** Drop shadow blur radius in CSS pixels. */
    shadowBlur: number;
    /** Drop shadow spread in CSS pixels. Positive values expand the silhouette. */
    shadowSpread: number;
    /** Renders the calculated displacement field instead of the shaded glass. */
    debugDisplacement: boolean;
    /** Draw order among scene layers; higher values render later. */
    zIndex: number;
    _parent: Scene | Group | null;
    _children: ContainerChild[];
    /**
     * Creates a glass rendering layer with optical properties shared by its child shapes.
     */
    constructor(options?: ContainerInit);
    /**
     * Adds a glass shape or transform-only group to this container, reparenting it if needed.
     */
    add<T extends ContainerChild>(child: T): T;
    /**
     * Detaches this container from its parent scene or group, if attached.
     */
    remove(): void;
}
/**
 * A transform-only hierarchy node that can be inserted anywhere in the scene graph.
 */
declare class Group implements Transform {
    /** Horizontal translation in CSS pixels. */
    x: number;
    /** Vertical translation in CSS pixels. */
    y: number;
    /** Horizontal scale factor. */
    scaleX: number;
    /** Vertical scale factor. */
    scaleY: number;
    /** Clockwise rotation in radians. */
    rotation: number;
    /** Local-space transform origin in CSS pixels. */
    origin: Point;
    _parent: Scene | Container | Glass | Group | null;
    _children: GroupChild[];
    /**
     * Creates a transform-only group node.
     */
    constructor(options?: GroupInit);
    /**
     * Adds a child node, reparenting it if needed.
     * Throws if the child type is invalid for this group's nearest non-group parent.
     */
    add<T extends GroupChild>(child: T): T;
    /**
     * Detaches this group from its parent, if attached.
     */
    remove(): void;
}
/**
 * A transform-only hierarchy node that creates a local z-index sorting context.
 */
declare class StackingContext extends Group {
    private _zIndex;
    /**
     * Creates a local stacking context.
     */
    constructor(options?: StackingContextInit);
    /** Draw order of this entire subtree in the nearest parent stacking context. */
    get zIndex(): number;
    set zIndex(value: number);
}
/**
 * Root node for a glass scene graph.
 */
declare class Scene {
    _children: SceneChild[];
    _listeners: Set<SceneMutationListener>;
    /**
     * Adds a container, HTML layer, transform-only group, or stacking context to the scene.
     */
    add<T extends SceneChild>(child: T): T;
    _subscribe(listener: SceneMutationListener): () => void;
    _notifyMutation(): void;
}

/**
 * Constructor options for {@link Renderer}.
 */
type RendererInit = {
    /** Scene to render. If omitted, a new empty scene is created. */
    scene?: Scene;
    /** Maximum device pixel ratio used for internal render targets. Defaults to `2`. */
    maxDpr?: number;
};
/**
 * Imperative WebGPU renderer for a liquid-glass scene graph.
 *
 * The renderer owns a canvas and a DOM subtree root that is copied into GPU
 * textures. Rendering itself is delegated to {@link WebGpuGlassCore}, which can
 * also be hosted by non-DOM renderers.
 */
declare class Renderer {
    /** Scene currently rendered by this renderer. */
    readonly scene: Scene;
    /** Canvas element that presents the rendered output. */
    readonly canvas: HTMLCanvasElement;
    /** Maximum device pixel ratio used for internal render targets. */
    maxDpr: number;
    private readonly targetCanvas;
    private readonly domContent;
    private readonly pointerController;
    private unsubscribeSceneMutations;
    private initError;
    private destroyed;
    private initialized;
    private pendingSceneContentSync;
    private sceneContentSyncQueued;
    private currentDpr;
    private resizeObserver;
    private device;
    private context;
    private presentationFormat;
    private core;
    private canvasConfigured;
    private lastFrameTexture;
    /** Handles canvas paint events by copying managed DOM content into GPU textures. */
    private readonly handlePaintEvent;
    /** Marks scene-derived DOM and interaction state as dirty after scene mutations. */
    private readonly handleSceneMutation;
    /**
     * Creates a renderer and begins asynchronous WebGPU initialization immediately.
     */
    constructor(options?: RendererInit);
    /** Enables or disables cached backdrop metrics for a container. */
    setBackdropMetricsTracking(container: Container, enabled: boolean): void;
    /** Returns the latest completed cached backdrop metrics for a tracked container. */
    getBackdropMetrics(container: Container): BackdropMetrics | null;
    /** Renders one frame if the renderer is initialized. */
    render(): void;
    /** Tears down observers, event listeners, and GPU resources owned by this renderer. */
    destroy(): void;
    /** Creates WebGPU resources and pipelines needed by the renderer. */
    private initialize;
    /** Synchronizes canvas/backing texture dimensions with CSS size and DPR. */
    private syncCanvasSize;
    /** Paints the previous completed frame into the newly configured canvas target. */
    private preservePreviousFrameAfterResize;
    /** Queues scene-derived DOM and pointer state synchronization on a microtask. */
    private queueSceneContentSync;
    /** Immediately synchronizes scene-derived DOM, content, and pointer caches. */
    private syncSceneNow;
    /** Flushes any queued scene content synchronization before pointer work. */
    private flushSceneContentSync;
    /** Draws a complete frame for the provided sorted scene layers. */
    private drawFrame;
}

declare const GLASS_POINTER_EVENT_TYPES: readonly ["click", "pointerenter", "pointerleave", "pointermove", "pointerdown", "pointerup", "pointercancel"];
type GlassPointerEventType = (typeof GLASS_POINTER_EVENT_TYPES)[number];
type GlassPointerEventInit = {
    glass: Glass;
    renderer: Renderer;
    nativeEvent: PointerEvent;
    canvasX: number;
    canvasY: number;
    localX: number;
    localY: number;
    inside: boolean;
};
/**
 * Custom pointer event dispatched by a {@link Glass} instance.
 */
declare class GlassPointerEvent extends Event {
    readonly glass: Glass;
    readonly renderer: Renderer;
    readonly nativeEvent: PointerEvent;
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;
    readonly button: number;
    readonly buttons: number;
    readonly clientX: number;
    readonly clientY: number;
    readonly canvasX: number;
    readonly canvasY: number;
    readonly localX: number;
    readonly localY: number;
    readonly inside: boolean;
    constructor(type: GlassPointerEventType, init: GlassPointerEventInit);
}

export { type BackdropMetrics as B, Container as C, Glass as G, Html as H, type Matrix2D as M, type Point as P, Renderer as R, Scene as S, type TraversedSceneLayer as T, type SpecularWidth as a, GlassPointerEvent as b, type GlassPointerEventInit as c, type GlassPointerEventType as d, Group as e, type RgbaColor as f, StackingContext as g, type SurfaceProfile as h, type Transform as i, type ContainerInit as j, type GlassInit as k };
