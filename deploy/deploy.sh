#!/usr/bin/env bash
# ==============================================================================
# 六育学生成长评价系统 - 自动化一键部署脚本
#
# 功能说明：
# 1. 本地编译 React (Vite) 前端
# 2. 整合前端产物到后端 dist 静态目录并打包
# 3. 自动化 SSH/SCP 上传至目标服务器
# 4. 服务器端解压、安装生产依赖、执行数据库迁移与种子数据初始化
# 5. 配置并启动 Nginx 反向代理与 PM2 进程守护
# ==============================================================================

set -o pipefail

# 终端颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

# ==============================================================================
# 1. 自动定位 deploy 目录
# ==============================================================================

LOCAL_DEPLOY_CONF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ENV_FILE="${LOCAL_DEPLOY_CONF}/.env"
BACKEND_ENV_FILE="${LOCAL_DEPLOY_CONF}/backend.env"

echo -e "${CYAN}==================================================${RESET}"
echo -e "${CYAN} 六育学生成长评价系统 - 自动部署${RESET}"
echo -e "${CYAN}==================================================${RESET}"
echo -e "${YELLOW}部署配置目录：${LOCAL_DEPLOY_CONF}${RESET}"

# ==============================================================================
# 2. 检查部署配置文件 deploy/.env
# ==============================================================================

if [ ! -f "${DEPLOY_ENV_FILE}" ]; then
    echo -e "${RED}错误：未找到部署配置文件：${DEPLOY_ENV_FILE}${RESET}"
    if [ -f "${LOCAL_DEPLOY_CONF}/.env.example" ]; then
        cp "${LOCAL_DEPLOY_CONF}/.env.example" "${DEPLOY_ENV_FILE}"
        chmod 600 "${DEPLOY_ENV_FILE}"
        echo -e "${YELLOW}已自动从模板创建：${DEPLOY_ENV_FILE}${RESET}"
        echo -e "${YELLOW}请填写服务器 IP、SSH 密码等配置后重新运行。${RESET}"
    fi
    exit 1
fi

# ==============================================================================
# 3. 检查后端运行环境配置 backend.env
# ==============================================================================

if [ ! -f "${BACKEND_ENV_FILE}" ]; then
    echo -e "${RED}错误：未找到后端生产配置文件：${BACKEND_ENV_FILE}${RESET}"
    if [ -f "${LOCAL_DEPLOY_CONF}/backend.env.example" ]; then
        cp "${LOCAL_DEPLOY_CONF}/backend.env.example" "${BACKEND_ENV_FILE}"
        chmod 600 "${BACKEND_ENV_FILE}"
        echo -e "${YELLOW}已自动从模板创建：${BACKEND_ENV_FILE}${RESET}"
        echo -e "${YELLOW}请确认数据库密码等生产环境配置后重新执行。${RESET}"
    fi
    exit 1
fi

# ==============================================================================
# 4. 设置本地敏感配置文件权限
# ==============================================================================

chmod 600 "${DEPLOY_ENV_FILE}"
chmod 600 "${BACKEND_ENV_FILE}"

# ==============================================================================
# 5. 加载本地部署配置
# ==============================================================================

set -a
source "${DEPLOY_ENV_FILE}"
set +a

echo -e "${GREEN}✔ 已加载本地部署配置 deploy/.env${RESET}"

# ==============================================================================
# 6. 校验与定位本地项目根目录
# ==============================================================================

if [ -z "${LOCAL_PROJECT_PATH}" ] || [ ! -d "${LOCAL_PROJECT_PATH}" ]; then
    if [ -d "${LOCAL_DEPLOY_CONF}/../frontend" ] && [ -d "${LOCAL_DEPLOY_CONF}/../backend" ]; then
        LOCAL_PROJECT_PATH="$(cd "${LOCAL_DEPLOY_CONF}/.." && pwd)"
        echo -e "${YELLOW}自动定位项目根目录：${LOCAL_PROJECT_PATH}${RESET}"
    else
        echo -e "${RED}错误：无法定位项目目录，缺少 frontend 或 backend。${RESET}"
        exit 1
    fi
fi

if [ ! -d "${LOCAL_PROJECT_PATH}/frontend" ]; then
    echo -e "${RED}错误：未找到 frontend 目录：${LOCAL_PROJECT_PATH}/frontend${RESET}"
    exit 1
fi

if [ ! -d "${LOCAL_PROJECT_PATH}/backend" ]; then
    echo -e "${RED}错误：未找到 backend 目录：${LOCAL_PROJECT_PATH}/backend${RESET}"
    exit 1
