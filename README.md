# 模力笔记（MoliNotes）

> 个人碎片信息速查库：**存得快、找得快、复制得快**。
>
> 记录 URL / 项目路径 / 运行环境 / 命令 / 代码片段，围绕「秒存、秒找、秒复制」打造的单用户轻量工具。

## 功能特性

### 核心体验

- **一键复制**：卡片级一键复制内容，复制即用；侧边栏命令面板（`Ctrl+K`）全局搜索，`Enter` 直接复制命中项，`Shift+Enter` 进入单条目查看
- **搜索高亮**：搜索结果命中关键词使用琥珀黄荧光笔色高亮展示
- **复制热度**：卡片右上角白底药丸徽章显示复制次数，未复制过不显示；同内容 10 秒内重复复制仅计 1 次（服务端 + 前端双重去重防刷）
- **逐行复制**：多行条目（如命令序列）支持逐行独立复制，每行悬停显示单独复制按钮；收起态仅显示首行 + 「共 N 行」标签

### 条目管理

- **自动类型识别**：按内容启发式识别 URL / 路径 / 命令 / 代码 / 文本，类型图标可点击按类型筛选
- **来源系统**：预设 5 类来源（自研项目 / 朋友推荐 / 网站 / 文档 / 其他）+ 自定义来源；自定义来源支持 8 色板选色，未选色时按来源名 hash 自动配色；彩色徽章可点击按来源筛选
- **拖拽归夹**：按住卡片标题即可拖拽到侧边栏任意文件夹或「未分类」，目标高亮、松手 toast 反馈、计数即时刷新（移动端走编辑弹窗兜底）
- **置顶**：常用条目一键置顶

### 文件夹

- **多级层级**：文件夹无限嵌套，拖拽调整层级；拖到树空白处移到顶层
- **即时计数**：侧边栏实时显示各文件夹条目数

### 回收站

- **两段式删除**：删除即软删，进「最近删除」管理视图，可一键恢复；彻底删除需二次确认（自定义系统级弹窗）
- **管理表格**：条目 / 删除时间列排序、斑马纹、hover 高亮、按风险等级区分的按钮 hover 色

### 数据备份

- **导出 / 导入**：侧边栏一键导出全量 JSON 备份，导入时校验格式并按 id 覆盖合并，支持跨环境数据迁移

### 视觉与体验

- **亮 / 暗双主题**：一键切换，全站适配
- **品牌定制**：「模力笔记」品牌 LOGO + 阿里妈妈方圆体（免费商用可变字体），侧边栏底部显示「<昵称>的速查库」身份文案
- **PWA**：可安装到桌面 / 主屏幕；静态资源 cache-first、页面导航 network-first、API 永不缓存；iOS 图标适配
- **响应式**：移动端汉堡抽屉侧边栏、iPhone 安全区适配、卡片信息移动端重排
- **悬停提示**：全站 Tip 气泡提示，贴边自动对齐，触屏自动隐藏

## 技术栈

| 分类 | 选型 |
|------|------|
| 框架 | Next.js 16（App Router + Turbopack） |
| 前端 | React 19 + TypeScript + Tailwind CSS v4 |
| 数据库 | PostgreSQL（postgres.js 驱动） |
| 线上数据库 | Neon（serverless Postgres） |
| 本地数据库 | Docker 容器（postgres:16） |
| 认证 | 单用户密码 + HMAC 签名会话 Cookie |
| 部署 | Vercel |
| 字体 | 阿里妈妈方圆体 VF + Geist Mono |

## 本地开发

### 1. 启动数据库（Docker）

```bash
docker run -d --name moli-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=moli123 -e POSTGRES_DB=moli \
  -v moli-pg-data:/var/lib/postgresql/data \
  postgres:16
```

- 数据存于持久卷 `moli-pg-data`，删除容器重建不丢数据
- 日常启停：`docker start moli-pg` / `docker stop moli-pg`，也可在 Docker Desktop 中可视化管理
- 国内拉取镜像超时可走镜像站：`docker pull docker.m.daocloud.io/library/postgres:16` 后打 tag

### 2. 配置环境变量

项目根目录创建 `.env.local`（已被 gitignore，不会提交）：

```bash
MOLINOTES_PASSWORD=moli123          # 登录密码
MOLINOTES_OWNER=模力                # 侧边栏身份昵称（可选）
POSTGRES_URL=postgresql://postgres:moli123@localhost:5432/moli
```

