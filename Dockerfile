# 使用官方 Node.js 18 LTS 镜像作为基础镜像
FROM node:18-alpine AS base

# 安装 ts-node 和 typescript 全局依赖
RUN npm install -g ts-node typescript

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装项目依赖
RUN npm ci --only=production && npm cache clean --force

# 复制项目源代码
COPY . .

# 创建必要的目录
RUN mkdir -p /app/debug && \
    mkdir -p /app/accounts && \
    chmod +x /app/scripts/*.ts

# 设置环境变量
ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

# 暴露可能需要的端口（虽然这个项目不提供 web 服务）
# EXPOSE 3000

# 默认命令 - 保持容器运行但不执行任何脚本
CMD ["tail", "-f", "/dev/null"]

# 你也可以选择以下几种启动方式之一：
# 1. 直接执行主脚本（如果你想容器启动时自动执行）
# CMD ["npm", "run", "fetch-tweets"]

# 2. 或者使用 bash 保持容器活跃，便于外部调度
# CMD ["/bin/sh", "-c", "while true; do sleep 30; done"] 