fi

# ==============================================================================
# 7. 校验服务器参数
# ==============================================================================

if [ -z "${SERVER_IP}" ] || [ "${SERVER_IP}" = "12.34.56.78" ]; then
    echo -e "${RED}错误：请在 deploy/.env 中配置正确的 SERVER_IP。${RESET}"
    exit 1
fi

if [ -z "${SERVER_PASS}" ] || [ "${SERVER_PASS}" = "YourServerPasswordHere" ]; then
    echo -e "${RED}错误：请在 deploy/.env 中配置正确的 SERVER_PASS。${RESET}"
    exit 1
fi

SERVER_USER=${SERVER_USER:-"root"}
SERVER_PATH=${SERVER_PATH:-"/usr/local/student_growth"}
DOMAIN=${DOMAIN:-""}

echo ""
echo -e "${CYAN}==================================================${RESET}"
echo -e "${YELLOW}本地项目路径：${LOCAL_PROJECT_PATH}${RESET}"
echo -e "${YELLOW}目标服务器　：${SERVER_USER}@${SERVER_IP}${RESET}"
echo -e "${YELLOW}服务器部署目录：${SERVER_PATH}${RESET}"
if [ -n "${DOMAIN}" ]; then
    echo -e "${YELLOW}配置域名　　：${DOMAIN}${RESET}"
else
    echo -e "${YELLOW}访问方式　　：IP 直连 (http://${SERVER_IP})${RESET}"
fi
echo -e "${CYAN}==================================================${RESET}"

# ==============================================================================
# 8. 安全检查 backend.env（防止部署机私密变量泄露）
# ==============================================================================

echo ""
echo -e "${CYAN}正在执行环境变量安全检查...${RESET}"

FORBIDDEN_BACKEND_KEYS=(
    "SERVER_PASS"
    "LOCAL_PROJECT_PATH"
    "SSHPASS"
)

for key in "${FORBIDDEN_BACKEND_KEYS[@]}"; do
    if grep -Eq "^[[:space:]]*${key}[[:space:]]*=" "${BACKEND_ENV_FILE}"; then
        echo -e "${RED}安全错误：backend.env 中禁止包含部署机变量：${key}${RESET}"
        exit 1
    fi
done

echo -e "${GREEN}✔ backend.env 安全检查通过。${RESET}"

# ==============================================================================
# 9. 检查并准备 sshpass 自动认证工具
# ==============================================================================

echo ""
echo -e "${CYAN}正在检查 SSH 自动认证环境...${RESET}"

if ! command -v sshpass >/dev/null 2>&1; then
    echo -e "${YELLOW}未检测到 sshpass，正在尝试通过 brew 自动安装...${RESET}"
    if command -v brew >/dev/null 2>&1; then
        brew install hudochenkov/sshpass/sshpass
        if [ $? -ne 0 ]; then
            echo -e "${RED}错误：sshpass 安装失败，请手动执行：brew install hudochenkov/sshpass/sshpass${RESET}"
            exit 1
        fi
    else
        echo -e "${RED}错误：未找到 sshpass 工具且未安装 Homebrew，请手动安装 sshpass 后重试。${RESET}"
        exit 1
    fi
fi

export SSHPASS="${SERVER_PASS}"

SSH_MUX_DIR="/tmp/ssh_mux_$$"
mkdir -p "${SSH_MUX_DIR}" 2>/dev/null || true
chmod 700 "${SSH_MUX_DIR}" 2>/dev/null || true
SSH_SOCKET="${SSH_MUX_DIR}/mux_%h_%p_%r"

# 启用 ControlMaster 连接复用：
# 只在首次连接时认证一次，后续所有 SSH/SCP 直接复用已认证的 Unix Socket 通道，
# 彻底杜绝因频繁重复认证触发云服务器防暴力破解 / 拒绝密码认证 (Permission denied) 的问题。
SSH_OPTIONS=(
    -o StrictHostKeyChecking=accept-new
    -o PreferredAuthentications=password
    -o PubkeyAuthentication=no
    -o NumberOfPasswordPrompts=1
    -o ConnectTimeout=15
    -o ServerAliveInterval=15
    -o ServerAliveCountMax=3
    -o ControlMaster=auto
    -o ControlPath="${SSH_SOCKET}"
    -o ControlPersist=10m
)

