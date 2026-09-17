using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Text;
using System.Xml;
using Office = Microsoft.Office.Core;
using PowerPoint = Microsoft.Office.Interop.PowerPoint;

namespace LiquidSlide.ComAddin
{
    internal sealed class PowerPointBridge
    {
        private const string TagPrefix = "LIQUIDSLIDE_SETTINGS_V1_";
        private readonly PowerPoint.Application application;
        private readonly int ownerWindowId;
        private readonly JavaScriptSerializer serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        private readonly Dictionary<PowerPoint.Presentation, string> presentationIds = new Dictionary<PowerPoint.Presentation, string>();

        private string maskKey;
        private string maskImage;

        private string GeometryKey(PowerPoint.Shape shape)
        {
            var adjustments = new List<float>();
            if (shape.Type == Office.MsoShapeType.msoAutoShape)
                for (var index = 1; index <= shape.Adjustments.Count; index++) adjustments.Add(shape.Adjustments[index]);
            var nodes = new List<float>();
            if (shape.Type == Office.MsoShapeType.msoFreeform)
            {
                for (var index = 1; index <= shape.Nodes.Count; index++)
                {
                    var points = (Array)shape.Nodes[index].Points;
                    foreach (var coordinate in points) nodes.Add(Convert.ToSingle(coordinate, CultureInfo.InvariantCulture));
                    nodes.Add((float)shape.Nodes[index].SegmentType);
                }
            }
            return serializer.Serialize(new { shape.Type, shape.Width, shape.Height, shape.HorizontalFlip, shape.VerticalFlip,
                kind = shape.Type == Office.MsoShapeType.msoAutoShape ? (int)shape.AutoShapeType : 0, adjustments, nodes });
        }

        private string CachedMask(PowerPoint.Shape shape)
        {
            var key = GeometryKey(shape);
            if (key != maskKey)
            {
                var image = ExportMask(shape);
                maskKey = key;
                maskImage = image;
            }
            return maskImage;
        }

        private string PresentationId(PowerPoint.Presentation presentation)
        {
            if (!presentationIds.TryGetValue(presentation, out var id))
                presentationIds[presentation] = id = Guid.NewGuid().ToString("N");
            return id;
        }

        public PowerPointBridge(PowerPoint.Application application, int ownerWindowId)
        {
            if (ownerWindowId == 0) throw new ArgumentException("必须指定面板所属窗口。", nameof(ownerWindowId));
            this.application = application;
            this.ownerWindowId = ownerWindowId;
        }

        internal bool IsOwnerActive
        {
            get
            {
                try { return application.ActiveWindow != null && application.ActiveWindow.HWND == ownerWindowId; }
                catch (Exception error) when (error is COMException || error is InvalidComObjectException) { return false; }
            }
        }

        private PowerPoint.DocumentWindow RequireWindow()
        {
            var window = application.ActiveWindow ?? throw new InvalidOperationException("没有活动的 PowerPoint 编辑窗口。");
            if (window.HWND != ownerWindowId)
                throw new InvalidOperationException("PowerPoint 窗口已切换，操作已停止。请回到此面板所属的窗口重试。");
            return window;
        }

        public string SelectionFingerprint()
        {
            var window = RequireWindow();
            var presentation = window.Presentation;
            var selection = window.Selection;
            if (selection == null || selection.Type != PowerPoint.PpSelectionType.ppSelectionShapes || selection.ShapeRange.Count != 1)
                return "no-selection";
            var shape = selection.ShapeRange[1];
            var slide = (PowerPoint.Slide)window.View.Slide;
            float? adjustment = null;
            if (shape.Type == Office.MsoShapeType.msoAutoShape && shape.Adjustments.Count > 0) adjustment = shape.Adjustments[1];
            return serializer.Serialize(new {
                document = PresentationId(presentation), slide = slide.SlideID, id = shape.Id,
                shape.Left, shape.Top, shape.Width, shape.Height, shape.Rotation, shape.ZOrderPosition,
                geometry = GeometryKey(shape),
                type = shape.Type, autoShape = shape.Type == Office.MsoShapeType.msoAutoShape ? (int)shape.AutoShapeType : 0, adjustment,
                slideWidth = presentation.PageSetup.SlideWidth, slideHeight = presentation.PageSetup.SlideHeight
            });
        }

        public object InspectSelection()
        {
            var window = RequireWindow();
            var presentation = window.Presentation;
            var view = window.View;
            var selection = window.Selection;
            if (selection == null || selection.Type != PowerPoint.PpSelectionType.ppSelectionShapes || selection.ShapeRange.Count != 1)
                throw new InvalidOperationException("请只选择一个自选图形或自由曲线图形。");

