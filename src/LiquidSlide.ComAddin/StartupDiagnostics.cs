using System;
using System.IO;
using System.Reflection;

namespace LiquidSlide.ComAddin
{
    // BCL only: diagnostics must not depend on Office or WebView2 loading first.
    internal static class StartupDiagnostics
    {
        internal static void Initialize()
        {
            AppDomain.CurrentDomain.AssemblyResolve += Resolve;
            Write("Startup; assembly=" + typeof(StartupDiagnostics).Assembly.FullName
                + "; location=" + typeof(StartupDiagnostics).Assembly.Location
                + "; base=" + AppDomain.CurrentDomain.BaseDirectory);
        }

        private static Assembly Resolve(object sender, ResolveEventArgs args)
        {
            // Never redirect unrelated Office/add-in binds or probe the current directory.
            var requested = new AssemblyName(args.Name);
            if (requested.Name != "Microsoft.Web.WebView2.Core"
                && requested.Name != "Microsoft.Web.WebView2.WinForms") return null;
            if (args.RequestingAssembly == null) return null;
            var requester = args.RequestingAssembly.GetName().Name;
            if (requester != "LiquidSlide.ComAddin" && requester != "Microsoft.Web.WebView2.WinForms") return null;
            try
            {
                var path = Path.Combine(Path.GetDirectoryName(typeof(StartupDiagnostics).Assembly.Location), requested.Name + ".dll");
                var actual = AssemblyName.GetAssemblyName(path);
                if (!string.Equals(actual.FullName, requested.FullName, StringComparison.OrdinalIgnoreCase))
                {
                    Write("Resolve identity mismatch: " + args.Name + "; found=" + actual.FullName);
                    return null;
                }
                Write("Resolve: " + args.Name + "; path=" + path);
                return Assembly.LoadFrom(path);
            }
            catch (Exception error) { Write("Resolve failed: " + args.Name, error); return null; }
        }

        internal static void Write(string stage, Exception error = null)
        {
            try
            {
                var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "LiquidSlide", "logs");
                Directory.CreateDirectory(directory);
                var path = Path.Combine(directory, "startup-" + System.Diagnostics.Process.GetCurrentProcess().Id + ".log");
                File.AppendAllText(path, DateTime.UtcNow.ToString("o") + " " + stage
                    + (error == null ? "" : Environment.NewLine + error) + Environment.NewLine);
            }
            catch { /* Logging failure must never prevent activation. */ }
        }
    }
}
