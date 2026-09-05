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
        private readonly WebView2 webView = new WebView2 { Dock = DockStyle.Fill };
        private readonly JavaScriptSerializer serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };

        public LiquidSlideWindow()
        {
            MinimumSize = new Size(340, 560);
            Controls.Add(webView);
            Load += async (_, __) => await InitializeWebViewAsync();
        }

        private async Task InitializeWebViewAsync()
        {
            if (webView.CoreWebView2 != null) return;
            try
            {
                var application = ComAddin.CurrentApplication ?? throw new InvalidOperationException("PowerPoint connection is not ready.");
                bridge = new PowerPointBridge(application);
                var userData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "LiquidSlide", "WebView2");
                var environment = await CoreWebView2Environment.CreateAsync(null, userData);
                await webView.EnsureCoreWebView2Async(environment);
                var webRoot = Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location), "web");
                webView.CoreWebView2.SetVirtualHostNameToFolderMapping("liquidslide.local", webRoot, CoreWebView2HostResourceAccessKind.DenyCors);
                webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
                webView.CoreWebView2.Navigate("https://liquidslide.local/taskpane.html");
            }
            catch (Exception exception)
            {
                MessageBox.Show("LiquidSlide 需要 Microsoft Edge WebView2 Runtime。\n\n" + exception.Message,
                    "LiquidSlide 启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs args)
        {
            IDictionary<string, object> request = null;
            object id = null;
            try
            {
                request = serializer.DeserializeObject(args.WebMessageAsJson) as IDictionary<string, object>;
                if (request == null) throw new InvalidOperationException("无效的 WebView 消息。");
                id = request["id"];
                var type = Convert.ToString(request["type"]);
                var payload = request.ContainsKey("payload") ? request["payload"] as IDictionary<string, object> : new Dictionary<string, object>();
                object result;
                switch (type)
                {
                    case "inspectSelection": result = bridge.InspectSelection(); break;
                    case "captureBackground": result = bridge.CaptureBackground(payload); break;
                    case "applyFill": result = bridge.ApplyFill(payload); break;
                    case "applyShadow": result = bridge.ApplyShadow(payload); break;
                    default: throw new InvalidOperationException("未知请求：" + type);
                }
                webView.CoreWebView2.PostWebMessageAsJson(serializer.Serialize(new { id, ok = true, result }));
            }
            catch (Exception exception)
            {
                webView.CoreWebView2.PostWebMessageAsJson(serializer.Serialize(new { id, ok = false, error = exception.Message }));
            }
        }
    }
}