run_ssh() {
    local cmd="$1"
    local max_retries=2
    local attempt=1
    local result=0

    while [ ${attempt} -le ${max_retries} ]; do
        sshpass -e ssh "${SSH_OPTIONS[@]}" "${SERVER_USER}@${SERVER_IP}" "${cmd}"
        result=$?
        if [ ${result} -eq 0 ]; then
            return 0
        fi
        if [ ${attempt} -lt ${max_retries} ]; then
            echo -e "${YELLOW}SSH 连接短暂异常 (code: ${result})，等待 2 秒后自动重试 (${attempt}/${max_retries})...${RESET}"
            sleep 2
        fi
        attempt=$((attempt + 1))
    done

    echo ""
    echo -e "${RED}错误：SSH 远程命令执行失败 (code: ${result})${RESET}"
    cleanup_sensitive_vars
    exit ${result}
}

run_scp() {
    local src="$1"
    local dest="$2"
    local max_retries=2
    local attempt=1
    local result=0

    while [ ${attempt} -le ${max_retries} ]; do
        sshpass -e scp "${SSH_OPTIONS[@]}" "${src}" "${SERVER_USER}@${SERVER_IP}:${dest}"
        result=$?
        if [ ${result} -eq 0 ]; then
            return 0
        fi
        if [ ${attempt} -lt ${max_retries} ]; then
            echo -e "${YELLOW}SCP 上传短暂异常 (code: ${result})，等待 2 秒后自动重试 (${attempt}/${max_retries})...${RESET}"
            sleep 2
        fi
        attempt=$((attempt + 1))
    done

    echo ""
    echo -e "${RED}错误：SCP 文件上传失败 (code: ${result})${RESET}"
    cleanup_sensitive_vars
    exit ${result}
}

cleanup_sensitive_vars() {
    ssh -O exit -o ControlPath="${SSH_SOCKET}" "${SERVER_USER}@${SERVER_IP}" >/dev/null 2>&1 || true
    rm -rf "${SSH_MUX_DIR}" >/dev/null 2>&1 || true
    unset SSHPASS
    unset SERVER_PASS
}
trap cleanup_sensitive_vars EXIT INT TERM

# ==============================================================================
# 10. 测试 SSH 自动连通性
# ==============================================================================

echo ""
echo -e "${CYAN}正在测试服务器 SSH 连通性...${RESET}"
run_ssh "echo SSH_CONNECTION_OK"
echo -e "${GREEN}✔ SSH 自动登录测试成功。${RESET}"

# ==============================================================================
# [1/5] 编译前端 React (Vite)
# ==============================================================================

echo ""
echo -e "${CYAN}[1/5] 本地前端构建 (React + Vite)...${RESET}"

cd "${LOCAL_PROJECT_PATH}/frontend" || exit 1

if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}前端依赖未安装，正在执行 npm install...${RESET}"
    npm install --include=dev --registry=https://registry.npmmirror.com
    if [ $? -ne 0 ]; then
        echo -e "${RED}错误：前端 npm install 失败。${RESET}"
        exit 1
    fi
fi

VITE_API_SERVER="" npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}错误：前端构建 npm run build 失败。${RESET}"
    exit 1
fi

if [ ! -d "${LOCAL_PROJECT_PATH}/frontend/dist" ] || [ ! -f "${LOCAL_PROJECT_PATH}/frontend/dist/index.html" ]; then
    echo -e "${RED}错误：未找到有效的前端构建产物 frontend/dist/index.html。${RESET}"
    exit 1
fi

echo -e "${GREEN}✔ 前端构建完成，产物目录：frontend/dist${RESET}"

# ==============================================================================
# [2/5] 整合静态资源并打包后端与 SQL 脚本
# ==============================================================================

echo ""
echo -e "${CYAN}[2/5] 整合静态资源并构建后端程序包...${RESET}"

cd "${LOCAL_PROJECT_PATH}" || exit 1

# 清理并创建 backend/dist
rm -rf backend/dist
mkdir -p backend/dist

# 复制前端编译产物进入 backend/dist
cp -R frontend/dist/. backend/dist/
if [ $? -ne 0 ]; then
    echo -e "${RED}错误：复制前端资源到 backend/dist 失败。${RESET}"
    rm -rf backend/dist
    exit 1
fi

# 构建 zip 压缩包（包含 backend 和 sql 目录，排除无关文件与本地敏感配置）
rm -f backend.zip

zip -q -r backend.zip backend sql \
    -x "backend/node_modules/*" \
       "backend/temp/*" \
       "backend/tests/*" \
       "backend/__tests__/*" \
       "backend/.env" \
       "backend/.env.*" \
       "backend/*.log" \
       "*.log" \
       "backend/.git/*" \
       "backend/.DS_Store" \
       "sql/.DS_Store"