            PowerPoint.Shape shape = selection.ShapeRange[1];
            if (shape.Type != Office.MsoShapeType.msoAutoShape && shape.Type != Office.MsoShapeType.msoFreeform)
                throw new InvalidOperationException("请选择可填充的自选图形或自由曲线；组合、图片、表格和线条请先转换为图形。");
            if (shape.Width <= 0 || shape.Height <= 0) throw new InvalidOperationException("请选择具有有效面积的图形。");
            var isCircle = shape.Type == Office.MsoShapeType.msoAutoShape && shape.AutoShapeType == Office.MsoAutoShapeType.msoShapeOval
                && Math.Abs(shape.Width - shape.Height) / Math.Max(shape.Width, shape.Height) <= 0.01;
            var isRounded = shape.Type == Office.MsoShapeType.msoAutoShape && shape.AutoShapeType == Office.MsoAutoShapeType.msoShapeRoundedRectangle;
            var slide = (PowerPoint.Slide)view.Slide;
            float? adjustment = null;
            try { if (shape.Adjustments.Count > 0) adjustment = shape.Adjustments[1]; } catch (COMException) { }
            var savedSettingsJson = ReadSettings(shape.Tags);
            object savedSettings = savedSettingsJson == null ? null : serializer.DeserializeObject(savedSettingsJson);
            return new
            {
                shape = new
                {
                    shapeMode = isCircle ? "circle" : isRounded ? "roundedRectangle" : "custom",
                    maskBase64 = !isCircle && !isRounded ? CachedMask(shape) : null,
                    presentationId = PresentationId(presentation),
                    id = shape.Id.ToString(CultureInfo.InvariantCulture),
                    slideId = slide.SlideID.ToString(CultureInfo.InvariantCulture),
                    left = shape.Left,
                    top = shape.Top,
                    width = shape.Width,
                    height = shape.Height,
                    rotation = shape.Rotation,
                    zOrder = shape.ZOrderPosition,
                    adjustment,
                    slideWidth = presentation.PageSetup.SlideWidth,
                    slideHeight = presentation.PageSetup.SlideHeight
                },
                savedSettings
            };
        }

        // Export a temporary, unrotated silhouette; never alter the original material.
        private string ExportMask(PowerPoint.Shape original)
        {
            PowerPoint.Shape copy = null;
            PowerPoint.Shape frame = null;
            PowerPoint.Shape group = null;
            var path = Path.Combine(Path.GetTempPath(), $"LiquidSlide-mask-{Guid.NewGuid():N}.svg");
            try
            {
                copy = original.Duplicate()[1];
                copy.Rotation = 0;
                copy.Visible = Office.MsoTriState.msoTrue;
                copy.Line.Visible = Office.MsoTriState.msoFalse;
                copy.Shadow.Visible = Office.MsoTriState.msoFalse;
                copy.Glow.Radius = 0;
                copy.SoftEdge.Radius = 0;
                copy.ThreeD.Visible = Office.MsoTriState.msoFalse;
                copy.ThreeD.BevelTopType = Office.MsoBevelType.msoBevelNone;
                copy.ThreeD.BevelBottomType = Office.MsoBevelType.msoBevelNone;
                copy.Reflection.Type = Office.MsoReflectionType.msoReflectionTypeNone;
                if (copy.HasTextFrame == Office.MsoTriState.msoTrue) copy.TextFrame.TextRange.Text = "";
                copy.Fill.Solid();
                copy.Fill.ForeColor.RGB = 0xFFFFFF;
                copy.Fill.Transparency = 0;
                copy.Fill.Visible = Office.MsoTriState.msoTrue;
                // A uniquely colored rectangle carries the original local coordinate frame.
                // Read its vector coordinates, never infer bounds from raster alpha.
                // This also preserves empty margins in partial/open shape geometries.
                var slide = (PowerPoint.Slide)RequireWindow().View.Slide;
                frame = slide.Shapes.AddShape(Office.MsoAutoShapeType.msoShapeRectangle,
                    copy.Left, copy.Top, copy.Width, copy.Height);
                frame.Line.Visible = Office.MsoTriState.msoFalse;
                frame.Shadow.Visible = Office.MsoTriState.msoFalse;
                frame.Glow.Radius = 0;
                frame.SoftEdge.Radius = 0;
                frame.ThreeD.Visible = Office.MsoTriState.msoFalse;
                frame.Reflection.Type = Office.MsoReflectionType.msoReflectionTypeNone;
                frame.Fill.Solid();
                frame.Fill.ForeColor.RGB = 0x030201; // Office BGR: SVG #010203
                frame.Fill.Transparency = 0;
                frame.ZOrder(Office.MsoZOrderCmd.msoSendToBack);
                group = slide.Shapes.Range(new object[] { frame.Name, copy.Name }).Group();
                // SVG describes the geometry independently of raster export padding,
                // display DPI, antialiasing and residual Office shadow pixels.
                group.Export(path, (PowerPoint.PpShapeFormat)6);
                return NormalizeCalibratedSvg(path, original.Width, original.Height);
            }
            finally
            {
                try
                {
                    if (group != null) group.Delete();
                    else
                    {
                        try { if (copy != null) copy.Delete(); }
                        finally { if (frame != null) frame.Delete(); }
                    }
                }
                finally
                {
                    try { original.Select(Office.MsoTriState.msoTrue); }
                    finally { if (File.Exists(path)) File.Delete(path); }
                }
            }
        }

