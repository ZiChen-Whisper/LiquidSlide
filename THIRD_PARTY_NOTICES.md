# Third-party acknowledgements and distribution status

LiquidSlide's original integration/UI code is MIT licensed. That license does not relicense external dependencies or artwork.

## Liquid DOM

The optical rendering is provided by **[Liquid DOM](https://github.com/AndrewPrifer/liquid-dom)**, created by **[Andrew Prifer](https://github.com/AndrewPrifer)**. LiquidSlide uses `@liquid-dom/core@0.1.1` through its public `WebGpuGlassCore`, `Scene`, `Container` and `Glass` APIs. The upstream renderer is not authored by LiquidSlide and is not vendored in this source repository.

License inspection on 2026-09-05: upstream commit `ac60d393bd0cbf5c3cee4a9f82405399265725ff` has no root LICENSE and no core LICENSE; the installed core package has no license field or license file. `packages/layout/LICENSE` covers the separate layout package only. Public source availability is not an explicit redistribution license. Binary distribution of the bundled core/shaders is pending upstream permission; README credit does not resolve that requirement.

## Other dependencies

- React and React DOM — Meta Platforms, Inc. and affiliates; MIT (see their package license files).
- `@liquid-dom/layout` — see upstream `packages/layout/LICENSE` (MIT).
- Microsoft Edge WebView2 SDK — Microsoft; governed by the SDK's NuGet license and redistribution terms. The Evergreen Runtime has separate Microsoft terms.
- PowerPoint / Office are Microsoft products and are not distributed with LiquidSlide.

Before binary release, include the actual required license texts with the distribution and verify the exact locked dependency versions. No third-party runtime bundle is committed here.