if [ $? -ne 0 ]; then
    echo -e "${RED}错误：构建 backend.zip 失败。${RESET}"
    rm -rf backend/dist
    exit 1
fi

echo -e "${GREEN}✔ backend.zip 构建成功 (包含后端源码、前端产物及数据库脚本)。${RESET}"

# 清理本地临时 backend/dist
rm -rf backend/dist
echo -e "${GREEN}✔ 本地临时目录 backend/dist 已清理。${RESET}"

# ==============================================================================
# [3/5] 上传部署包与服务配置文件
# ==============================================================================

echo ""
echo -e "${CYAN}[3/5] 正在上传部署文件至服务器...${RESET}"

# 创建服务器部署目录
run_ssh "
mkdir -p '${SERVER_PATH}'
mkdir -p '${SERVER_PATH}/logs'
mkdir -p '${SERVER_PATH}/backend'
"

# 1. 上传程序包
echo -e "${YELLOW}上传 backend.zip...${RESET}"
run_scp "${LOCAL_PROJECT_PATH}/backend.zip" "${SERVER_PATH}/backend.zip"

# 2. 上传后端生产环境变量 backend.env
echo -e "${YELLOW}上传后端生产配置文件 backend.env...${RESET}"
run_scp "${BACKEND_ENV_FILE}" "${SERVER_PATH}/backend/.env"

# 3. 上传 PM2 配置
if [ ! -f "${LOCAL_DEPLOY_CONF}/ecosystem.config.js" ]; then
    echo -e "${RED}错误：缺少 deploy/ecosystem.config.js。${RESET}"
    rm -f "${LOCAL_PROJECT_PATH}/backend.zip"
    exit 1
fi
echo -e "${YELLOW}上传 ecosystem.config.js...${RESET}"
run_scp "${LOCAL_DEPLOY_CONF}/ecosystem.config.js" "${SERVER_PATH}/ecosystem.config.js"

# 4. 上传 Nginx 配置模板
if [ ! -f "${LOCAL_DEPLOY_CONF}/nginx/student_growth.conf.template" ]; then
    echo -e "${RED}错误：缺少 deploy/nginx/student_growth.conf.template。${RESET}"
    rm -f "${LOCAL_PROJECT_PATH}/backend.zip"
    exit 1
fi
echo -e "${YELLOW}上传 student_growth.conf.template...${RESET}"
run_scp "${LOCAL_DEPLOY_CONF}/nginx/student_growth.conf.template" "${SERVER_PATH}/student_growth.conf.template"

# 删除本地临时压缩包
rm -f "${LOCAL_PROJECT_PATH}/backend.zip"
echo -e "${GREEN}✔ 所有部署文件已成功上传至服务器。${RESET}"

# ==============================================================================
# [4/5] 服务器端解压、依赖安装与数据库迁移
# ==============================================================================

echo ""
echo -e "${CYAN}[4/5] 服务器端解包、安装依赖及执行数据库迁移...${RESET}"

remote_setup_cmd="
set -e

cd '${SERVER_PATH}'

# 确保 unzip 命令可用
if ! command -v unzip >/dev/null 2>&1; then
    echo '正在自动安装 unzip...'
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update -y && apt-get install -y unzip
    elif command -v yum >/dev/null 2>&1; then
        yum install -y unzip
    elif command -v dnf >/dev/null 2>&1; then
        dnf install -y unzip
    fi
fi

echo '正在解压程序包...'
if command -v unzip >/dev/null 2>&1; then
    unzip -q -o backend.zip
elif command -v python3 >/dev/null 2>&1; then
    python3 -m zipfile -e backend.zip .
else
    echo '错误：服务器未找到解压工具。'
    exit 1
fi

# 保护环境变量文件权限
chmod 600 '${SERVER_PATH}/backend/.env'

cd '${SERVER_PATH}/backend'

echo '正在安装 Node.js 生产依赖...'
npm install --omit=dev --registry=https://registry.npmmirror.com

echo '正在执行数据库迁移与种子数据初始化...'
set -a
. '${SERVER_PATH}/backend/.env'
set +a

node '${SERVER_PATH}/backend/scripts/runMigrations.js'

echo '数据库迁移与初始化完成。'
"

run_ssh "${remote_setup_cmd}"
echo -e "${GREEN}✔ 服务器依赖与数据库迁移完成。${RESET}"

