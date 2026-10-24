# 模力笔记 生产镜像（Zeabur 自动识别 Dockerfile 构建）
FROM node:22-slim
WORKDIR /app

# 先装依赖，利用层缓存
COPY package.json package-lock.json ./
RUN npm ci

# 拷贝源码并构建
COPY . .
RUN npm run build

# /data 为持久卷挂载点（better-sqlite3 数据库文件写在这里）
ENV NODE_ENV=production \
    MOLINOTES_DATA_DIR=/data \
    PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