        private static string NormalizeCalibratedSvg(string path, float widthPoints, float heightPoints)
        {
            var document = new XmlDocument { XmlResolver = null };
            document.Load(path);
            var ns = new XmlNamespaceManager(document.NameTable);
            ns.AddNamespace("svg", "http://www.w3.org/2000/svg");
            // Ignore filtered duplicates: Office can export a theme shadow even after
            // Shadow.Visible=false. Shadows must never define the optical contour.
            var filtered = document.SelectNodes("//*[@filter]");
            foreach (XmlNode node in filtered) node.ParentNode.RemoveChild(node);
            XmlElement frame = null;
            foreach (XmlElement rect in document.SelectNodes("//svg:rect[@fill]", ns))
                if (string.Equals(rect.GetAttribute("fill"), "#010203", StringComparison.OrdinalIgnoreCase))
                {
                    if (frame != null) throw new InvalidOperationException("图形矢量坐标框不唯一，请重新应用。");
                    frame = rect;
                }
            if (frame == null) throw new InvalidOperationException("未读取到 PowerPoint 矢量坐标框，请确认当前 Office 支持 SVG 图形导出。");
            var body = frame.ParentNode as XmlElement;
            // Office puts the calibration rectangle and the shape in one exported
            // group. Reject an unexpected structure rather than silently stretching it.
            if (body == null || body.LocalName != "g" || frame.HasAttribute("transform"))
                throw new InvalidOperationException("PowerPoint 返回了无法校准的矢量坐标，请重新选择图形。");
            var x = ReadSvgNumber(frame, "x", 0);
            var y = ReadSvgNumber(frame, "y", 0);
            var width = ReadSvgNumber(frame, "width", 0);
            var height = ReadSvgNumber(frame, "height", 0);
            if (width <= 0 || height <= 0) throw new InvalidOperationException("图形矢量坐标框没有有效面积。");
            body.RemoveChild(frame);
            if (body.SelectNodes(".//svg:path | .//svg:rect | .//svg:circle | .//svg:ellipse | .//svg:polygon", ns).Count == 0)
                throw new InvalidOperationException("PowerPoint 未导出可填充的矢量轮廓。");
            // The parent's transform positions the entire exported group on the
            // export canvas. Geometry inside it already uses the rectangle's space.
            body.RemoveAttribute("transform");
            body.RemoveAttribute("clip-path");
            var output = new XmlDocument { XmlResolver = null };
            var svg = output.CreateElement("svg", "http://www.w3.org/2000/svg");
            output.AppendChild(svg);
            svg.SetAttribute("viewBox", string.Join(" ", new[] {
                x.ToString("R", CultureInfo.InvariantCulture), y.ToString("R", CultureInfo.InvariantCulture),
                width.ToString("R", CultureInfo.InvariantCulture), height.ToString("R", CultureInfo.InvariantCulture) }));
            var scale = Math.Min(8d, 4096d / Math.Max(widthPoints, heightPoints));
            svg.SetAttribute("width", Math.Max(1, (int)Math.Ceiling(widthPoints * scale)).ToString(CultureInfo.InvariantCulture));
            svg.SetAttribute("height", Math.Max(1, (int)Math.Ceiling(heightPoints * scale)).ToString(CultureInfo.InvariantCulture));
            svg.SetAttribute("preserveAspectRatio", "none");
            var definitions = document.DocumentElement.SelectSingleNode("svg:defs", ns);
            if (definitions != null) svg.AppendChild(output.ImportNode(definitions, true));
            svg.AppendChild(output.ImportNode(body, true));
            return "data:image/svg+xml;base64," + Convert.ToBase64String(Encoding.UTF8.GetBytes(output.OuterXml));
        }

