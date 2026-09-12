using System;
using System.Collections.Generic;
using System.Diagnostics;
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

        private sealed class WindowPane
        {
            internal int WindowId;
            internal PowerPoint.DocumentWindow Owner;
            internal Office.CustomTaskPane Pane;
            internal LiquidSlideWindow Control;
        }

        private PowerPoint.Application application;
        internal static PowerPoint.Application CurrentApplication { get; private set; }
        private Office.ICTPFactory factory;
        private bool disconnecting;
        private readonly WindowPaneRegistry<WindowPane> panes;

        static ComAddin() { StartupDiagnostics.Initialize(); }

        public ComAddin()
        {
            StartupDiagnostics.Write("ComAddin constructor entered");
            try { panes = new WindowPaneRegistry<WindowPane>(IsAlive, ReleasePane); }
            catch (Exception error) { StartupDiagnostics.Write("ComAddin constructor failed", error); throw; }
            StartupDiagnostics.Write("ComAddin constructor completed");
        }

        public void OnConnection(object Application, ext_ConnectMode ConnectMode, object AddInInst, ref Array custom)
        {
            StartupDiagnostics.Write("OnConnection entered");
            try
            {
                disconnecting = false;
                application = (PowerPoint.Application)Application;
                CurrentApplication = application;
                application.WindowActivate += WindowActivated;
                application.WindowDeactivate += WindowDeactivated;
                application.PresentationClose += PresentationClosed;
                StartupDiagnostics.Write("OnConnection completed");
            }
            catch (Exception error) { StartupDiagnostics.Write("OnConnection failed", error); throw; }
        }

        public string GetCustomUI(string ribbonId)
        {
            using (var stream = typeof(ComAddin).Assembly.GetManifestResourceStream("LiquidSlide.Ribbon.xml"))
            using (var reader = new System.IO.StreamReader(stream)) return reader.ReadToEnd();
        }

        public object GetRibbonImage(Office.IRibbonControl control) => RibbonImages.Get(control.Tag);

        public void OnOpenPanel(Office.IRibbonControl control)
        {
            try { OpenPane(CommandWindow(control)); }
            catch (Exception error) { ShowError(error); }
        }

        public void OnApplyPreset(Office.IRibbonControl control)
        {
            try
            {
                PruneClosedWindows();
                var entry = EnsurePane(CommandWindow(control));
                UpdateActivity();
                entry.Control.ApplyPreset(control.Tag);
            }
            catch (Exception error) { ShowError(error); }
        }

        public void OnAbout(Office.IRibbonControl control) { AboutWindow.ShowAbout(); }

        private PowerPoint.DocumentWindow CommandWindow(Office.IRibbonControl control)
        {
            var window = control?.Context as PowerPoint.DocumentWindow ?? application?.ActiveWindow;
            if (window == null) throw new InvalidOperationException("请先打开一个 PowerPoint 编辑窗口。");
            return window;
        }

        private WindowPane OpenPane(PowerPoint.DocumentWindow window)
        {
            PruneClosedWindows();
            var entry = EnsurePane(window);
            try { entry.Pane.Visible = true; }
            catch (Exception error) when (error is COMException || error is InvalidComObjectException)
            {
                // Office may invalidate a pane after our liveness check. Recreate only that pane.
                panes.Remove(entry.WindowId);
                entry = EnsurePane(window);
                entry.Pane.Visible = true;
            }
            UpdateActivity();
            entry.Control.SetPaneVisible(true);
            return entry;
        }

        private WindowPane EnsurePane(PowerPoint.DocumentWindow window)
        {
            if (factory == null || disconnecting) throw new InvalidOperationException("面板尚未就绪，请稍后重试。");
            var windowId = window.HWND;
            return panes.GetOrCreate(windowId, () =>
            {
                var entry = new WindowPane { WindowId = windowId, Owner = window };
                try
                {
                    // Explicit parent: omitting it binds permanently to whichever window was active.
                    entry.Pane = factory.CreateCTP("LiquidSlide.TaskPaneControl", "LiquidSlide", window);
                    entry.Control = entry.Pane.ContentControl as LiquidSlideWindow
                        ?? throw new InvalidOperationException("无法初始化 LiquidSlide 面板控件。");
                    entry.Control.Bind(application, windowId);
                    entry.Pane.DockPosition = Office.MsoCTPDockPosition.msoCTPDockPositionRight;
                    entry.Pane.Width = 420;
                    entry.Pane.VisibleStateChange += PaneVisibilityChanged;
                    entry.Control.Disposed += (_, __) =>
                    {
                        if (panes.TryGet(windowId, out var current) && ReferenceEquals(current, entry)) panes.Remove(windowId);
                    };
                    entry.Pane.Visible = false;
                    entry.Control.SetPaneVisible(false);
                    return entry;
                }
                catch { ReleasePane(entry); throw; }
            });
        }

        public void CTPFactoryAvailable(Office.ICTPFactory CTPFactoryInst)
        {
            factory = CTPFactoryInst;
            RefreshActiveWindow();
        }

        private void WindowActivated(PowerPoint.Presentation presentation, PowerPoint.DocumentWindow window)
        {
            if (disconnecting || factory == null) return;
            try
            {
                PruneClosedWindows();
                UpdateActivity();
            }
            catch (Exception error) { Debug.WriteLine("LiquidSlide window activation: " + error.Message); }
        }

        private void WindowDeactivated(PowerPoint.Presentation presentation, PowerPoint.DocumentWindow window)
        {
            try { if (panes.TryGet(window.HWND, out var entry)) entry.Control.SetWindowActive(false); }
            catch (Exception error) when (error is COMException || error is InvalidComObjectException) { }
        }

        private void PresentationClosed(PowerPoint.Presentation presentation)
        {
            panes.RemoveWhere((_, entry) =>
            {
                try { return Equals(entry.Owner.Presentation, presentation); }
                catch (Exception error) when (error is COMException || error is InvalidComObjectException) { return true; }
            });
        }

        private void UpdateActivity()
        {
            var activeId = application?.ActiveWindow?.HWND ?? 0;
            foreach (var pair in panes.Snapshot()) pair.Value.Control.SetWindowActive(pair.Key == activeId);
        }

        private void PaneVisibilityChanged(Office.CustomTaskPane pane)
        {
            foreach (var pair in panes.Snapshot())
            {
                if (!Equals(pair.Value.Pane, pane)) continue;
                try { pair.Value.Control.SetPaneVisible(pane.Visible); }
                catch (Exception error) when (error is COMException || error is InvalidComObjectException) { panes.Remove(pair.Key); }
                break;
            }
        }

        private void PruneClosedWindows()
        {
            var liveWindows = new HashSet<int>();
            // If Office is busy, don't prune from an incomplete inventory.
            foreach (PowerPoint.DocumentWindow window in application.Windows) liveWindows.Add(window.HWND);
            panes.RemoveWhere((id, entry) => !liveWindows.Contains(id) || !IsAlive(entry));
        }

        private static bool IsAlive(WindowPane entry)
        {
            if (entry.Control == null || entry.Control.IsDisposed || entry.Pane == null) return false;
            try { var visible = entry.Pane.Visible; return entry.Owner.HWND == entry.WindowId; }
            catch (Exception error) when (error is COMException || error is InvalidComObjectException) { return false; }
        }

        private void ReleasePane(WindowPane entry)
        {
            entry.Control?.SetWindowActive(false);
            if (entry.Pane != null)
            {
                try { entry.Pane.VisibleStateChange -= PaneVisibilityChanged; } catch (Exception error) when (error is COMException || error is InvalidComObjectException) { }
                try { entry.Pane.Delete(); } catch (Exception error) when (error is COMException || error is InvalidComObjectException) { } // Already deleted by Office is normal on close.
                try { if (Marshal.IsComObject(entry.Pane)) Marshal.ReleaseComObject(entry.Pane); }
                catch (InvalidComObjectException) { }
                entry.Pane = null;
            }
            if (entry.Control != null && !entry.Control.IsDisposed) entry.Control.Dispose();
        }

        private void RefreshActiveWindow()
        {
            if (disconnecting || factory == null || application == null) return;
            try { var window = application.ActiveWindow; if (window != null) WindowActivated(window.Presentation, window); }
            catch (Exception error) when (error is COMException || error is InvalidComObjectException) { } // Startup can run before any document window exists.
        }

        private static void ShowError(Exception error) => MessageBox.Show(error.Message, "LiquidSlide", MessageBoxButtons.OK, MessageBoxIcon.Information);

        public void OnDisconnection(ext_DisconnectMode RemoveMode, ref Array custom)
        {
            disconnecting = true;
            if (application != null)
            {
                try { application.WindowActivate -= WindowActivated; } catch (Exception error) when (error is COMException || error is InvalidComObjectException) { }
                try { application.WindowDeactivate -= WindowDeactivated; } catch (Exception error) when (error is COMException || error is InvalidComObjectException) { }
                try { application.PresentationClose -= PresentationClosed; } catch (Exception error) when (error is COMException || error is InvalidComObjectException) { }
            }
            panes.Clear();
            factory = null;
            application = null;
            CurrentApplication = null;
        }

        public void OnAddInsUpdate(ref Array custom) { }
        public void OnStartupComplete(ref Array custom) { RefreshActiveWindow(); }
        public void OnBeginShutdown(ref Array custom) { }
    }
}
