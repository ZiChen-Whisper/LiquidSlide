# LiquidSlide

**Liquid Glass for PowerPoint**

为 Windows 桌面 PowerPoint 中的正圆和圆角矩形生成静态液态玻璃填充。读取图形背后的幻灯片背景，通过 WebGPU 渲染，再把生成的 PNG 填回原图形。

> 当前为开发预览，**尚未发布 Release 或安装包**。本项目原创代码采用 MIT；所依赖的 `@liquid-dom/core@0.1.1` 再分发许可尚未明确，包含该依赖的二进制发布暂缓。详见 [第三方声明](THIRD_PARTY_NOTICES.md)。

## 功能

- 自动识别正圆和圆角矩形，保留原图形对象、文字与描边。
- 示例材质预览；真实预览聚焦选区周围，保留少量背景，便于观察小图形。
- 经典通透、白色玻璃、黑色玻璃、柔雾磨砂预设。
- 高级设置按需展开；固定底栏随时可以应用效果。
- 独立添加 PowerPoint 原生图形阴影：黑色、95% 透明、20 pt 模糊、102% 大小、0 pt 距离。
- 图形标签保存材质参数；图片填充为静态效果，背景改变后需要重新应用。

## 使用方法

1. 在幻灯片中单选一个正圆或圆角矩形，打开“加载项”选项卡中的 LiquidSlide。
2. 选择材质，或展开高级设置微调。
3. 点击 **真实预览**，查看图形与周围真实背景。后续材质调整使用这次背景快照；背景或选区变化后再次点击真实预览。
4. 点击 **应用效果**，重新读取当前选区和背景并写入填充。
5. 可选：点击底栏左侧 **添加图形阴影**。阴影是 PPT 原生属性，不烧录进玻璃图片。

真实预览显示玻璃填充与背景，不模拟 PowerPoint 的描边、文字或原生阴影。图形旋转后按本地坐标采样。当前不支持椭圆、组合、多选或其他自选图形。

## 安装状态与计划

尚无面向普通用户的可下载安装包。计划提供 **Windows x64 EXE 安装程序**，按当前用户安装，无需 Node.js 或 .NET SDK；不要求管理员权限。安装包会放置 COM DLL、WebView2 加载器、网页资源，注册加载项并提供卸载入口。

最终用户需要 64 位桌面 PowerPoint、.NET Framework 4.8、Microsoft Edge WebView2 Runtime，以及支持 WebGPU 的显卡与驱动。32 位 Office 和 macOS 不在当前支持范围。目标宿主为 PowerPoint 2019 x64，其他版本仍需验证。

[Release 准备和完整安装方案](docs/RELEASING.md) · [Inno Setup 安装包草稿](installer/LiquidSlide.iss)

## 从源码进行本地开发

依赖使用权需遵循各上游条款；以下命令不意味着获得再分发授权。

准备 Windows、64 位桌面 PowerPoint、.NET Framework 4.8、.NET SDK（本地验证版本 10.0.400）、Node.js 20+ 和 WebView2 Runtime。当前 C# 工程引用本机 Office PIA，需安装 Office 的 .NET 编程支持。

```powershell
git clone https://github.com/ZiChen-Whisper/LiquidSlide.git
cd LiquidSlide
npm ci
# 保存并关闭所有 PowerPoint 窗口后：
npm start
```

`npm start` 构建前端和 COM DLL，在当前用户 HKCU 下注册加载项并启动 PowerPoint。面板从本机编译目录读取资源，无需启动网页服务器。不要移动已注册的开发目录；移动后需重新注册。

```powershell
npm run typecheck
npm run lint
npm test
npm run build:all
# 仅调试网页（不连接 PowerPoint）
npm run dev-server
# 关闭 PowerPoint 后卸载本地注册
npm run uninstall:addin
```

本地可放置自行拥有使用权的 `assets/preview-background.jpg` 作为示例背景。该文件被 Git 忽略；公开仓库使用原创 `preview-fallback.svg`，遵循本项目 MIT 许可。

## 架构

`PowerPoint COM → 隐藏目标并导出幻灯片 → 裁切背景 → WebGpuGlassCore → 静态 PNG → 原图形填充`

- `src/LiquidSlide.ComAddin/`：C# COM 加载项、WebView2 任务窗格、PowerPoint 桥接。
- `src/rendering/`：GPU 渲染、背景采样、图片输出。
- `src/ui/`、`src/App.tsx`：React 面板和预览。
- `src/domain/`：参数、预设、几何计算与测试。
- `installer/`：未发布的安装包定义草稿。

## 验证边界

自动检查包括 TypeScript、ESLint、单元测试和本机编译。浏览器检查覆盖预设、高级设置、局部预览、固定底栏和模拟桥接的预览/应用分离。它们不代替 PowerPoint 内实测。

原生阴影精确属性、干净环境安装/卸载、不同 DPI/显卡/Office 版本、保存重开等仍需发布前验证。安装器草稿尚未完成先决条件检测和完整安装测试，不应视为可用的公开安装包。

## 致谢与许可

玻璃光学渲染依赖 **[Andrew Prifer](https://github.com/AndrewPrifer)** 创建的 **[Liquid DOM](https://github.com/AndrewPrifer/liquid-dom)**，使用 `@liquid-dom/core` 的 `WebGpuGlassCore` 接口。感谢作者的实现；LiquidSlide 提供的是 PowerPoint 集成与 UI，而非原创光学渲染引擎。

截至 2026-09-05 核查，上游根目录及 core 包无明确许可证，独立 layout 包的 MIT 不能推广到整个渲染核心。我们不在本仓库提交上游代码、打包 JS 或 DLL，也不在权限明确前分发包含它的安装包。

LiquidSlide 原创代码：[MIT](LICENSE)。依赖和图片分别遵循各自授权，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
