import { H as Html, M as Matrix2D, G as Glass, C as Container, B as BackdropMetrics, T as TraversedSceneLayer, S as Scene, a as SpecularWidth } from './events-CKVs_a7L.js';
export { b as GlassPointerEvent, c as GlassPointerEventInit, d as GlassPointerEventType, e as Group, P as Point, R as Renderer, f as RgbaColor, g as StackingContext, h as SurfaceProfile, i as Transform } from './events-CKVs_a7L.js';

/** One resolution level in an adaptive blur chain. */
type AdaptiveBlurTargetLevel = {
    ping: GPUTexture;
    pong: GPUTexture;
    width: number;
    height: number;
};
/** Full mip-like render target chain used by adaptive multi-resolution blur. */
type AdaptiveBlurTargetChain = {
    format: GPUTextureFormat;
    levels: AdaptiveBlurTargetLevel[];
};

/** Runtime texture and transform state for one scene-attached HTML node. */
type SceneHtmlEntry = {
    html: Html;
    texture: GPUTexture | null;
    filteredTexture: GPUTexture | null;
    elementVersion: number;
    blur: number;
    width: number;
    height: number;
    deviceWidth: number;
    deviceHeight: number;
    copiedDeviceWidth: number;
    copiedDeviceHeight: number;
    textureWidth: number;
    textureHeight: number;
    blurTargetChain: AdaptiveBlurTargetChain | null;
    transform: Matrix2D;
    inverseTransform: Matrix2D | null;
};
/** Storage-buffer range for the HTML content entries attached to one glass. */
type GlassContentRange = {
    start: number;
    count: number;
};
/** Optional content provider used by the WebGPU core for DOM-backed HTML layers. */
type WebGpuGlassContentSource = {
    readonly atlasTexture?: GPUTexture | null;
    readonly contentEntriesBindingResource?: GPUBindingResource | null;
    getSceneHtmlEntry?: (html: Html) => SceneHtmlEntry | null;
    getGlassContentRange?: (glass: Glass) => GlassContentRange | null;
};

