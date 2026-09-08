using System;
using System.Drawing;
using System.Windows.Forms;

namespace LiquidSlide.ComAddin
{
    internal sealed class AboutWindow : Form
    {
        private static AboutWindow current;
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
            // All design sizes below are in 96-DPI units, including the minimum size.
            AutoScaleDimensions = new SizeF(96f, 96f);
            AutoScaleMode = AutoScaleMode.Dpi;
            ClientSize = new Size(600, 620);
            MinimumSize = new Size(480, 480);
            BackColor = Color.White;
            Font = new Font("Microsoft YaHei UI", 9f);
            FormBorderStyle = FormBorderStyle.Sizable;
            MaximizeBox = true; MinimizeBox = false; ShowInTaskbar = false;
            StartPosition = FormStartPosition.CenterParent;
            var content = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(28, 22, 28, 18) };
            var footer = new Panel { Dock = DockStyle.Bottom, Height = 64, Padding = new Padding(28, 12, 28, 20) };
            Controls.Add(content);
            Controls.Add(footer);
            content.ClientSizeChanged += (_, __) => ResizeContent(content);
            AddText(content, "LiquidSlide", 25f);
            AddText(content, "Liquid Glass for PowerPoint · " + typeof(AboutWindow).Assembly.GetName().Version.ToString(3) + " · x64", 8.5f);
            AddText(content, "为 PowerPoint 图形生成液态玻璃材质。\n作者：ZiChen-Whisper · 开源许可：MIT", 9f);
            AddLink(content, "官方网站", "https://liquidslide.zichenzou.chatgpt.site/");
            AddLink(content, "GitHub 项目仓库", "https://github.com/ZiChen-Whisper/LiquidSlide");
            AddLink(content, "作者主页", "https://github.com/ZiChen-Whisper");
            AddLink(content, "问题反馈与联系", "https://github.com/ZiChen-Whisper/LiquidSlide/issues");
            AddText(content, "开源致谢", 11f);
            AddLink(content, "Liquid DOM · Andrew Prifer · MIT", "https://github.com/AndrewPrifer/liquid-dom");
            AddText(content, "使用 React、React DOM 与 Microsoft WebView2。\n由 GPT-6 Astra 辅助开发。完整许可证随安装包分发。", 8.5f);
            var close = new Button { Text = "关闭", Size = new Size(90, 32), FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(54, 54, 79), ForeColor = Color.White, Margin = new Padding(0, 16, 0, 0), DialogResult = DialogResult.Cancel };
            close.Dock = DockStyle.Right;
            footer.Controls.Add(close);
            AcceptButton = close; CancelButton = close;
            ResumeLayout(true);
            ResizeContent(content);
        }
        private static void ResizeContent(FlowLayoutPanel content)
        {
            // Use the actual scaled client width, not a fixed unscaled label width.
            var width = Math.Max(1, content.ClientSize.Width - content.Padding.Horizontal - SystemInformation.VerticalScrollBarWidth);
            foreach (Control child in content.Controls)
            {
                if (child is Label) child.MaximumSize = new Size(Math.Max(1, width - child.Margin.Horizontal), 0);
            }
        }
        private static void AddText(Control parent, string text, float size)
        {
            parent.Controls.Add(new Label { Text = text, AutoSize = true, Font = new Font("Microsoft YaHei UI", size), ForeColor = Color.FromArgb(54, 54, 79), Margin = new Padding(0, 6, 0, 9) });
        }
        private static void AddLink(Control parent, string text, string url)
        {
            var link = new LinkLabel { Text = text, AutoSize = true, LinkColor = Color.FromArgb(99, 91, 162), Margin = new Padding(0, 3, 0, 5) };
            link.LinkClicked += (_, __) => {
                try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(url) { UseShellExecute = true }); }
                catch (Exception error) { MessageBox.Show(error.Message, "无法打开链接", MessageBoxButtons.OK, MessageBoxIcon.Information); }
            };
            parent.Controls.Add(link);
        }
    }
}

