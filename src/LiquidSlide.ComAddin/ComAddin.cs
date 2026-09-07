using System;
using System.Runtime.InteropServices;
using Extensibility;
using System.Windows.Forms;
using Office = Microsoft.Office.Core;
using PowerPoint = Microsoft.Office.Interop.PowerPoint;

namespace LiquidSlide.ComAddin
{
    [ComVisible(true)]
    [Guid(AddInGuid)]
    [ProgId(ProgId)]
    [ClassInterface(ClassInterfaceType.AutoDispatch)]
    public sealed class ComAddin : IDTExtensibility2, Office.ICustomTaskPaneConsumer, Office.IRibbonExtensibility
    {
        public const string AddInGuid = "D8097CA2-70BA-4CB0-9D87-2F8917898D6E";
        public const string ProgId = "LiquidSlide.PowerPointAddin";

        private PowerPoint.Application application;
        internal static PowerPoint.Application CurrentApplication { get; private set; }
        private Microsoft.Office.Core.CustomTaskPane taskPane;

        public void OnConnection(object Application, ext_ConnectMode ConnectMode, object AddInInst, ref Array custom)
        {
            application = (PowerPoint.Application)Application;
            CurrentApplication = application;
        }

        public string GetCustomUI(string ribbonId)
        {
            using (var stream = typeof(ComAddin).Assembly.GetManifestResourceStream("LiquidSlide.Ribbon.xml"))
            using (var reader = new System.IO.StreamReader(stream)) return reader.ReadToEnd();
        }

        public object GetRibbonImage(Office.IRibbonControl control) => RibbonImages.Get(control.Tag);

        public void OnOpenPanel(Office.IRibbonControl control)
        {
            if (taskPane == null) { MessageBox.Show("面板尚未就绪，请稍后重试。", "LiquidSlide"); return; }
            taskPane.Visible = true;
        }

        public void OnApplyPreset(Office.IRibbonControl control)
        {
            try
            {
                OnOpenPanel(control);
                var window = LiquidSlideWindow.Current ?? throw new InvalidOperationException("面板尚未就绪，请稍后重试。");
                window.ApplyPreset(control.Tag);
            }
            catch (Exception error) { MessageBox.Show(error.Message, "LiquidSlide", MessageBoxButtons.OK, MessageBoxIcon.Information); }
        }

        public void OnAbout(Office.IRibbonControl control)
        {
            OnOpenPanel(control);
            LiquidSlideWindow.Current?.ShowAbout();
        }

        public void CTPFactoryAvailable(Microsoft.Office.Core.ICTPFactory CTPFactoryInst)
        {
            taskPane = CTPFactoryInst.CreateCTP("LiquidSlide.TaskPaneControl", "LiquidSlide", Type.Missing);
            taskPane.DockPosition = Microsoft.Office.Core.MsoCTPDockPosition.msoCTPDockPositionRight;
            taskPane.Width = 420;
            taskPane.VisibleStateChange += PaneVisibilityChanged;
            taskPane.Visible = true;
        }

        private void PaneVisibilityChanged(Office.CustomTaskPane pane)
        {
            LiquidSlideWindow.Current?.SetPaneVisible(pane.Visible);
        }

        public void OnDisconnection(ext_DisconnectMode RemoveMode, ref Array custom)
        {
            if (taskPane != null)
            {
                taskPane.VisibleStateChange -= PaneVisibilityChanged;
                LiquidSlideWindow.Current?.SetPaneVisible(false);
                taskPane.Delete();
                Marshal.FinalReleaseComObject(taskPane);
                taskPane = null;
            }
            if (application != null) Marshal.FinalReleaseComObject(application);
            application = null;
            CurrentApplication = null;
        }

        public void OnAddInsUpdate(ref Array custom) { }
        public void OnStartupComplete(ref Array custom) { }
        public void OnBeginShutdown(ref Array custom) { }
    }
}
