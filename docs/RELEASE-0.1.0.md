# LiquidSlide 0.1.0

首个公开版本，为 Windows 桌面 PowerPoint 中的正圆和圆角矩形生成静态液态玻璃填充。

- 蓝紫色界面与全新 AI 生成的示例预览背景。
- 经典通透、白色玻璃、黑色玻璃和柔雾磨砂预设。
- 示例 / 真实预览，参数调整后点击“应用效果”写入图形填充。
- PowerPoint 顶部 LiquidSlide 菜单提供材质快捷按钮、打开面板和“关于”。
- 面板与顶部菜单中的“关于”均展示版本、仓库链接、作者 GitHub 主页、Issues 联系方式与开源致谢。
- Liquid DOM 作者已添加 MIT 许可证；安装包包含根目录、core 和 layout 的许可文本，以及其他依赖声明。

## 安装

下载 `LiquidSlide-0.1.0-windows-x64-setup.exe`，保存文稿并关闭 PowerPoint 后运行安装器，再重新打开 PowerPoint。升级、卸载前也需关闭 PowerPoint。

需要 Windows x64、64 位桌面 PowerPoint、.NET Framework 4.8、Microsoft Edge WebView2 Evergreen Runtime，以及支持 WebGPU 的显卡和驱动。安装器不会自动安装这些前置组件。

附件 `SHA256SUMS.txt` 提供安装包 SHA-256 校验值。可在 PowerShell 中运行：

```powershell
Get-FileHash .\LiquidSlide-0.1.0-windows-x64-setup.exe -Algorithm SHA256
```

## 验证范围

维护者已确认插件功能可用。类型检查、ESLint、22 项单元测试及 x64 Release 编译通过。“关于”页面通过浏览器打开 / 关闭 / Escape / 窄面板检查，并验证了模拟顶部菜单消息的打开路径；新增原生菜单未在本轮重启 PowerPoint 实测。安装包未进行代码签名；干净机器、其他 Office 版本和显卡的兼容性尚未全面验证。

问题反馈与联系：[GitHub Issues](https://github.com/ZiChen-Whisper/LiquidSlide/issues)。
