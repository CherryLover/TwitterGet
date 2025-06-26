# 使用官方 Node.js 18 LTS 镜像作为基础镜像
FROM node:18-alpine AS base

# 安装必要的系统依赖，并添加 cron
RUN apk add --no-cache curl bash dcron

# 安装 Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# 安装 ts-node 和 typescript 全局依赖
RUN npm install -g ts-node typescript

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装项目依赖
# 注意：这里我们使用 npm install 而不是 npm ci，因为 bun.lockb 可能与 npm ci 不兼容
# 如果你的依赖是固定的，可以换回 npm ci
RUN npm install && npm cache clean --force

# 复制项目源代码
COPY . .

# 复制 crontab 文件并设置权限
COPY crontab /etc/cron.d/crontab
RUN chmod 0644 /etc/cron.d/crontab

# 创建必要的目录
RUN mkdir -p /app/debug && \
    mkdir -p /app/accounts && \
    chmod +x /app/scripts/*.ts

# 设置环境变量
ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

# 启动 cron 守护进程并保持容器前台运行
CMD ["sh", "-c", "crond -f & tail -f /dev/null"] 