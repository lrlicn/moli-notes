// 一次性脚本：生成 iOS apple-touch-icon（品牌紫底 + 白色 logo）
import fs from "node:fs";
import sharp from "sharp";

const svg = fs.readFileSync("public/logo.svg", "utf8").replaceAll('fill="#4b3fe3"', 'fill="#ffffff"');
const logoPng = await sharp(Buffer.from(svg)).resize(180, 180).png().toBuffer();
const out = await sharp({ create: { width: 180, height: 180, channels: 4, background: "#4b3fe3" } })
  .composite([{ input: logoPng, blend: "over" }])
  .png()
  .toFile("public/apple-touch-icon.png");
console.log("ok", `${out.width}x${out.height}`, `${Math.round(out.size / 1024)}KB`);