### 3. 启动开发服务器

```bash
npm install   # 首次
npm run dev
```

打开 http://localhost:3000 。数据库表会在首次请求时自动创建（幂等），空库可直接启动。

## 部署上线（Vercel + Neon）

以下为已完成并验证通过的完整上线流程：

### 1. 推送代码到 GitHub

```bash
git remote add origin https://github.com/<你的用户名>/moli-notes.git
git push -u origin master
```

### 2. 创建 Neon 数据库

1. 登录 [neon.tech](https://neon.tech)（支持 GitHub 账号授权）
2. 创建项目：Region 选 **Singapore**（离国内最近）
3. 复制 **Pooled connection** 连接串（host 带 `-pooler`，走连接池，适合 serverless），形如：
   ```
   postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
   ```
4. 无需手动建表，应用首次请求自动建表

### 3. Vercel 导入部署

1. 登录 [vercel.com](https://vercel.com)（GitHub 授权）→ **Add New → Project** → Import `moli-notes`
2. 在 **Environment Variables** 添加 3 个变量（环境勾选 Production and Preview）：

   | Name | Value | 说明 |
   |------|-------|------|
   | `POSTGRES_URL` | Neon 连接串 | 数据库 |
   | `MOLINOTES_PASSWORD` | 强密码 | 线上登录密码 |
   | `MOLINOTES_OWNER` | 昵称 | 侧边栏身份显示 |

3. 其他保持默认 → **Deploy**，1~2 分钟完成构建
4. 验证：访问分配的 `*.vercel.app` 域名 → 登录 → 建文件夹/条目 → 复制；或在 Neon 控制台查看数据已写入

### 4. 绑定自定义域名

> `*.vercel.app` 默认域名在国内基本不可用，需绑定自有域名。

1. Vercel 项目 → **Domains** → **Add Existing** → 输入域名（建议用子域名，如 `moli.example.com`，不影响主站解析）
2. 到域名 DNS 管理处添加解析记录：

   | 记录类型 | 主机记录 | 记录值 |
   |----------|----------|--------|
   | CNAME | `moli` | Vercel 面板给出的**项目专属**解析值（形如 `xxxx.vercel-dns-017.com`，以面板复制为准） |

   - 腾讯云 DNSPod：域名解析 → 添加记录 → 主机记录填子域名前缀，TTL 默认
   - Cloudflare：代理状态须关闭（灰色云朵，DNS only），否则与证书签发冲突

3. 等待 DNS 生效（几分钟到十几分钟），Vercel Domains 页状态变绿勾 **Valid Configuration**，HTTPS 证书自动签发
4. 若状态为 **DNS Change Recommended**（橙色警告），表示仍在用旧版通用解析值（`cname.vercel-dns.com` / `76.76.21.21`），功能可用但建议按面板提示更新为项目专属值

### 5. 数据迁移（可选）

线上为空库，与本地数据相互独立。如需迁移：

1. 本地应用侧边栏 →「导出备份」下载 JSON
2. 线上应用侧边栏 →「导入恢复」上传该 JSON，按 id 覆盖合并

### 运维备忘

- 修改环境变量后需在 Vercel 重新部署才生效
- 排错入口：构建问题看 **Deployments → Build Logs**，运行时报错看 **Runtime Logs**
- 本地 `npm run dev` 连接本地 Docker Postgres；若需连接线上库，把 Neon 连接串写入 `.env.local` 的 `POSTGRES_URL`（建议在 Neon 建 dev 分支隔离数据）
- Next 16 dev 注意：修改 `lib/db.ts` 等模块级缓存逻辑后需重启 dev server；偶发样式/产物不更新时删除 `.next` 缓存重启

## 环境变量一览

| 变量 | 必填 | 说明 |
|------|------|------|
| `POSTGRES_URL` | 是 | PostgreSQL 连接串（本地 Docker 或 Neon） |
| `MOLINOTES_PASSWORD` | 是 | 单用户登录密码 |
| `MOLINOTES_OWNER` | 否 | 侧边栏身份昵称，未配置回退显示版本号 |
| `MOLINOTES_SECRET` | 否 | 会话签名密钥，默认由密码派生 |
| `MOLINOTES_DATA_DIR` | 否 | 本地旧版 SQLite 数据目录（现已迁移 Postgres，保留兼容） |

## License

个人使用项目。
