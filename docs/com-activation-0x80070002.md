# 0.1.1 COM 激活失败排查与修复

## 当前结论

用户报告在干净环境中 CoCreateInstance 返回 0x80070002，反射构造成功。
截图确认 COM 激活失败与主 DLL/两项 WebView2 托管依赖存在，但不能证明静态构造抛错。
当前入口原本没有静态构造或模块初始化文件读取；Web 内容路径使用程序集位置。

发现并修复安装脚本将两个 COM 类的 Assembly 固定为 1.0.0.0 的缺陷。
实际 Release DLL 标识为 0.1.1.0。现在从目标 DLL 的 AssemblyName.FullName 写入注册表，
并在注册前将路径规范化为绝对路径、检查 64 位进程。

本机隔离测试中旧注册与修复注册均激活成功，因此此版本差异不能宣称为已证实根因。
用户机器故障是否解除：NOT VERIFIED。

## 补充诊断

- 在 COM 静态入口注册仅针对本插件/WebView2 请求的 AssemblyResolve，按完整标识匹配插件目录 DLL。
- 构造函数和 OnConnection 的进入、成功、异常写入 `%LOCALAPPDATA%\LiquidSlide\logs\startup-进程号.log`。
- 日志写入失败不会阻断加载。尚未到达托管入口的错误无法由该日志捕获；无日志也可能是写入失败。
- `tools/diagnose-com-activation.ps1` 读取有效 HKCR 注册、版本子键、磁盘标识和 SHA256，再直接激活 COM。
  不先 LoadFrom，避免预加载改变待诊断的绑定上下文。

## 用户机器复测

普通用户：下载 v0.1.2 安装包，保存并关闭 PowerPoint，运行安装包升级后重新打开。
下面的手动步骤仅供维护者进一步排障使用，不是普通用户升级要求。

先退出所有 PowerPoint 窗口。用修复后的 DLL 替换安装目录主 DLL（保留原文件备份），
并将更新后的 install-com-addin.ps1 和 diagnose-com-activation.ps1 放入安装目录 tools。
使用新的 64 位 Windows PowerShell 5.1 窗口运行：

```powershell
$pluginPath = Join-Path $env:LOCALAPPDATA 'Programs\LiquidSlide'
& "$pluginPath\tools\install-com-addin.ps1" -AssemblyPath "$pluginPath\LiquidSlide.ComAddin.dll" -NoLaunch
& "$pluginPath\tools\diagnose-com-activation.ps1" -AssemblyPath "$pluginPath\LiquidSlide.ComAddin.dll" *> "$env:USERPROFILE\Desktop\LiquidSlide-activation.txt"
```

如安装路径不同，修改 pluginPath。收集桌面输出及此次进程对应的启动日志。
然后重新打开 PowerPoint，检查加载项、Ribbon、打开面板与应用预设。
COM 激活成功不等于 PowerPoint 全功能验收成功。

## 本地验证

- Release 编译：0 警告、0 错误。
- 在两个全新的 Windows PowerShell 5.1 进程运行 test-com-activation.ps1（普通/LegacyIdentity）：均返回 S_OK。
- 测试通过临时注册子树和进程内 HKCR 重定向调用原生 CoCreateInstance，不修改正式插件注册、不启动 PowerPoint。
- 已验证构造进入/完成日志输出。
- v0.1.2 包含上述修复与诊断，使用独立源码目录构建安装包。用户所述干净机器验收尚未验证。
