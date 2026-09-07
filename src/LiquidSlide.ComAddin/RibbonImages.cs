using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace LiquidSlide.ComAddin
{
    internal sealed class RibbonImages : AxHost
    {
        private RibbonImages() : base("") { }
        private static readonly Dictionary<string, object> pictures = new Dictionary<string, object>();
        // Keep source bitmaps alive for the lifetime of Office's picture callbacks.
        private static readonly List<Bitmap> bitmaps = new List<Bitmap>();

        internal static object Get(string material)
        {
            material = material ?? "panel";
            if (pictures.TryGetValue(material, out var picture)) return picture;
            var bitmap = new Bitmap(32, 32);
            using (var graphics = Graphics.FromImage(bitmap))
            {
                graphics.SmoothingMode = SmoothingMode.AntiAlias;
                using (var background = new LinearGradientBrush(new Rectangle(2, 2, 28, 28), Color.FromArgb(94, 133, 232), Color.FromArgb(183, 151, 233), 45f))
                using (var outline = new Pen(Color.FromArgb(82, 81, 151), 1f))
                {
                    graphics.FillEllipse(background, 2, 2, 28, 28);
                    var tint = material == "black" ? Color.FromArgb(220, 34, 37, 64)
                        : material == "white" ? Color.FromArgb(235, 255, 255, 255)
                        : material == "frost" ? Color.FromArgb(185, 241, 240, 255)
                        : Color.FromArgb(85, 255, 255, 255);
                    using (var glass = new SolidBrush(tint))
                    using (var edge = new Pen(Color.FromArgb(245, 255, 255, 255), 1.5f))
                    using (var path = new GraphicsPath())
                    {
                        path.AddArc(5, 5, 10, 10, 180, 90); path.AddArc(17, 5, 10, 10, 270, 90);
                        path.AddArc(17, 17, 10, 10, 0, 90); path.AddArc(5, 17, 10, 10, 90, 90); path.CloseFigure();
                        graphics.FillPath(glass, path); graphics.DrawPath(edge, path);
                    }
                    if (material == "panel" || material == "")
                    {
                        graphics.DrawLine(outline, 18, 7, 18, 25);
                        graphics.DrawLine(outline, 21, 11, 24, 11);
                        graphics.DrawLine(outline, 21, 15, 24, 15);
                        graphics.DrawLine(outline, 21, 19, 24, 19);
                    }
                    if (material == "frost")
                        for (var x = 10; x <= 22; x += 4) graphics.DrawLine(outline, x, 13, x, 19);
                }
            }
            bitmaps.Add(bitmap);
            picture = GetIPictureDispFromPicture(bitmap);
            pictures[material] = picture;
            return picture;
        }
    }
}
