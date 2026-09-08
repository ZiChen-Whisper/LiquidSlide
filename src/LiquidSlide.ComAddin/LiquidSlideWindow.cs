using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using PowerPoint = Microsoft.Office.Interop.PowerPoint;

namespace LiquidSlide.ComAddin
{
    [ComVisible(true)]
    [Guid("8D175711-7BCE-4411-90EC-E20B9EA9BF1B")]
    [ProgId("LiquidSlide.TaskPaneControl")]
    [ClassInterface(ClassInterfaceType.AutoDispatch)]
    public sealed class LiquidSlideWindow : UserControl
    {
        private PowerPointBridge bridge;
        private bool ready;
        private bool paneVisible;
        private bool windowActive;
        private bool initializing;
        private bool effectiveVisible;
        private object pendingCommand;
        private bool commandBusy;
        private string commandId;
        private bool watchSelection;
        private bool handlingRequest;
        private string observedSelection;
        private string publishedSelection;
        // Cheap geometry comparison only. This timer NEVER exports or edits a slide.
        private readonly Timer selectionWatcher = new Timer { Interval = 250 };
        private readonly WebView2 webView = new WebView2 { Dock = DockStyle.Fill };
        private readonly JavaScriptSerializer serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };

        public LiquidSlideWindow()
        {
            MinimumSize = new Size(340, 560);
            Controls.Add(webView);
            Load += async (_, __) => { if (bridge != null) await InitializeWebViewAsync(); };
            selectionWatcher.Tick += CheckSelection;
        }

        internal void Bind(PowerPoint.Application application, int windowId)
        {
            if (bridge != null) throw new InvalidOperationException("面板已经绑定到窗口。");
            bridge = new PowerPointBridge(application, windowId);
            windowActive = bridge.IsOwnerActive;
            effectiveVisible = paneVisible && windowActive;
            if (IsHandleCreated) _ = InitializeWebViewAsync();
        }

        internal void SetPaneVisible(bool visible) { paneVisible = visible; UpdateAvailability(); }
        internal void SetWindowActive(bool active)
        {
            if (!active && windowActive)
            {
                pendingCommand = null;
                commandId = null;
                commandBusy = false;
                // Cancel even when this pane was already hidden.
                if (ready) webView.CoreWebView2?.PostWebMessageAsJson("{\"type\":\"cancelCommand\"}");
            }
            windowActive = active;
            UpdateAvailability();
        }

        private void UpdateAvailability()
        {
            if (IsDisposed || Disposing) return;
            var visible = paneVisible && windowActive;
            if (!visible)
            {
                selectionWatcher.Stop();
            }
            if (effectiveVisible == visible) return;
            effectiveVisible = visible;
            SendVisibility();
        }

        private void SendVisibility()
        {
            if (!ready || IsDisposed || Disposing) return;
            try
            {
                webView.CoreWebView2?.PostWebMessageAsJson(effectiveVisible ? "{\"type\":\"shown\"}" : "{\"type\":\"hidden\"}");
            }
            catch (Exception error) when (error is COMException || error is InvalidOperationException)
            { System.Diagnostics.Debug.WriteLine("LiquidSlide pane visibility: " + error.Message); }
        }

