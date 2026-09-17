# LiquidSlide 的 liquid-dom 轮廓扩展

上游：https://github.com/AndrewPrifer/liquid-dom
基线：锁定 npm 包 `@liquid-dom/core@0.1.1` 的 ESM 发布文件。
版权及许可：Andras Prifer，MIT，见 LICENSE。

## 文件与构建

- index.js：上游可读 ESM 渲染代码，包含 LiquidSlide 的距离场输入扩展。
- chunk-VZK7DLTH.js：未修改的上游场景图和几何辅助代码。
- index.d.ts、events-CKVs_a7L.d.ts：上游声明；前者新增可选 contour 输入。
- UPSTREAM-SHA256SUMS.txt：复制前的上游文件摘要。
- contour.patch：相对锁定 npm 基线的补丁，便于审查及后续迁移。

webpack 的精确模块别名将 @liquid-dom/core 指向此目录；TypeScript paths 使用同一声明。
所有面板、材质和渲染代码使用同一个场景图实现，避免混用类实例。
npm 依赖保留原版以记录基线；重新安装依赖不会覆盖此目录。升级时需显式移植补丁。

## 扩展边界

core.render 的可选 contour 参数包含 texture、pixelsPerCssPixel、paddingPixels。
它针对 LiquidSlide 的单图形渲染；每个容器必须只有一个 Glass。
距离场在图形局部坐标中，内部负值、外部正值，单位为距离场像素。
使用 r32uint 无损保存 Float32 位模式，在 WGSL 中 bitcast 回浮点值并手工双线性插值。
因此不要求设备支持 float32-filterable。

只替换 shapeDistanceFromLocal 的距离来源，保留上游的边界梯度、表面坡度、
折射光线、色散、位移柔化、高光和背景模糊流程。无 contour 输入时沿用原来的圆角矩形距离公式。
阴影和背景统计也使用同一距离输入。距离场纹理由调用者持有，GPU 工作完成后释放。

宿主导出 PowerPoint SVG 轮廓，再计算完整的内外欧氏距离场。
输出时只移除计算所需的外围留白，不缩放或改造已经渲染好的图形边缘。
PPT 填充边界及面板显示遮罩与参与折射的原始轮廓保持一致。

未运行完整测试套件；已进行针对性的临时文档和 WebView2 渲染诊断，原 PowerPoint 窗口效果仍待验收。

## 边缘对齐修订

宿主导出时增加与图形原始尺寸相同的专色校准矩形，白色图形位于其上。
从 SVG 中直接读取矩形的矢量坐标，作为 viewBox；移除矩形和 Office 残留的阴影副本。
保留图形在原始矩形内的空白区域，不按路径的紧致边界拉伸，也不从 PNG alpha 反推坐标。
前端通过 SVG 解码生成透明轮廓，在原有距离场和 liquid-dom 光学管线中使用。
复制品的原生 3D 倒角被显式清除，避免把已有倒角当成二维轮廓。

距离场以最高两倍输出采样率计算（受内存与纹理尺寸限制），用边缘覆盖率初始化亚像素距离。
不再将边缘二值化后单独覆写一圈不连续距离。最终输出按精确浮点尺寸取图后一次映射到整数 PNG 尺寸。
这些修改仍待用户的 PowerPoint 视觉验收。

