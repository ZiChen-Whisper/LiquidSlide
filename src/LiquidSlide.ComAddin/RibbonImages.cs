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
        private static readonly Dictionary<string, object> pictures = new Dictionary<string, object>();
        // Office retains the picture callbacks; keep the bitmaps alive for the add-in lifetime.
        private static readonly List<Bitmap> bitmaps = new List<Bitmap>();

        internal static object Get(string material)
        {
            if (string.IsNullOrEmpty(material)) material = "panel";
            if (pictures.TryGetValue(material, out var picture)) return picture;
            using (var stream = typeof(RibbonImages).Assembly.GetManifestResourceStream("LiquidSlide.Icons." + material + ".png"))
            {
                if (stream == null) throw new InvalidOperationException("Missing Ribbon icon: " + material);
                using (var source = Image.FromStream(stream))
                {
                    var bitmap = new Bitmap(32, 32, PixelFormat.Format32bppArgb);
                    using (var graphics = Graphics.FromImage(bitmap))
                    using (var attributes = new ImageAttributes())
                    {
                        graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                        attributes.SetWrapMode(WrapMode.TileFlipXY);
                        // Preserve proportions, alpha and a one-pixel outer safety margin.
                        var scale = Math.Min(30f / source.Width, 30f / source.Height);
                        var width = Math.Max(1, (int)Math.Round(source.Width * scale));
                        var height = Math.Max(1, (int)Math.Round(source.Height * scale));
                        var bounds = new Rectangle((32 - width) / 2, (32 - height) / 2, width, height);
                        graphics.DrawImage(source, bounds, 0, 0, source.Width, source.Height, GraphicsUnit.Pixel, attributes);
                    }
                    bitmaps.Add(bitmap);
                    picture = GetIPictureDispFromPicture(bitmap);
                    pictures[material] = picture;
                    return picture;
                }
            }
        }
    }
}