        private void CheckSelection(object sender, EventArgs args)
        {
            if (!watchSelection || !effectiveVisible || !bridge.IsOwnerActive || !ready || handlingRequest || Control.MouseButtons != MouseButtons.None) return;
            string fingerprint;
            try { fingerprint = bridge.SelectionFingerprint(); }
            catch (COMException) { return; } // PowerPoint is busy; do not interfere with an edit.
            catch (InvalidOperationException) { fingerprint = "no-selection"; }
            // Wait for two matching observations, so a drag/resize produces one refresh on release.
            if (fingerprint != observedSelection) { observedSelection = fingerprint; return; }
            if (fingerprint == publishedSelection) return;
            publishedSelection = fingerprint;
            webView.CoreWebView2.PostWebMessageAsJson("{\"type\":\"selectionChanged\"}");
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                selectionWatcher.Stop();
                selectionWatcher.Dispose();
                pendingCommand = null;
                ready = false;
            }
            base.Dispose(disposing);
        }

        internal void ApplyPreset(string preset)
        {
            if (commandBusy) throw new InvalidOperationException("正在应用材质，请稍后重试。");
            if (bridge == null) throw new InvalidOperationException("面板正在启动，请稍后重试。");
            if (!bridge.IsOwnerActive) throw new InvalidOperationException("请在此面板所属的 PowerPoint 窗口中应用材质。");
            var selection = serializer.DeserializeObject(serializer.Serialize(bridge.InspectSelection())) as IDictionary<string, object>;
            commandId = Guid.NewGuid().ToString("N");
            pendingCommand = new { type = "preset", preset, shape = selection["shape"], commandId };
            commandBusy = true;
            // Create native handles without making the Office pane visible.
            var controlHandle = Handle;
            var browserHandle = webView.Handle;
            _ = InitializeWebViewAsync();
            SendPendingCommand();
        }

        private void SendPendingCommand()
        {
            if (!ready || pendingCommand == null) return;
            webView.CoreWebView2.PostWebMessageAsJson(serializer.Serialize(pendingCommand));
            pendingCommand = null;
        }

        private static void OpenExternalLink(string address)
        {
            if (!Uri.TryCreate(address, UriKind.Absolute, out var uri) || uri.Scheme != "https" || uri.Host != "github.com") return;
            try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true }); }
            catch (Exception error) { MessageBox.Show(error.Message, "无法打开链接", MessageBoxButtons.OK, MessageBoxIcon.Information); }
        }

        private async Task InitializeWebViewAsync()
        {
            if (initializing || IsDisposed || Disposing || bridge == null || webView.CoreWebView2 != null) return;
            initializing = true;
            try
            {
                var userData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "LiquidSlide", "WebView2");
                var environment = await CoreWebView2Environment.CreateAsync(null, userData);
                if (IsDisposed || Disposing) return;
                await webView.EnsureCoreWebView2Async(environment);
                if (IsDisposed || Disposing) return;
                var webRoot = Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location), "web");
                webView.CoreWebView2.SetVirtualHostNameToFolderMapping("liquidslide.local", webRoot, CoreWebView2HostResourceAccessKind.DenyCors);
                webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
                webView.CoreWebView2.NewWindowRequested += (_, args) => { args.Handled = true; OpenExternalLink(args.Uri); };
                webView.CoreWebView2.NavigationStarting += (_, args) =>
                {
                    if (Uri.TryCreate(args.Uri, UriKind.Absolute, out var uri) && uri.Scheme == "https" && uri.Host == "liquidslide.local") return;
                    args.Cancel = true;
                    OpenExternalLink(args.Uri);
                };
                webView.CoreWebView2.Navigate("https://liquidslide.local/taskpane.html");
            }
            catch (Exception exception)
            {
                if (IsDisposed || Disposing) return;
                pendingCommand = null;
                commandId = null;
                commandBusy = false;
                MessageBox.Show("LiquidSlide 需要 Microsoft Edge WebView2 Runtime。\n\n" + exception.Message,
                    "LiquidSlide 启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally { initializing = false; }
        }

        private void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs args)
        {
            if (IsDisposed || Disposing) return;
            handlingRequest = true;
            IDictionary<string, object> request = null;
            object id = null;
            try
            {
                request = serializer.DeserializeObject(args.WebMessageAsJson) as IDictionary<string, object>;
                if (request == null) throw new InvalidOperationException("无效的 WebView 消息。");
                id = request["id"];
                var type = Convert.ToString(request["type"]);
                var payload = request.ContainsKey("payload") ? request["payload"] as IDictionary<string, object> : new Dictionary<string, object>();
                var ribbonCommand = request.TryGetValue("commandId", out var token) && commandId != null && Convert.ToString(token) == commandId;
                if ((type == "captureBackground" || type == "applyFill" || type == "applyShadow" || type == "removeOutline") &&
                    (!bridge.IsOwnerActive || (token != null ? !ribbonCommand : !effectiveVisible)))
                    throw new InvalidOperationException("面板已关闭或窗口已切换，操作已停止。");
                object result;
                switch (type)
                {
                    // Acknowledge before opening the modal, so a long visit cannot time out the bridge.
                    case "showAbout": BeginInvoke(new Action(AboutWindow.ShowAbout)); result = true; break;
                    case "watchSelection":
                        watchSelection = Convert.ToBoolean(payload["enabled"]);
                        if (watchSelection && effectiveVisible && bridge.IsOwnerActive)
                        {
                            observedSelection = publishedSelection = null;
                            selectionWatcher.Start();
                        }
                        else selectionWatcher.Stop();
                        result = true; break;
                    case "ready": ready = true; SendVisibility(); SendPendingCommand(); result = true; break;
                    case "commandFinished":
                        if (!ribbonCommand) { result = false; break; }
                        commandBusy = false;
                        commandId = null;
                        if (payload.TryGetValue("error", out var error) && error != null && bridge.IsOwnerActive)
                            MessageBox.Show(Convert.ToString(error), "LiquidSlide", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        result = true; break;
                    case "inspectSelection": result = bridge.InspectSelection(); break;
                    case "captureBackground":
                        result = bridge.CaptureBackground(payload);
                        observedSelection = publishedSelection = bridge.SelectionFingerprint();
                        break;
                    case "applyFill":
                        result = bridge.ApplyFill(payload); break;
                    case "applyShadow": result = bridge.ApplyShadow(payload); break;
                    case "removeOutline": result = bridge.RemoveOutline(payload); break;
                    default: throw new InvalidOperationException("未知请求：" + type);
                }
                webView.CoreWebView2.PostWebMessageAsJson(serializer.Serialize(new { id, ok = true, result }));
            }
            catch (Exception exception)
            {
                webView.CoreWebView2.PostWebMessageAsJson(serializer.Serialize(new { id, ok = false, error = exception.Message }));
            }
            finally { handlingRequest = false; }
        }
    }
}
