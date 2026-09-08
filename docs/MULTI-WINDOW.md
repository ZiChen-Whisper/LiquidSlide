# PowerPoint 多窗口任务窗格

## 修复原因

旧实现只保存一个 `CustomTaskPane`，创建时未指定父窗口，且通过静态 `LiquidSlideWindow.Current` 发送命令。因此第二个窗口仍访问第一个窗口的窗格；首窗关闭后还可能继续使用已被 Office 删除的 COM 对象。

微软说明：[`ICTPFactory.CreateCTP` 的第三个参数](https://learn.microsoft.com/en-us/dotnet/api/microsoft.office.core.ictpfactory.createctp?view=office-pia)指定宿主窗口，省略时使用当时的 ActiveWindow。任务窗格绑定文档窗口，多个窗口需要分别管理，参见[多窗口任务窗格说明](https://learn.microsoft.com/en-us/visualstudio/vsto/custom-task-panes?view=visualstudio#Managing)。本项目使用原生 COM，不依赖 VSTO 的 CustomTaskPanes 集合。

## 当前行为

- 以 DocumentWindow.HWND 管理窗格，CreateCTP 显式传入该 DocumentWindow。
- 各编辑窗口按需创建自己的面板；只有“打开面板”展开面板，已被 Office 删除的面板按需重建。
- 材质命令从 Ribbon 的 Context 取得窗口，发送给该窗格的 ContentControl；不再使用全局面板实例。
- 四个 Ribbon 材质按钮保持面板原有显隐状态。首次使用时创建隐藏的 WebView2 控件，等待前端完成初始读取后直接截图、渲染并填充，无需先打开面板。
- 隐藏面板暂停选区检测和预览；显式 Ribbon 命令通过独立命令标识允许隐藏应用。切换窗口撤销该标识并取消旧任务，即使面板本来就隐藏也会取消；旧命令不能在切回窗口后继续写入。回到原窗口保留用户选择的示例/真实模式。
- 每个 PowerPointBridge 强制绑定窗口。截图、填充、阴影和描边操作仍需通过选区校验；所属窗口不活跃时拒绝访问其他窗口。
- 关闭窗口/文稿时清理对应条目；卸载时逐个释放。清理先移除条目，避免 Office 的同步 Disposed 回调重复删除。

## 验证

已通过：COM Release 构建、8 项窗格生命周期测试及 22 项现有前端单元测试。

隐藏快捷应用另通过浏览器模拟宿主、真实 WebGPU 回归：延迟初始读取后首次隐藏应用成功；隐藏状态下收到切窗取消时不写入填充；后续重试成功；全程未开启选区检测。该回归不证明 Office 隐藏窗格的实际加载与显隐行为。

PowerShell 7 中运行生命周期测试，不启动 PowerPoint：

```powershell
./tools/test-window-panes.ps1
```

`tools/test-com.ps1` 已扩展窗口绑定回归：两份演示文稿之间拒绝跨窗操作、第二窗口自己的 bridge 可操作、回到第一窗口可恢复、同一演示文稿的 NewWindow 也隔离。脚本创建和关闭临时演示文稿；检测到 PowerPoint 已运行时会退出。

关闭全部 PowerPoint 后可运行：

```powershell
powershell -NoProfile -File tools/test-com.ps1 -AssemblyPath src/LiquidSlide.ComAddin/bin/x64/Release/net48/LiquidSlide.ComAddin.dll
```

本次 PowerPoint 仍运行，因此真实宿主测试为 **NOT VERIFIED**。上面的 bridge 回归也不能替代 Ribbon 与实际任务窗格的手动验收：

1. 加载新版，打开 A、B 两份演示文稿，各选一个圆角矩形。
2. 在 B 点击“打开面板”并使用顶部材质按钮，确认面板属于 B，且只修改 B。
3. 返回 A，确认它的面板及材质操作仍可用。
4. 关闭 A，在 B 重新打开面板并应用材质，应无“任务窗格已被删除”错误。
5. 在 B 使用“视图 → 新建窗口”，重复面板、应用、关闭其中一窗的检查。
6. 真实预览/应用期间切换窗口，确认未将旧结果写入另一个窗口，示例/真实选择保持不变。
7. 新开窗口，不打开面板，分别点击四个材质按钮：应直接应用且不弹出面板。手动打开再关闭面板后重复；保持面板打开时点击材质也不应关闭它。

2026-09-08 发布确认：维护者反馈已完成测试、没有问题，并授权发布 v0.1.1；本次发布不再追加测试。以上 NOT VERIFIED 为此前代理未执行实机验收时的记录。
