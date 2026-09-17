using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Windows.Forms;

namespace LiquidSlide.ComAddin
{
    internal sealed class RibbonImages : AxHost
    {
        private RibbonImages() : base("") { }
        private const int RibbonImageSize = 64;
        private static readonly Dictionary<string, object> pictures = new Dictionary<string, object>();
        // Office retains the picture callbacks; keep the bitmaps alive for the add-in lifetime.
        private static readonly List<Bitmap> bitmaps = new List<Bitmap>();

        internal static object Get(string material)
        {
            if (string.IsNullOrEmpty(material)) material = "panel";
            if (pictures.TryGetValue(material, out var picture)) return picture;
            if (material == "shadow" || material == "outline")
            {
                var bitmap = CreateActionIcon(material);
                bitmaps.Add(bitmap);
                picture = GetIPictureDispFromPicture(bitmap);
                pictures[material] = picture;
                return picture;
            }
            using (var stream = typeof(RibbonImages).Assembly.GetManifestResourceStream("LiquidSlide.Icons." + material + ".png"))
            {
                if (stream == null) throw new InvalidOperationException("Missing Ribbon icon: " + material);
                using (var source = Image.FromStream(stream))
                {
                    // Give Office a 2x source so its 32px large-button rendering stays sharp.
                    var bitmap = new Bitmap(RibbonImageSize, RibbonImageSize, PixelFormat.Format32bppArgb);
                    using (var graphics = Graphics.FromImage(bitmap))
                    using (var attributes = new ImageAttributes())
                    {
                        graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                        attributes.SetWrapMode(WrapMode.TileFlipXY);
                        // Preserve proportions, alpha and a one-pixel outer safety margin.
                        var scale = Math.Min((RibbonImageSize - 4f) / source.Width, (RibbonImageSize - 4f) / source.Height);
                        var width = Math.Max(1, (int)Math.Round(source.Width * scale));
                        var height = Math.Max(1, (int)Math.Round(source.Height * scale));
                        var bounds = new Rectangle((RibbonImageSize - width) / 2, (RibbonImageSize - height) / 2, width, height);
                        graphics.DrawImage(source, bounds, 0, 0, source.Width, source.Height, GraphicsUnit.Pixel, attributes);
                    }
                    bitmaps.Add(bitmap);
                    picture = GetIPictureDispFromPicture(bitmap);
                    pictures[material] = picture;
                    return picture;
                }
            }
        }

        private static Bitmap CreateActionIcon(string material)
        {
            var bitmap = new Bitmap(RibbonImageSize, RibbonImageSize, PixelFormat.Format32bppArgb);
            using (var graphics = Graphics.FromImage(bitmap))
            using (var pen = new Pen(Color.FromArgb(255, 110, 105, 159), 1.4f))
            {
                // Draw the same 24/28-unit geometry as the task-pane SVG at 2x.
                graphics.ScaleTransform(2f, 2f);
                graphics.SmoothingMode = SmoothingMode.AntiAlias;
                graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                if (material == "shadow")
                {
                    graphics.TranslateTransform(2, 2);
                    using (var shadow = new SolidBrush(Color.FromArgb(20, 110, 105, 159)))
                    using (var shadowPath = RoundedRectangle(new Rectangle(7, 10, 17, 13), 4))
                        graphics.FillPath(shadow, shadowPath);
                    using (var middle = new SolidBrush(Color.FromArgb(36, 110, 105, 159)))
                    using (var middlePath = RoundedRectangle(new Rectangle(6, 9, 17, 13), 4))
                        graphics.FillPath(middle, middlePath);
                    using (var fill = new SolidBrush(Color.FromArgb(255, 240, 241, 255)))
                    using (var fillPath = RoundedRectangle(new Rectangle(4, 5, 17, 13), 4))
                    {
                        graphics.FillPath(fill, fillPath);
                        graphics.DrawPath(pen, fillPath);
                    }
                }
                else
                {
                    graphics.TranslateTransform(4, 4);
                    using (var outlinePen = new Pen(Color.FromArgb(110, 105, 159), 1.5f))
                    using (var outlinePath = RoundedRectangle(new Rectangle(5, 5, 14, 14), 4))
                    {
                        outlinePen.DashStyle = DashStyle.Custom;
                        outlinePen.DashPattern = new[] { 3f, 2f };
                        graphics.DrawPath(outlinePen, outlinePath);
                    }
                    using (var slash = new Pen(Color.FromArgb(255, 110, 105, 159), 1.5f))
                    {
                        slash.StartCap = LineCap.Round;
                        slash.EndCap = LineCap.Round;
                        graphics.DrawLine(slash, 3, 21, 21, 3);
                    }
                }
            }
            return bitmap;
        }

        private static GraphicsPath RoundedRectangle(Rectangle rectangle, int radius)
        {
            var diameter = radius * 2;
            var path = new GraphicsPath();
            path.AddArc(rectangle.X, rectangle.Y, diameter, diameter, 180, 90);
            path.AddArc(rectangle.Right - diameter, rectangle.Y, diameter, diameter, 270, 90);
            path.AddArc(rectangle.Right - diameter, rectangle.Bottom - diameter, diameter, diameter, 0, 90);
            path.AddArc(rectangle.X, rectangle.Bottom - diameter, diameter, diameter, 90, 90);
            path.CloseFigure();
            return path;
        }
    }
}
