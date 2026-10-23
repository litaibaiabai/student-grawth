FROM node:20-alpine AS builder

WORKDIR /app

# 安装后端依赖
COPY package*.json ./
RUN npm ci --only=production

# --- 生产镜像 ---
FROM node:20-alpine

WORKDIR /app

# 复制后端代码与依赖
COPY --from=builder /app/node_modules ./node_modules
COPY . .

EXPOSE 3000

CMD ["node", "app.js"]
