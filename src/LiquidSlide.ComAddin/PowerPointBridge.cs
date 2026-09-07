using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using Office = Microsoft.Office.Core;
using PowerPoint = Microsoft.Office.Interop.PowerPoint;

namespace LiquidSlide.ComAddin
{
    internal sealed class PowerPointBridge
    {
        private const string TagPrefix = "LIQUIDSLIDE_SETTINGS_V1_";
        private readonly PowerPoint.Application application;
        private readonly JavaScriptSerializer serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        private readonly Dictionary<PowerPoint.Presentation, string> presentationIds = new Dictionary<PowerPoint.Presentation, string>();

        private string PresentationId(PowerPoint.Presentation presentation)
        {
            if (!presentationIds.TryGetValue(presentation, out var id))
                presentationIds[presentation] = id = Guid.NewGuid().ToString("N");
            return id;
        }

        public PowerPointBridge(PowerPoint.Application application) { this.application = application; }

        public string SelectionFingerprint()
        {
            var presentation = RequirePresentation();
            var selection = application.ActiveWindow?.Selection;
            if (selection == null || selection.Type != PowerPoint.PpSelectionType.ppSelectionShapes || selection.ShapeRange.Count != 1)
                return "no-selection";
            var shape = selection.ShapeRange[1];
            var slide = (PowerPoint.Slide)application.ActiveWindow.View.Slide;
            float? adjustment = null;
            if (shape.Type == Office.MsoShapeType.msoAutoShape && shape.Adjustments.Count > 0) adjustment = shape.Adjustments[1];
            return serializer.Serialize(new {
                document = PresentationId(presentation), slide = slide.SlideID, id = shape.Id,
                shape.Left, shape.Top, shape.Width, shape.Height, shape.Rotation, shape.ZOrderPosition,
                type = shape.Type, autoShape = shape.Type == Office.MsoShapeType.msoAutoShape ? (int)shape.AutoShapeType : 0, adjustment,
                slideWidth = presentation.PageSetup.SlideWidth, slideHeight = presentation.PageSetup.SlideHeight
            });
        }

        public object InspectSelection()
        {
            var presentation = RequirePresentation();
            var view = application.ActiveWindow?.View ?? throw new InvalidOperationException("没有活动的 PowerPoint 编辑窗口。");
            var selection = application.ActiveWindow.Selection;
            if (selection == null || selection.Type != PowerPoint.PpSelectionType.ppSelectionShapes || selection.ShapeRange.Count != 1)
                throw new InvalidOperationException("请只选择一个正圆或圆角矩形。");

            PowerPoint.Shape shape = selection.ShapeRange[1];
            if (shape.Type != Office.MsoShapeType.msoAutoShape)
                throw new InvalidOperationException("LiquidSlide 当前只支持 PowerPoint 自选图形。");
            var isCircle = shape.AutoShapeType == Office.MsoAutoShapeType.msoShapeOval
                && Math.Abs(shape.Width - shape.Height) / Math.Max(shape.Width, shape.Height) <= 0.01;
            if (!isCircle && shape.AutoShapeType != Office.MsoAutoShapeType.msoShapeRoundedRectangle)
                throw new InvalidOperationException("请选择正圆或圆角矩形，暂不支持椭圆及其他图形。");
            var slide = (PowerPoint.Slide)view.Slide;
            float? adjustment = null;
            try { if (shape.Adjustments.Count > 0) adjustment = shape.Adjustments[1]; } catch (COMException) { }
            var savedSettingsJson = ReadSettings(shape.Tags);
            object savedSettings = savedSettingsJson == null ? null : serializer.DeserializeObject(savedSettingsJson);
            return new
            {
                shape = new
                {
                    shapeMode = isCircle ? "circle" : "roundedRectangle",
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
            return new { applied = true };
        }

        public object RemoveOutline(IDictionary<string, object> payload)
        {
            ValidateTarget(payload);
            FindSlideForShape(ParseShapeId(payload), Convert.ToInt32(payload["slideId"], CultureInfo.InvariantCulture), out var shape);
            shape.Line.Visible = Office.MsoTriState.msoFalse;
            return new { applied = true };
        }

        // Never write an asynchronous frame to another document, selection or geometry.
        private bool ValidateTarget(IDictionary<string, object> payload, bool throwOnChange = true)
        {
            var current = serializer.DeserializeObject(serializer.Serialize(InspectSelection())) as IDictionary<string, object>;
            var actual = (IDictionary<string, object>)current["shape"];
            var expected = (IDictionary<string, object>)payload["expectedShape"];
            foreach (var key in new[] { "presentationId", "id", "slideId", "shapeMode", "left", "top", "width", "height", "rotation", "adjustment", "zOrder", "slideWidth", "slideHeight" })
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
            application.ActivePresentation ?? throw new InvalidOperationException("没有打开的演示文稿。");

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
