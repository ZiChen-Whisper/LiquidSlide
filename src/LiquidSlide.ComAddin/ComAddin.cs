using System;
using System.Runtime.InteropServices;
using Extensibility;
using PowerPoint = Microsoft.Office.Interop.PowerPoint;

namespace LiquidSlide.ComAddin
{
    [ComVisible(true)]
    [Guid(AddInGuid)]
    [ProgId(ProgId)]
    [ClassInterface(ClassInterfaceType.None)]
    public sealed class ComAddin : IDTExtensibility2, Microsoft.Office.Core.ICustomTaskPaneConsumer
    {
        public const string AddInGuid = "D8097CA2-70BA-4CB0-9D87-2F8917898D6E";
        public const string ProgId = "LiquidSlide.PowerPointAddin";

        private PowerPoint.Application application;
        internal static PowerPoint.Application CurrentApplication { get; private set; }
        private Microsoft.Office.Core.CustomTaskPane taskPane;
        private Microsoft.Office.Core.CommandBarButton openButton;

        public void OnConnection(object Application, ext_ConnectMode ConnectMode, object AddInInst, ref Array custom)
        {
            application = (PowerPoint.Application)Application;
            CurrentApplication = application;
            CreateCommandButton();
        }

        private void CreateCommandButton()
        {
            var toolbar = application.CommandBars.Add("LiquidSlide", Microsoft.Office.Core.MsoBarPosition.msoBarTop, Type.Missing, true);
            openButton = (Microsoft.Office.Core.CommandBarButton)toolbar.Controls.Add(Microsoft.Office.Core.MsoControlType.msoControlButton, Type.Missing, Type.Missing, Type.Missing, true);
            openButton.Caption = "LiquidSlide";
            openButton.Style = Microsoft.Office.Core.MsoButtonStyle.msoButtonCaption;
            openButton.TooltipText = "Open the LiquidSlide panel";
            openButton.Click += OpenButtonOnClick;
            toolbar.Visible = true;
        }

        private void OpenButtonOnClick(Microsoft.Office.Core.CommandBarButton control, ref bool cancelDefault)
        {
            if (taskPane != null) taskPane.Visible = !taskPane.Visible;
        }

        public void CTPFactoryAvailable(Microsoft.Office.Core.ICTPFactory CTPFactoryInst)
        {
            taskPane = CTPFactoryInst.CreateCTP("LiquidSlide.TaskPaneControl", "LiquidSlide", Type.Missing);
            taskPane.DockPosition = Microsoft.Office.Core.MsoCTPDockPosition.msoCTPDockPositionRight;
            taskPane.Width = 420;
            taskPane.Visible = true;
        }

        public void OnDisconnection(ext_DisconnectMode RemoveMode, ref Array custom)
        {
            if (taskPane != null)
            {
                taskPane.Delete();
                Marshal.FinalReleaseComObject(taskPane);
                taskPane = null;
            }
            if (openButton != null)
            {
                Marshal.FinalReleaseComObject(openButton);
                openButton = null;
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