        private static double ReadSvgNumber(XmlElement element, string attribute, double fallback)
        {
            var value = element.GetAttribute(attribute);
            if (string.IsNullOrEmpty(value)) return fallback;
            if (!double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var number)
                || double.IsNaN(number) || double.IsInfinity(number))
                throw new InvalidOperationException("PowerPoint 返回了无效的矢量坐标。");
            return number;
        }

        public object CaptureBackground(IDictionary<string, object> payload)
        {
            ValidateTarget(payload);
            var presentation = RequirePresentation();
            var shapeId = ParseShapeId(payload);
            var slide = FindSlideForShape(shapeId, Convert.ToInt32(payload["slideId"], CultureInfo.InvariantCulture), out var shape);
            var tempPath = Path.Combine(Path.GetTempPath(), $"LiquidSlide-slide-{Guid.NewGuid():N}.png");
            var hidden = new List<KeyValuePair<PowerPoint.Shape, Office.MsoTriState>>();
            try
            {
                // ZOrderPosition is 1 at the back. Export only layers BELOW the target.
                var targetZ = shape.ZOrderPosition;
                foreach (PowerPoint.Shape layer in slide.Shapes)
                {
                    if (layer.ZOrderPosition < targetZ) continue;
                    hidden.Add(new KeyValuePair<PowerPoint.Shape, Office.MsoTriState>(layer, layer.Visible));
                    layer.Visible = Office.MsoTriState.msoFalse;
                }
                var width = 2560;
                var height = Math.Max(1, (int)Math.Round(width * presentation.PageSetup.SlideHeight / presentation.PageSetup.SlideWidth));
                slide.Export(tempPath, "PNG", width, height);
                return Convert.ToBase64String(File.ReadAllBytes(tempPath));
            }
            finally
            {
                // Attempt EVERY restoration even when one COM call fails.
                Exception restoreError = null;
                foreach (var layer in hidden)
                {
                    try { layer.Key.Visible = layer.Value; }
                    catch (Exception error) { restoreError = error; }
                }
                // PowerPoint clears the selection when its shape is hidden. Restore it
                // within this synchronous capture, before returning control to the user.
                try { shape.Select(Office.MsoTriState.msoTrue); }
                catch (Exception error) { restoreError = error; }
                if (File.Exists(tempPath)) File.Delete(tempPath);
                if (restoreError != null) throw new InvalidOperationException("恢复图层可见性失败，请检查幻灯片。", restoreError);
            }
        }

        public object ApplyFill(IDictionary<string, object> payload)
        {
            if (!ValidateTarget(payload, false)) return new { applied = false };
            var shapeId = ParseShapeId(payload);
            var pngBase64 = Convert.ToString(payload["pngBase64"], CultureInfo.InvariantCulture);
            var settings = payload["settings"];
            FindSlideForShape(shapeId, Convert.ToInt32(payload["slideId"], CultureInfo.InvariantCulture), out var shape);
            var tempPath = Path.Combine(Path.GetTempPath(), $"LiquidSlide-fill-{Guid.NewGuid():N}.png");
            try
            {
                File.WriteAllBytes(tempPath, Convert.FromBase64String(pngBase64));
                shape.Fill.UserPicture(tempPath);
                var values = (IDictionary<string, object>)settings;
                var brightness = values.TryGetValue("brightness", out var level) ? Convert.ToSingle(level, CultureInfo.InvariantCulture) : 0f;
                shape.PictureFormat.Brightness = Math.Max(0f, Math.Min(1f, 0.5f + brightness / 200f));
                WriteSettings(shape.Tags, serializer.Serialize(settings));
                return new { applied = true };
            }
            finally
            {
                if (File.Exists(tempPath)) File.Delete(tempPath);
            }
        }

        public object ApplyShadow(IDictionary<string, object> payload)
        {
            ValidateTarget(payload);
            FindSlideForShape(ParseShapeId(payload), Convert.ToInt32(payload["slideId"], CultureInfo.InvariantCulture), out var shape);
            ConfigureShadow(shape);
            return new { applied = true };
        }

        private static void ConfigureShadow(PowerPoint.Shape shape)
        {
            var shadow = shape.Shadow;
            shadow.Type = Office.MsoShadowType.msoShadow14;
            shadow.Style = Office.MsoShadowStyle.msoShadowStyleOuterShadow;
            shadow.ForeColor.RGB = 0;
            shadow.Transparency = 0.95f;
            shadow.Blur = 20f;
            shadow.Size = 1.02f;
            // Zero distance: both offsets are zero, irrespective of direction.
            shadow.OffsetX = 0f;
            shadow.OffsetY = 0f;
            shadow.Visible = Office.MsoTriState.msoTrue;
        }

