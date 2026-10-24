import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "模力笔记 · 碎片信息速查库",
    short_name: "模力笔记",
    description: "记录地址、项目路径、运行环境等零碎信息，随时快速查阅和复制",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#4b3fe3",
    icons: [
      {
        src: "/logo.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
