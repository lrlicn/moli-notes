// 轻量 SVG 图标库（线性风格，跟随 currentColor）
import type { SVGProps } from "react";

function I(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export const SearchIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></I>
);
export const DownloadIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M12 3v11" /><path d="m8 10 4 4 4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></I>
);
export const UploadIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M12 14V3" /><path d="m8 7 4-4 4 4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></I>
);
export const GlobeIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a13.5 13.5 0 0 1 0 18M12 3a13.5 13.5 0 0 0 0 18" /></I>
);
// 外部链接（方框 + 右上箭头），链接类预览的「新标签页打开」
export const ExternalLinkIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></I>
);
export const FolderIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></I>
);
export const FolderPlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /><path d="M12 11v6M9 14h6" /></I>
);
export const TerminalIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="m4 17 5-5-5-5" /><path d="M12 19h8" /></I>
);
export const CodeIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="m8 7-5 5 5 5" /><path d="m16 7 5 5-5 5" /></I>
);
export const TextIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M4 7V5h16v2" /><path d="M12 5v14" /><path d="M9 19h6" /></I>
);
export const KeyIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><circle cx="7.5" cy="15.5" r="3.5" /><path d="m10 13 10-10" /><path d="M17 3h4v4" /></I>
);
export const CopyIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></I>
);
export const StarIcon = ({ filled, ...p }: SVGProps<SVGSVGElement> & { filled?: boolean }) => (
  <I {...p} fill={filled ? "currentColor" : "none"}>
    <path d="M12 2.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.57l-5.9 3.1 1.13-6.57L2.45 9.44l6.6-.96z" />
  </I>
);
export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M12 5v14M5 12h14" /></I>
);
export const MoreIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p} fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></I>
);
export const TrashIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></I>
);
export const PencilIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></I>
);
export const XIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M18 6 6 18M6 6l12 12" /></I>
);
// 密码显隐切换（眼睛 开/闭）
export const EyeIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></I>
);
export const EyeOffIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M10.7 5.2A10 10 0 0 1 12 5c6.4 0 10 7 10 7a13.2 13.2 0 0 1-2.1 3.1" /><path d="M6.6 6.7C3.8 8.3 2 12 2 12s3.6 7 10 7c1.9 0 3.6-.5 5.1-1.3" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="m2 2 20 20" /></I>
);
export const ChevronRightIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="m9 18 6-6-6-6" /></I>
);
export const ChevronDownIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="m6 9 6 6 6-6" /></I>
);
// 全部展开（箭头向外）/全部收起（箭头向内合拢）——unfold 语义
export const UnfoldMoreIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="m9 8 3-3 3 3" /><path d="m15 16-3 3-3-3" /></I>
);
export const UnfoldLessIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="m9 5 3 3 3-3" /><path d="m15 19-3-3-3 3" /></I>
);
export const SunIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></I>
);
export const MoonIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></I>
);
export const LogoutIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></I>
);
export const MenuIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M4 6h16M4 12h16M4 18h16" /></I>
);
export const GridIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></I>
);
// 列表视图（多行行目），与 GridIcon 对应作密度切换
export const ListIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="3.5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="3.5" cy="18" r="1" fill="currentColor" stroke="none" /></I>
);
export const InboxIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></I>
);
export const ClockIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></I>
);
export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M20 6 9 17l-5-5" /></I>
);
// 挥手（张开的手掌，问候语义；线性风格跟随 currentColor）
export const HandWaveIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
    <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
    <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
  </I>
);
// 品牌 LOGO（圆环 + 笔 + 记录线，来自 public/logo.svg，填充风格跟随文字色）
export const LogoIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M512 107c223.675 0 405 181.325 405 405S735.675 917 512 917 107 735.675 107 512s181.325-405 405-405z m179.226 540.351h-189a6.75 6.75 0 0 0-6.75 6.75v20.25a6.75 6.75 0 0 0 6.75 6.75h189a6.75 6.75 0 0 0 6.75-6.75v-20.25a6.75 6.75 0 0 0-6.75-6.75z m-78.642-297.28a6.75 6.75 0 0 0-9.546 0L347.286 605.82a6.75 6.75 0 0 0-1.977 4.803l0.268 62.34 0.005 0.237a6.75 6.75 0 0 0 6.774 6.484l61.757-0.268a6.75 6.75 0 0 0 4.744-1.977l255.775-255.775a6.75 6.75 0 0 0 0-9.546z m35.797-35.798a6.75 6.75 0 0 0-9.546 0l-14.319 14.319a6.75 6.75 0 0 0 0 9.546l62.049 62.048a6.75 6.75 0 0 0 9.546 0l14.319-14.318a6.75 6.75 0 0 0 0-9.546z" />
  </svg>
);