        public object RemoveOutline(IDictionary<string, object> payload)
        {
            ValidateTarget(payload);
            FindSlideForShape(ParseShapeId(payload), Convert.ToInt32(payload["slideId"], CultureInfo.InvariantCulture), out var shape);
            shape.Line.Visible = Office.MsoTriState.msoFalse;
            return new { applied = true };
        }

        public object ApplyShadowToSelection()
        {
            ConfigureShadow(RequireSelectedShape());
            return new { applied = true };
        }

        public object RemoveOutlineFromSelection()
        {
            RequireSelectedShape().Line.Visible = Office.MsoTriState.msoFalse;
            return new { applied = true };
        }

        private PowerPoint.Shape RequireSelectedShape()
        {
            var window = RequireWindow();
            var selection = window.Selection;
            if (selection == null || selection.Type != PowerPoint.PpSelectionType.ppSelectionShapes || selection.ShapeRange.Count != 1)
                throw new InvalidOperationException("请只选择一个自选图形或自由曲线图形。");
            var shape = selection.ShapeRange[1];
            if (shape.Type != Office.MsoShapeType.msoAutoShape && shape.Type != Office.MsoShapeType.msoFreeform)
                throw new InvalidOperationException("请选择可填充的自选图形或自由曲线；组合、图片、表格和线条请先转换为图形。");
            if (shape.Width <= 0 || shape.Height <= 0) throw new InvalidOperationException("请选择具有有效面积的图形。");
            return shape;
        }

        // Never write an asynchronous frame to another document, selection or geometry.
        private bool ValidateTarget(IDictionary<string, object> payload, bool throwOnChange = true)
        {
            var current = serializer.DeserializeObject(serializer.Serialize(InspectSelection())) as IDictionary<string, object>;
            var actual = (IDictionary<string, object>)current["shape"];
            var expected = (IDictionary<string, object>)payload["expectedShape"];
            foreach (var key in new[] { "presentationId", "id", "slideId", "shapeMode", "left", "top", "width", "height", "rotation", "adjustment", "maskBase64", "zOrder", "slideWidth", "slideHeight" })
            {
                if (!Equals(actual[key], expected[key]))
                {
                    if (throwOnChange) throw new InvalidOperationException("选区或图形已变化，正在等待下一次刷新。请重试。 ");
                    return false;
                }
            }
            return true;
        }

        private PowerPoint.Presentation RequirePresentation() =>
            RequireWindow().Presentation ?? throw new InvalidOperationException("没有打开的演示文稿。");

        private PowerPoint.Slide FindSlideForShape(int shapeId, int slideId, out PowerPoint.Shape found)
        {
            foreach (PowerPoint.Slide slide in RequirePresentation().Slides)
            {
                if (slide.SlideID != slideId) continue;
                foreach (PowerPoint.Shape shape in slide.Shapes)
                {
                    if (shape.Id == shapeId) { found = shape; return slide; }
                }
            }
            throw new InvalidOperationException("找不到之前选择的图形，请重新读取选区。");
        }

        private static int ParseShapeId(IDictionary<string, object> payload) =>
            int.Parse(Convert.ToString(payload["shapeId"], CultureInfo.InvariantCulture), CultureInfo.InvariantCulture);

        private static string ReadSettings(PowerPoint.Tags tags)
        {
            var chunks = new SortedDictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            for (var index = 1; index <= tags.Count; index++)
            {
                var name = tags.Name(index);
                if (name.StartsWith(TagPrefix, StringComparison.OrdinalIgnoreCase)) chunks[name] = tags.Value(index);
            }
            return chunks.Count == 0 ? null : string.Concat(chunks.Values);
        }

        private static void WriteSettings(PowerPoint.Tags tags, string json)
        {
            for (var index = tags.Count; index >= 1; index--)
            {
                if (tags.Name(index).StartsWith(TagPrefix, StringComparison.OrdinalIgnoreCase)) tags.Delete(tags.Name(index));
            }
            const int chunkSize = 220;
            var chunk = 0;
            for (var offset = 0; offset < json.Length; offset += chunkSize)
            {
                tags.Add(TagPrefix + chunk.ToString("D2", CultureInfo.InvariantCulture), json.Substring(offset, Math.Min(chunkSize, json.Length - offset)));
                chunk++;
            }
        }
    }
}