/** Resolves public specular-width semantics into the shader's device-pixel space. */
declare function resolveSpecularWidthPx(specularWidth: SpecularWidth, dpr: number): number;
/** Constructor options for the reusable WebGPU glass core. */
type WebGpuGlassCoreInit = {
    device: GPUDevice;
    format: GPUTextureFormat;
};
/** Inputs for one texture-in/texture-out core render. */
type WebGpuGlassCoreRenderOptions = {
    layers?: TraversedSceneLayer[];
    scene?: Scene;
    width: number;
    height: number;
    dpr: number;
    outputTexture: GPUTexture;
    backdropTexture?: GPUTexture | null;
    contentSource?: WebGpuGlassContentSource | null;
    /** LiquidSlide: single-shape signed distance field; negative inside, values in field pixels. */
    contour?: { texture: GPUTexture; pixelsPerCssPixel: number; paddingPixels: number } | null;
};
/** Texture-in/texture-out WebGPU compositor for a liquid-glass scene graph. */
declare class WebGpuGlassCore {
    private readonly backdropMetrics;
    private destroyed;
    private currentDpr;
    private width;
    private height;
    private contentSource;
    private readonly device;
    private readonly format;
    private globalsBuffer;
    private shapesBuffer;
    private backdropMetricsBoundsBuffer;
    private htmlCompositeParamsBuffer;
    private emptyContentEntriesBuffer;
    private sampler;
    private backdropBlurResources;
    private displacementBlurResources;
    private shadowBlurResources;
    private displacementFieldPipeline;
    private shadowMaskPipeline;
    private shadowCompositePipeline;
    private glassPipeline;
    private htmlCompositePipeline;
    private backdropMetricsPipeline;
    private blitPipeline;
    private targets;
    private backdropMetricsTarget;
    /** Creates reusable GPU resources for a host-owned WebGPU device. */
    constructor({ device, format }: WebGpuGlassCoreInit);
    /** Enables or disables cached backdrop metrics for a container. */
    setBackdropMetricsTracking(container: Container, enabled: boolean): void;
    /** Returns the latest completed cached backdrop metrics for a tracked container. */
    getBackdropMetrics(container: Container): BackdropMetrics | null;
    /** Draws one frame into a host-provided output texture. */
    render(options: WebGpuGlassCoreRenderOptions): void;
    /** Releases GPU resources owned by the core. */
    destroy(): void;
    /** Synchronizes internal render-target dimensions with the host output. */
    private syncTargets;
    /** Ensures the shape storage buffer can hold the active glass count. */
    private ensureShapesBuffer;
    /** Writes per-container global shader parameters. */
    private writeGlobals;
    /** Writes the device-pixel bounds sampled by the backdrop metrics pass. */
    private writeBackdropMetricsBounds;
    /** Packs visible glass shapes into the storage buffer and accumulates bounds. */
    private packShapes;
    /** Renders and filters the premultiplied surface field used for refraction displacement. */
    private renderDisplacementField;
    /** Renders the container shadow mask, blurs it, and composites it under the glass. */
    private renderShadow;
    /** Returns whether rendering this container will add a shadow composition pass. */
    private shouldRenderShadow;
    /** Renders and queues copy commands for one backdrop metrics target. */
    private renderBackdropMetrics;
    /** Renders one container's glass shapes over the current scene texture. */
    private renderContainer;
    /** Writes uniforms for compositing one scene-attached HTML texture. */
    private writeHtmlCompositeParams;
    /** Composites a scene-attached HTML layer over the current scene texture. */
    private compositeHtmlLayer;
    /** Samples one texture into another render attachment. */
    private blitTexture;
    /** Draws a complete frame for the provided sorted scene layers. */
    private drawFrame;
}

/** Constructor options for a DOM-backed content provider usable by WebGPU hosts. */
type WebGpuDomContentSourceInit = {
    targetCanvas: HTMLCanvasElement;
    getCurrentDpr: () => number;
    scene?: Scene;
};
/**
 * DOM-to-texture content source for hosts that use {@link WebGpuGlassCore}
 * without the standalone DOM renderer.
 */
declare class WebGpuDomContentSource implements WebGpuGlassContentSource {
    readonly scene: Scene | null;
    private readonly targetCanvas;
    private readonly domContent;
    private destroyed;
    private readonly handlePaintEvent;
    constructor({ targetCanvas, getCurrentDpr, scene }: WebGpuDomContentSourceInit);
    /** Current atlas texture for glass-attached HTML content, if any exists. */
    get atlasTexture(): GPUTexture | null;
    /** Binding resource for glass content entries, or null before GPU allocation. */
    get contentEntriesBindingResource(): GPUBindingResource | null;
    /** Attaches GPU resources used for DOM content textures and storage buffers. */
    setDevice(device: GPUDevice, presentationFormat: GPUTextureFormat): void;
    /** Synchronizes DOM hosts, atlas metadata, and pending DOM-to-texture copies. */
    sync(scene?: Scene | null): TraversedSceneLayer[];
    /** Returns GPU state for a scene-attached HTML node. */
    getSceneHtmlEntry(html: Html): SceneHtmlEntry | null;
    /** Returns the storage-buffer range for a glass node's attached HTML. */
    getGlassContentRange(glass: Glass): GlassContentRange | null;
    /** Removes DOM hosts and destroys GPU resources owned by this content source. */
    destroy(): void;
}

export { BackdropMetrics, Container, Glass, Html, Scene, SpecularWidth, WebGpuDomContentSource, type WebGpuDomContentSourceInit, type WebGpuGlassContentSource, WebGpuGlassCore, type WebGpuGlassCoreInit, type WebGpuGlassCoreRenderOptions, resolveSpecularWidthPx };
