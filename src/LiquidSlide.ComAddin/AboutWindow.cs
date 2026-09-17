using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Net;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace LiquidSlide.ComAddin
{
    internal sealed class AboutWindow : Form
    {
        private const string LatestReleaseUrl = "https://api.github.com/repos/ZiChen-Whisper/LiquidSlide/releases/latest";
        private const string LatestReleasePageUrl = "https://github.com/ZiChen-Whisper/LiquidSlide/releases/latest";
        private const string OfficialDocsUrl = "https://my.feishu.cn/wiki/TcfsweHDViQZCIkNJ9qcKEtWnpf?from=from_copylink";
        private const string ReleaseNotes =
            "1. 新增“我的预设”：保存当前材质、亮度和参数，支持自定义命名、同名另存、缩略渲染图、删除预设和编辑说明。\n" +
            "2. 新增更多图形支持（体验版）：支持椭圆、多边形、箭头、星形以及自由图形等 PowerPoint 图形库中的可填充图形。\n" +
            "3. 预览窗口实时跟随选区变化：切换图形、调整尺寸、旋转或修改轮廓后自动刷新。\n" +
            "4. 优化真实预览模式：圆形和圆角矩形支持真实背景预览；其他复杂图形使用圆角矩形示例展示，暂不支持真实渲染预览。\n" +
            "5. 统一界面视觉样式：统一按钮、输入框、下拉框、预设卡片和提示气泡的圆角、边框、颜色与交互状态。\n" +
            "6. 优化玻璃颜色选择器：支持色盘选择颜色，并提供 HEX 和 RGB 两种输入模式。\n" +
            "7. 优化下拉选框体验：统一样式，去除默认高亮描边，并增加展开、收起和箭头旋转动画。\n" +
            "8. 优化参数说明方式：斜面宽度、位移倍率、折射率、高光强度等参数改为通过悬停提示查看说明。\n" +
            "9. 增加操作加载提示：应用效果、读取背景和渲染材质时显示加载动画。\n" +
            "10. 优化底部操作区域：状态提示和操作按钮所在的操作栏加入毛玻璃效果。\n" +
            "11. 优化顶部菜单快捷按钮：增加“添加阴影”和“去除框线”，图标与面板内保持一致并提高显示清晰度。\n" +
            "12. 新增整体亮度调节：支持 -100 到 100 的整体亮度调整。\n" +
            "13. 优化染色强度调节：改为滑动条控制，同时保留精确数值输入。\n" +
            "14. 更新系统材质名称：经典通透改为通透玻璃，白色玻璃改为珍珠玻璃，黑色玻璃改为曜黑玻璃，柔雾磨砂改为磨砂玻璃。\n" +
            "15. 优化默认预设材质：珍珠玻璃和曜黑玻璃的背景模糊调整为 3，并统一通透玻璃、珍珠玻璃和曜黑玻璃的高光参数。\n" +
            "16. 优化“关于”界面布局：重新整理资源与支持、版本信息和底部按钮，减少空白并统一圆角设计。\n" +
            "17. 新增官方文档入口：可从“关于”界面打开官方文档。\n" +
            "18. 新增检查更新功能：支持从“关于”界面检查 GitHub 最新版本，并在 API 限流时尝试读取 Release 页面。\n" +
            "19. 新增版本更新内容展示：在“关于”界面查看本版本更新内容，较长内容支持自定义滚动。\n" +
            "20. 增强宿主与面板版本一致性检查：通过版本校验和内容哈希降低旧缓存及新旧组件不匹配问题。\n" +
            "21. 安装说明支持中英双语：补充系统要求、本机预设存储、依赖环境和第三方许可证说明。";
        private static readonly HttpClient httpClient = CreateHttpClient();
        private static AboutWindow current;
        private readonly FlowLayoutPanel content;
        private readonly RoundedPanel updatePanel;
        private readonly FlowLayoutPanel updateStack;
        private readonly UpdateTextScroller updateText;
        private readonly RoundedButton checkUpdates;
        internal static void ShowAbout()
        {
            if (current != null && !current.IsDisposed) { current.Activate(); return; }
            current = new AboutWindow();
            var owner = new NativeWindow();
            try
            {
                if (ComAddin.CurrentApplication != null) owner.AssignHandle(new IntPtr(ComAddin.CurrentApplication.HWND));
                if (owner.Handle != IntPtr.Zero) current.ShowDialog(owner); else current.ShowDialog();
            }
            finally { owner.ReleaseHandle(); current.Dispose(); current = null; }
        }
        private AboutWindow()
        {
            SuspendLayout();
            Text = "关于 LiquidSlide";
            AutoScaleDimensions = new SizeF(96f, 96f);
            AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = Color.White;
            Font = new Font("Microsoft YaHei UI", 9f);
            FormBorderStyle = FormBorderStyle.Sizable;
            MaximizeBox = true; MinimizeBox = false; ShowInTaskbar = false;
            MinimumSize = new Size(520, 380);
            StartPosition = FormStartPosition.CenterParent;
            content = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(28, 20, 28, 14), BackColor = Color.White };
            var footer = new TableLayoutPanel { Dock = DockStyle.Bottom, Height = 58, ColumnCount = 3, RowCount = 1, Padding = new Padding(28, 10, 28, 16), BackColor = Color.White };
            footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 90f));
            footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 98f));
            footer.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
            Controls.Add(content);
            Controls.Add(footer);
            content.ClientSizeChanged += (_, __) => ResizeContent();
            AddText(content, "LiquidSlide", 25f);
            AddText(content, "Liquid Glass for PowerPoint · " + typeof(AboutWindow).Assembly.GetName().Version.ToString(3) + " · x64", 8.5f);
            AddText(content, "为 PowerPoint 图形生成液态玻璃材质。\n作者：ZiChen-Whisper · 开源许可：MIT", 9f);
            content.Controls.Add(CreateResourcesPanel());
            AddText(content, "使用 React、React DOM 与 Microsoft WebView2。\n由 GPT-6 Astra 辅助开发。完整许可证随安装包分发。", 8.5f);

            updatePanel = new RoundedPanel { Radius = 10, BackColor = Color.FromArgb(247, 246, 252), Padding = new Padding(12, 8, 12, 8), Margin = new Padding(0, 8, 0, 2), Height = 45 };
            updateStack = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, FlowDirection = FlowDirection.TopDown, WrapContents = false, BackColor = Color.Transparent, Padding = new Padding(0), Margin = new Padding(0) };
            updatePanel.Controls.Add(updateStack);
            AddText(updateStack, "版本更新内容", 10.5f);
            updateText = new UpdateTextScroller { Message = ReleaseNotes, ForeColor = Color.FromArgb(84, 84, 96), Font = new Font("Microsoft YaHei UI", 8.5f), Margin = new Padding(0, 0, 0, 2) };
            updateStack.Controls.Add(updateText);
            content.Controls.Add(updatePanel);

            checkUpdates = CreateActionButton("检查更新");
            checkUpdates.Dock = DockStyle.Fill;
            checkUpdates.Margin = new Padding(0);
            checkUpdates.Click += CheckForUpdates;
            var close = CreateActionButton("关闭");
            close.Dock = DockStyle.Fill;
            close.DialogResult = DialogResult.Cancel;
            close.Margin = new Padding(8, 0, 0, 0);
            footer.Controls.Add(checkUpdates, 1, 0);
            footer.Controls.Add(close, 2, 0);
            AcceptButton = close; CancelButton = close;
            ClientSize = new Size(620, 450);
            ResumeLayout(true);
            ResizeWindowToContent();
        }

        private static HttpClient CreateHttpClient()
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            var client = new HttpClient();
            client.Timeout = TimeSpan.FromSeconds(6);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("LiquidSlide-About");
            client.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
            client.DefaultRequestHeaders.TryAddWithoutValidation("X-GitHub-Api-Version", "2022-11-28");
            return client;
        }

        private void ResizeWindowToContent()
        {
            var workArea = Screen.FromPoint(Cursor.Position).WorkingArea;
            var scale = Math.Max(1f, DeviceDpi / 96f);
            var maxWidth = Math.Max(520, (int)(workArea.Width * 0.72f / scale));
            var maxHeight = Math.Max(380, (int)(workArea.Height * 0.82f / scale));
            var width = Math.Min(620, maxWidth);
            ClientSize = new Size(width, Math.Min(700, maxHeight));
            ResizeContent();

            var desiredHeight = GetDesiredContentHeight();
            var height = Math.Min(maxHeight, Math.Max(380, desiredHeight));
            ClientSize = new Size(width, height);
            content.AutoScroll = desiredHeight > height - 58;
            ResizeContent();
            // A wrapped update message can grow after the final client width is
            // known. Re-measure once more so the card is never clipped at the
            // bottom of the dialog.
            desiredHeight = GetDesiredContentHeight();
            if (desiredHeight > ClientSize.Height && ClientSize.Height < maxHeight)
            {
                ClientSize = new Size(width, Math.Min(maxHeight, desiredHeight));
                content.AutoScroll = desiredHeight > ClientSize.Height - 58;
                ResizeContent();
            }
        }

        private int GetDesiredContentHeight()
        {
            var desiredHeight = content.Padding.Vertical + 58;
            foreach (Control child in content.Controls) desiredHeight += child.Height + child.Margin.Vertical;
            return desiredHeight;
        }

        private void ResizeContent()
        {
            // ClientSize already excludes a visible scrollbar. Subtracting its
            // width again makes the update card needlessly narrow and clips text.
            var width = Math.Max(1, content.ClientSize.Width - content.Padding.Horizontal);
            foreach (Control child in content.Controls)
            {
                if (child is Label label)
                {
                    label.MaximumSize = new Size(Math.Max(1, width - label.Margin.Horizontal), 0);
                }
                else if (child is RoundedPanel panel)
                {
                    panel.Width = Math.Max(1, width - panel.Margin.Horizontal);
                    if (panel == updatePanel)
                    {
                        var innerWidth = Math.Max(1, updatePanel.ClientSize.Width - updatePanel.Padding.Horizontal);
                        updateStack.Width = innerWidth;
                        updateText.Width = innerWidth;
                        updateStack.PerformLayout();
                        var preferredHeight = updateStack.GetPreferredSize(new Size(innerWidth, 0)).Height;
                        updateStack.Height = preferredHeight;
                        updatePanel.Height = Math.Max(45, preferredHeight + updatePanel.Padding.Vertical);
                    }
                }
            }
            content.PerformLayout();
        }

        private static RoundedPanel CreateResourcesPanel()
        {
            var panel = new RoundedPanel
            {
                Radius = 12,
                Height = 154,
                BackColor = Color.FromArgb(250, 249, 253),
                Padding = new Padding(13, 8, 13, 8),
                Margin = new Padding(0, 8, 0, 2)
            };
            var links = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                BackColor = Color.Transparent,
                Padding = new Padding(0),
                Margin = new Padding(0)
            };
            panel.Controls.Add(links);
            AddText(links, "资源与支持", 10.5f);
            AddLinkRow(links, "官方网站", "https://liquidslide.zichenzou.chatgpt.site/", "官方文档", OfficialDocsUrl);
            AddLink(links, "GitHub 项目仓库", "https://github.com/ZiChen-Whisper/LiquidSlide");
            AddLinkRow(links, "作者主页", "https://github.com/ZiChen-Whisper", "问题反馈与联系", "https://github.com/ZiChen-Whisper/LiquidSlide/issues");
            AddText(links, "开源致谢 · Liquid DOM · Andrew Prifer · MIT", 8.5f);
            return panel;
        }

        private static RoundedButton CreateActionButton(string text)
        {
            return new RoundedButton
            {
                Text = text,
                Size = new Size(90, 32),
                FlatStyle = FlatStyle.Flat,
                UseVisualStyleBackColor = false,
                BackColor = Color.FromArgb(54, 54, 79),
                ForeColor = Color.White,
                Font = new Font("Microsoft YaHei UI", 9f),
                FlatAppearance = { BorderSize = 0, MouseOverBackColor = Color.FromArgb(76, 71, 115), MouseDownBackColor = Color.FromArgb(44, 43, 66) }
            };
        }

        private async void CheckForUpdates(object sender, EventArgs args)
        {
            checkUpdates.Enabled = false;
            checkUpdates.Text = "检查中…";
            updateText.Message = "正在检查最新版本…";
            ResizeContent();
            try
            {
                var latestVersion = await FetchLatestVersion();
                var currentVersion = typeof(AboutWindow).Assembly.GetName().Version ?? new Version(0, 0);
                if (IsDisposed || Disposing) return;
                updateText.Message = latestVersion != null && latestVersion > currentVersion
                    ? "发现新版本 " + latestVersion.ToString(3) + "，请前往 GitHub 项目仓库下载。"
                    : "当前已是最新版本（" + currentVersion.ToString(3) + "）。";
            }
            catch (TaskCanceledException)
            {
                if (!IsDisposed && !Disposing) updateText.Message = "检查超时，请检查网络后重试。";
            }
            catch (HttpRequestException)
            {
                if (!IsDisposed && !Disposing) updateText.Message = "无法连接 GitHub，请检查网络后重试。";
            }
            catch (Exception error)
            {
                if (!IsDisposed && !Disposing) updateText.Message = "检查失败：" + error.Message;
            }
            finally
            {
                if (!IsDisposed && !Disposing)
                {
                    checkUpdates.Text = "检查更新";
                    checkUpdates.Enabled = true;
                    ResizeContent();
                }
            }
        }

        private static async Task<Version> FetchLatestVersion()
        {
            using (var response = await httpClient.GetAsync(LatestReleaseUrl))
            {
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync();
                    var release = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(json);
                    var latestText = release != null && release.TryGetValue("tag_name", out var tag) ? Convert.ToString(tag) : "";
                    var latestVersion = ParseVersion(latestText);
                    if (latestVersion != null) return latestVersion;
                    throw new InvalidOperationException("GitHub 返回的版本号无法识别。");
                }
                if (response.StatusCode != HttpStatusCode.Forbidden)
                    throw new InvalidOperationException("GitHub 返回 HTTP " + (int)response.StatusCode);
            }

            // GitHub's unauthenticated API can return 403 after its rate limit is
            // reached. The public latest-release page still exposes the tag URL.
            using (var page = await httpClient.GetAsync(LatestReleasePageUrl))
            {
                if (!page.IsSuccessStatusCode)
                    throw new InvalidOperationException("GitHub API 限流，且 release 页面返回 HTTP " + (int)page.StatusCode);
                var html = await page.Content.ReadAsStringAsync();
                var match = Regex.Match(html, @"releases/tag/v?([0-9]+(?:\.[0-9]+){1,3})", RegexOptions.IgnoreCase);
                var latestVersion = match.Success ? ParseVersion(match.Groups[1].Value) : null;
                if (latestVersion != null) return latestVersion;
                throw new InvalidOperationException("GitHub release 页面没有可识别的版本号。");
            }
        }

        private static Version ParseVersion(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            value = value.Trim().TrimStart('v', 'V');
            if (!Version.TryParse(value, out var version)) return null;
            return new Version(version.Major, version.Minor, Math.Max(0, version.Build), Math.Max(0, version.Revision));
        }

        private static void AddText(Control parent, string text, float size)
        {
            parent.Controls.Add(new Label { Text = text, AutoSize = true, Font = new Font("Microsoft YaHei UI", size), ForeColor = Color.FromArgb(54, 54, 79), Margin = new Padding(0, 5, 0, 7) });
        }

        private static void AddLink(Control parent, string text, string url)
        {
            var link = new LinkLabel { Text = text, AutoSize = true, LinkColor = Color.FromArgb(99, 91, 162), Margin = new Padding(0, 2, 0, 3), Cursor = Cursors.Hand };
            link.LinkClicked += (_, __) => {
                try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(url) { UseShellExecute = true }); }
                catch (Exception error) { MessageBox.Show(error.Message, "无法打开链接", MessageBoxButtons.OK, MessageBoxIcon.Information); }
            };
            parent.Controls.Add(link);
        }

        private static void AddLinkRow(Control parent, string firstText, string firstUrl, string secondText, string secondUrl)
        {
            var row = new FlowLayoutPanel
            {
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents = false,
                BackColor = Color.Transparent,
                Padding = new Padding(0),
                Margin = new Padding(0, 0, 0, 1)
            };
            AddLink(row, firstText, firstUrl);
            row.Controls.Add(new Label
            {
                Text = " · ",
                AutoSize = true,
                ForeColor = Color.FromArgb(150, 148, 164),
                Font = new Font("Microsoft YaHei UI", 8.5f),
                Margin = new Padding(0, 3, 0, 3)
            });
            AddLink(row, secondText, secondUrl);
            parent.Controls.Add(row);
        }

        private sealed class UpdateTextScroller : Panel
        {
            private readonly Label messageLabel = new Label { AutoSize = true, BackColor = Color.Transparent, Margin = new Padding(0) };
            private string message = "";
            private int contentHeight;
            private int scrollOffset;
            private bool dragging;
            private int dragOffset;
            private bool layingOut;

            internal string Message
            {
                get => message;
                set
                {
                    message = value ?? "";
                    messageLabel.Text = message;
                    UpdateMetrics();
                    Invalidate();
                }
            }

            public UpdateTextScroller()
            {
                SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
                SetStyle(ControlStyles.ResizeRedraw, true);
                AutoScroll = false;
                BackColor = Color.Transparent;
                Controls.Add(messageLabel);
            }

            protected override void OnFontChanged(EventArgs e)
            {
                base.OnFontChanged(e);
                if (messageLabel != null) messageLabel.Font = Font;
                UpdateMetrics();
            }

            protected override void OnForeColorChanged(EventArgs e)
            {
                base.OnForeColorChanged(e);
                if (messageLabel != null) messageLabel.ForeColor = ForeColor;
            }

            protected override void OnSizeChanged(EventArgs e)
            {
                base.OnSizeChanged(e);
                UpdateMetrics();
            }

            private void UpdateMetrics()
            {
                if (layingOut || messageLabel == null || ClientSize.Width <= 0) return;
                layingOut = true;
                try
                {
                    var scrollbarSpace = 12;
                    var verticalPadding = 6;
                    var textWidth = Math.Max(1, ClientSize.Width - scrollbarSpace);
                    messageLabel.MaximumSize = new Size(textWidth, 0);
                    var preferredHeight = Math.Max(Font.Height, messageLabel.GetPreferredSize(new Size(textWidth, 0)).Height);
                    contentHeight = preferredHeight + verticalPadding;
                    var maxVisibleHeight = Math.Max(Font.Height + verticalPadding, Font.Height * 3 + verticalPadding);
                    var targetHeight = Math.Min(maxVisibleHeight, contentHeight);
                    if (Height != targetHeight) Height = targetHeight;
                    messageLabel.Width = textWidth;
                    messageLabel.Height = preferredHeight;
                    scrollOffset = Math.Min(scrollOffset, MaxScrollOffset);
                    messageLabel.Top = verticalPadding / 2 - scrollOffset;
                }
                finally { layingOut = false; }
                Invalidate();
            }

            private int MaxScrollOffset => Math.Max(0, contentHeight - ClientSize.Height);
            private bool HasOverflow => MaxScrollOffset > 0;

            private RectangleF GetThumb()
            {
                var track = new RectangleF(Math.Max(0, Width - 7), 3, 4, Math.Max(1, Height - 6));
                var thumbHeight = Math.Max(14, track.Height * ClientSize.Height / Math.Max(ClientSize.Height, contentHeight));
                var travel = Math.Max(0, track.Height - thumbHeight);
                var top = track.Top + (MaxScrollOffset == 0 ? 0 : travel * scrollOffset / MaxScrollOffset);
                return new RectangleF(track.X, top, track.Width, thumbHeight);
            }

            private void ScrollTo(int offset)
            {
                scrollOffset = Math.Max(0, Math.Min(MaxScrollOffset, offset));
                messageLabel.Top = 3 - scrollOffset;
                Invalidate();
            }

            protected override void OnMouseWheel(MouseEventArgs e)
            {
                if (HasOverflow) ScrollTo(scrollOffset - Math.Sign(e.Delta) * Math.Max(12, Font.Height * 2));
                base.OnMouseWheel(e);
            }

            protected override void OnMouseDown(MouseEventArgs e)
            {
                if (e.Button == MouseButtons.Left && HasOverflow && e.X >= Width - 16)
                {
                    var thumb = GetThumb();
                    if (thumb.Contains(e.Location))
                    {
                        dragging = true;
                        dragOffset = e.Y - (int)thumb.Top;
                        Capture = true;
                    }
                    else
                    {
                        var track = new RectangleF(Width - 7, 3, 4, Height - 6);
                        var travel = Math.Max(1f, track.Height - thumb.Height);
                        ScrollTo((int)((e.Y - track.Top - thumb.Height / 2) / travel * MaxScrollOffset));
                    }
                }
                base.OnMouseDown(e);
            }

            protected override void OnMouseMove(MouseEventArgs e)
            {
                if (dragging)
                {
                    var track = new RectangleF(Width - 7, 3, 4, Height - 6);
                    var thumb = GetThumb();
                    var travel = Math.Max(1f, track.Height - thumb.Height);
                    ScrollTo((int)((e.Y - track.Top - dragOffset) / travel * MaxScrollOffset));
                }
                base.OnMouseMove(e);
            }

            protected override void OnMouseUp(MouseEventArgs e)
            {
                dragging = false;
                Capture = false;
                base.OnMouseUp(e);
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                base.OnPaint(e);
                if (!HasOverflow) return;
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                using (var trackBrush = new SolidBrush(Color.FromArgb(226, 224, 237)))
                using (var thumbBrush = new SolidBrush(Color.FromArgb(151, 143, 194)))
                {
                    var track = new RectangleF(Width - 7, 3, 4, Math.Max(1, Height - 6));
                    using (var trackPath = RoundedRectangle(track, 2f))
                    using (var thumbPath = RoundedRectangle(GetThumb(), 2f))
                    {
                        e.Graphics.FillPath(trackBrush, trackPath);
                        e.Graphics.FillPath(thumbBrush, thumbPath);
                    }
                }
            }

            private static GraphicsPath RoundedRectangle(RectangleF rectangle, float radius)
            {
                var diameter = Math.Min(radius * 2, Math.Min(rectangle.Width, rectangle.Height));
                var path = new GraphicsPath();
                path.AddArc(rectangle.X, rectangle.Y, diameter, diameter, 180, 90);
                path.AddArc(rectangle.Right - diameter, rectangle.Y, diameter, diameter, 270, 90);
                path.AddArc(rectangle.Right - diameter, rectangle.Bottom - diameter, diameter, diameter, 0, 90);
                path.AddArc(rectangle.X, rectangle.Bottom - diameter, diameter, diameter, 90, 90);
                path.CloseFigure();
                return path;
            }
        }

        private sealed class RoundedButton : Button
        {
            private bool hovered;
            private bool pressed;

            public RoundedButton()
            {
                SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
                SetStyle(ControlStyles.ResizeRedraw, true);
            }

            protected override void OnMouseEnter(EventArgs e) { hovered = true; Invalidate(); base.OnMouseEnter(e); }
            protected override void OnMouseLeave(EventArgs e) { hovered = false; pressed = false; Invalidate(); base.OnMouseLeave(e); }
            protected override void OnMouseDown(MouseEventArgs e) { pressed = true; Invalidate(); base.OnMouseDown(e); }
            protected override void OnMouseUp(MouseEventArgs e) { pressed = false; Invalidate(); base.OnMouseUp(e); }

            protected override void OnSizeChanged(EventArgs e)
            {
                base.OnSizeChanged(e);
                using (var path = RoundedRectangle(new RectangleF(0, 0, Math.Max(1, Width), Math.Max(1, Height)), 10f))
                    Region = new Region(path);
            }

            protected override void OnPaintBackground(PaintEventArgs e)
            {
                // Keep the pixels outside the anti-aliased fill deterministic;
                // the native Button background otherwise leaks as black corner
                // blocks on some Office/DPI combinations.
                e.Graphics.Clear(Color.White);
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                // Paint the whole backing surface first. This prevents the
                // button's native background from leaking through the curved
                // corners on high-DPI displays.
                e.Graphics.Clear(Color.White);
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                e.Graphics.CompositingQuality = CompositingQuality.HighQuality;
                e.Graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                var fill = !Enabled ? Color.FromArgb(170, 170, 180) : pressed ? Color.FromArgb(44, 43, 66) : hovered ? Color.FromArgb(76, 71, 115) : BackColor;
                using (var brush = new SolidBrush(fill))
                using (var path = RoundedRectangle(new RectangleF(.5f, .5f, Math.Max(0, Width - 1f), Math.Max(0, Height - 1f)), 10f))
                    e.Graphics.FillPath(brush, path);
                TextRenderer.DrawText(e.Graphics, Text, Font, ClientRectangle, Enabled ? ForeColor : Color.White, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
            }

            private static GraphicsPath RoundedRectangle(RectangleF rectangle, float radius)
            {
                var diameter = Math.Min(radius * 2, Math.Min(rectangle.Width, rectangle.Height));
                var path = new GraphicsPath();
                path.AddArc(rectangle.X, rectangle.Y, diameter, diameter, 180, 90);
                path.AddArc(rectangle.Right - diameter, rectangle.Y, diameter, diameter, 270, 90);
                path.AddArc(rectangle.Right - diameter, rectangle.Bottom - diameter, diameter, diameter, 0, 90);
                path.AddArc(rectangle.X, rectangle.Bottom - diameter, diameter, diameter, 90, 90);
                path.CloseFigure();
                return path;
            }
        }

        private sealed class RoundedPanel : Panel
        {
            internal int Radius { get; set; }

            public RoundedPanel()
            {
                SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
                SetStyle(ControlStyles.ResizeRedraw, true);
            }

            protected override void OnPaintBackground(PaintEventArgs e)
            {
                e.Graphics.Clear(Parent?.BackColor ?? Color.White);
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                e.Graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                using (var brush = new SolidBrush(BackColor))
                using (var path = RoundedRectangle(new RectangleF(.5f, .5f, Math.Max(0, Width - 1f), Math.Max(0, Height - 1f)), Radius))
                    e.Graphics.FillPath(brush, path);
            }

            private static GraphicsPath RoundedRectangle(RectangleF rectangle, float radius)
            {
                var diameter = Math.Min(radius * 2, Math.Min(rectangle.Width, rectangle.Height));
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
}