# ==============================================================================
# [5/5] 配置 Nginx 与 PM2 守护进程
# ==============================================================================

echo ""
echo -e "${CYAN}[5/5] 正在配置 Nginx 与启动 PM2 服务...${RESET}"

# 处理域名：未配置域名时使用 '_'
SERVER_DOMAIN="${DOMAIN}"
if [ -z "${SERVER_DOMAIN}" ]; then
    SERVER_DOMAIN="_"
fi

# 获取后端服务端口（优先从 backend.env 中读取，默认 9000）
BACKEND_PORT=$(grep -E "^[[:space:]]*PORT[[:space:]]*=" "${BACKEND_ENV_FILE}" 2>/dev/null | head -n 1 | cut -d '=' -f2 | tr -d ' "\r\n')
BACKEND_PORT=${BACKEND_PORT:-9000}

remote_start_cmd="
set -e

# 确保 Nginx 已安装
if ! command -v nginx >/dev/null 2>&1; then
    echo '检测到服务器未安装 Nginx，正在自动安装...'
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update -y && apt-get install -y nginx
    elif command -v yum >/dev/null 2>&1; then
        yum install -y nginx
    elif command -v dnf >/dev/null 2>&1; then
        dnf install -y nginx
    fi
fi

# 生成 Nginx 站点配置
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
sed -e 's#__DOMAIN__#'\"${SERVER_DOMAIN}\"'#g' \\
    -e 's#__SERVER_PATH__#'\"${SERVER_PATH}\"'#g' \\
    -e 's#__BACKEND_PORT__#'\"${BACKEND_PORT}\"'#g' \\
    '${SERVER_PATH}/student_growth.conf.template' \\
    > /etc/nginx/sites-available/student_growth.conf

ln -sf /etc/nginx/sites-available/student_growth.conf /etc/nginx/sites-enabled/student_growth.conf

# 测试并重载 Nginx
nginx -t
systemctl is-enabled nginx >/dev/null 2>&1 || systemctl enable nginx
systemctl reload nginx || systemctl restart nginx
echo 'Nginx 配置就绪并已重载。'

# 启动 / 重启 PM2 进程
cd '${SERVER_PATH}'

# 停止或清理旧进程名
pm2 delete student-growth-backend 2>/dev/null || true

# 启动服务
pm2 start ecosystem.config.js
pm2 save

# 设置 PM2 开机自启
PM2_STARTUP_CMD=\$(pm2 startup 2>/dev/null | grep 'sudo env' | tail -n 1)
if [ -n \"\$PM2_STARTUP_CMD\" ]; then
    eval \"\$PM2_STARTUP_CMD\" || true
fi
pm2 save

# 确保 MySQL 服务自启
systemctl enable mysql 2>/dev/null || systemctl enable mariadb 2>/dev/null || true

# 再次锁定权限
chmod 600 '${SERVER_PATH}/backend/.env'

# 删除服务器端临时压缩包与模板
rm -f '${SERVER_PATH}/backend.zip'
rm -f '${SERVER_PATH}/student_growth.conf.template'

echo '=================================================='
echo 'PM2 运行状态：'
pm2 status student-growth-backend
"

run_ssh "${remote_start_cmd}"

# ==============================================================================
# 部署完成
# ==============================================================================

echo ""
echo -e "${GREEN}==================================================${RESET}"
echo -e "${GREEN}✔ 六育学生成长评价系统 部署完成！${RESET}"
echo -e "${GREEN}==================================================${RESET}"
echo ""
if [ -n "${DOMAIN}" ]; then
    echo -e "${GREEN}访问地址：http://${DOMAIN} (或 http://${SERVER_IP})${RESET}"
else
    echo -e "${GREEN}访问地址：http://${SERVER_IP}${RESET}"
fi
echo -e "${GREEN}服务器　：${SERVER_USER}@${SERVER_IP}${RESET}"
echo -e "${GREEN}部署目录：${SERVER_PATH}${RESET}"
echo ""
echo -e "${GREEN}安全与运行状态：${RESET}"
echo -e "${GREEN}✔ deploy/.env 未上传服务器${RESET}"
echo -e "${GREEN}✔ 服务器 backend/.env 权限：600${RESET}"
echo -e "${GREEN}✔ Nginx 反向代理配置成功 (/api -> ${BACKEND_PORT}, 静态资源带 SPA 回退)${RESET}"
echo -e "${GREEN}✔ PM2 进程 student-growth-backend 守护运行中${RESET}"
echo -e "${GREEN}==================================================${RESET}"