# Third-party notices

LiquidSlide original integration/UI code is MIT licensed (see LICENSE). External dependencies retain their own copyright and terms.

## Liquid DOM

Rendering uses [Liquid DOM](https://github.com/AndrewPrifer/liquid-dom), created by Andrew Prifer (copyright holder: Andras Prifer), through `@liquid-dom/core@0.1.1` and `@liquid-dom/layout@0.2.0`.

Verified on 2026-09-07: upstream added MIT licenses at the root and in `packages/core/LICENSE` in commit [`1eeda968a3999d48b281ccb5835585f5bcd2fbde`](https://github.com/AndrewPrifer/liquid-dom/commit/1eeda968a3999d48b281ccb5835585f5bcd2fbde). The previously recorded missing-license restriction is resolved. The locked npm core package predates the license files, so the upstream texts are explicitly included in the installer as `LiquidDOM-LICENSE.txt` and `LiquidDOM-Core-LICENSE.txt`. The layout package's own MIT text is included separately.

## Bundled dependencies

The full texts below are included under the installed `licenses` directory and in `installer/licenses` in the source repository:

- Liquid DOM core 0.1.1 — Andras Prifer; MIT.
- Liquid DOM layout 0.2.0 — MIT; LiquidDOM-Layout-LICENSE.txt.
- React 19.1.1 and React DOM 19.1.1 — Meta Platforms, Inc. and affiliates; MIT; React-LICENSE.txt and ReactDOM-LICENSE.txt.
- Scheduler 0.26.0 — Meta Platforms, Inc. and affiliates; MIT; Scheduler-LICENSE.txt.
- Bundled style-loader and css-loader runtime helpers — MIT; StyleLoader-LICENSE.txt and CssLoader-LICENSE.txt.
- Microsoft Edge WebView2 SDK 1.0.4191.47 — Microsoft; WebView2-LICENSE.txt and WebView2-NOTICE.txt. The Evergreen Runtime is installed separately under Microsoft's terms.

PowerPoint and Office are not distributed with LiquidSlide. The installer is built with Inno Setup by Jordan Russell and Martijn Laan.

## Preview artwork

`assets/preview-background.png` was AI-generated with the built-in image generation tool on 2026-09-07, using the maintainer-supplied reference only for its blue/violet flowing-petal style. It is a sample background, not a photograph or a screenshot of the plugin effect. The reference screenshot and former local JPEG are not bundled. See docs/PREVIEW-ARTWORK.md for the generation prompt.
