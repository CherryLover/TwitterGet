# Docker 部署使用说明

## 项目概述
这是一个 Twitter 推文获取脚本项目，设计用于通过外部定时任务调度执行，不提供 Web 服务接口。

## 快速开始

### 1. 准备环境变量
```bash
# 复制环境变量模板
cp env.example .env

# 编辑环境变量文件，填入你的配置
nano .env
```

### 2. 构建 Docker 镜像
```bash
# 构建镜像
docker build -t twitter-get:latest .

# 或使用 docker-compose 构建
docker-compose build
```

### 3. 启动容器
```bash
# 使用 docker-compose 启动（推荐）
docker-compose up -d

# 或使用 docker run 启动
docker run -d \
  --name twitter-get-scripts \
  --env-file .env \
  -v $(pwd)/accounts:/app/accounts:ro \
  -v $(pwd)/debug:/app/debug \
  twitter-get:latest
```

## 执行脚本

### 方法1: 通过 docker exec 执行
```bash
# 执行获取推文脚本
docker exec twitter-get-scripts npm run fetch-tweets

# 执行用户刷新脚本
docker exec twitter-get-scripts npm run refresh-users

# 执行推文分析脚本
docker exec twitter-get-scripts npm run analyze-tweet
```

### 方法2: 创建外部定时脚本
创建一个 shell 脚本 `cron-fetch-tweets.sh`：
```bash
#!/bin/bash
# 获取推文的定时脚本

echo "$(date): 开始执行推文获取任务"

# 执行推文获取
docker exec twitter-get-scripts npm run fetch-tweets

if [ $? -eq 0 ]; then
    echo "$(date): 推文获取任务执行成功"
else
    echo "$(date): 推文获取任务执行失败"
fi
```

### 方法3: 系统 Crontab 配置
编辑 crontab：
```bash
crontab -e
```

添加定时任务：
```cron
# 每小时执行一次推文获取
0 * * * * /path/to/your/cron-fetch-tweets.sh >> /var/log/twitter-get.log 2>&1

# 每天凌晨2点执行用户刷新
0 2 * * * docker exec twitter-get-scripts npm run refresh-users >> /var/log/twitter-refresh.log 2>&1
```

## 容器管理

### 查看容器状态
```bash
docker-compose ps
# 或
docker ps | grep twitter-get
```

### 查看容器日志
```bash
docker-compose logs -f twitter-get
# 或
docker logs -f twitter-get-scripts
```

### 停止容器
```bash
docker-compose down
# 或
docker stop twitter-get-scripts
```

### 重启容器
```bash
docker-compose restart
# 或
docker restart twitter-get-scripts
```

## 数据持久化

容器挂载了以下目录：
- `./accounts` -> `/app/accounts` (只读) - 账户配置文件
- `./debug` -> `/app/debug` - 调试输出目录
- `./dev-accounts.json` -> `/app/dev-accounts.json` (只读) - 开发账户配置

## 监控和调试

### 进入容器调试
```bash
docker exec -it twitter-get-scripts /bin/sh
```

### 查看调试文件
调试文件会保存在 `./debug` 目录中，可以直接在宿主机查看。

### 开启调试模式
在 `.env` 文件中设置：
```
DEBUG=true
```

## 环境变量说明

| 变量名 | 必需 | 说明 |
|--------|------|------|
| SUPABASE_URL | 是 | Supabase 项目 URL |
| SUPABASE_ANON_KEY | 是 | Supabase 匿名密钥 |
| SUPABASE_KEY | 否 | Supabase 服务角色密钥 |
| DEBUG | 否 | 调试模式，默认 false |
| USER_LIMIT | 否 | 处理用户数量限制，默认 100 |
| TZ | 否 | 时区设置，默认 Asia/Shanghai |

## 故障排除

### 常见问题
1. **容器启动失败**: 检查环境变量是否正确配置
2. **脚本执行失败**: 查看容器日志，检查网络连接和 Supabase 配置
3. **权限问题**: 确保挂载的目录有正确的读写权限

### 清理资源
```bash
# 停止并删除容器
docker-compose down

# 删除镜像
docker rmi twitter-get:latest

# 清理未使用的 Docker 资源
docker system prune
``` 