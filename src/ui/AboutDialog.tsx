import { useEffect, useRef } from "react";
import packageInfo from "../../package.json";

export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  return <dialog ref={dialog} className="about-dialog" aria-labelledby="about-title" onClose={onClose}>
    <div className="about-heading"><h2 id="about-title">关于 LiquidSlide</h2>
      <button className="secondary" onClick={onClose} autoFocus aria-label="关闭关于页面">关闭</button></div>
    <p className="about-version">版本 {packageInfo.version} · Windows x64</p>
    <p>为 PowerPoint 图形生成液态玻璃材质。</p>
    <dl>
      <dt>作者</dt><dd>ZiChen-Whisper</dd>
      <dt>项目仓库</dt><dd><a href="https://github.com/ZiChen-Whisper/LiquidSlide" target="_blank" rel="noreferrer">ZiChen-Whisper / LiquidSlide ↗</a></dd>
      <dt>联系作者</dt><dd><a href="https://github.com/ZiChen-Whisper" target="_blank" rel="noreferrer">GitHub 主页 ↗</a><br />
        <a href="https://github.com/ZiChen-Whisper/LiquidSlide/issues" target="_blank" rel="noreferrer">问题反馈与联系（Issues）↗</a></dd>
      <dt>开源许可</dt><dd>LiquidSlide · MIT</dd>
    </dl>
    <div className="about-credits"><h3>致谢</h3>
      <p>玻璃渲染基于 <a href="https://github.com/AndrewPrifer/liquid-dom" target="_blank" rel="noreferrer">Liquid DOM ↗</a>，由 Andrew Prifer（Andras Prifer）创作，采用 MIT 许可证。</p>
      <p>使用 React、React DOM 与 Microsoft WebView2。完整许可证随安装包附于 licenses 文件夹。</p>
    </div>
  </dialog>;
}
