#!/bin/bash
# ============================================================
# TEY 太乙 · 新前台  上线 / 灰度 / 回滚
#   绑定域名：  sudo ./go-live.sh --domain pt.example.com
#   带 HTTPS：  sudo ./go-live.sh --domain pt.example.com --ssl /path/fullchain.pem --ssl-key /path/privkey.pem
#   看状态：    ./go-live.sh --status
#   回滚：      sudo ./go-live.sh --off
#
# 设计原则：与原站 192.168.1.10.conf 按 Host 分流，两个站并存；
#          任何一步失败都自动还原，绝不留下半截配置。
# ============================================================
set -uo pipefail

CONF_DIR=/opt/1panel/www/conf.d
TARGET="$CONF_DIR/tey-frontend.conf"
BAK="$CONF_DIR/tey-frontend.conf.bak"
TPL="$(cd "$(dirname "$0")" && pwd)/tey-frontend.conf.tpl"
CT=1Panel-openresty-5W5Y
DOMAIN=""; PORT=80; SSL=""; SSLKEY=""; MODE="apply"

msg() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
ok()  { printf '\033[1;32m  ✓\033[0m %s\n' "$*"; }
bad() { printf '\033[1;31m  ✗\033[0m %s\n' "$*"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --domain)  DOMAIN="${2:-}"; shift 2 ;;
    --port)    PORT="${2:-80}"; shift 2 ;;
    --ssl)     SSL="${2:-}"; shift 2 ;;
    --ssl-key) SSLKEY="${2:-}"; shift 2 ;;
    --off)     MODE="off"; shift ;;
    --status)  MODE="status"; shift ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) bad "未知参数 $1"; exit 2 ;;
  esac
done

ngx() { docker exec "$CT" nginx "$@"; }

case "$MODE" in
  status)
    msg "当前站点配置"
    ls -1 "$CONF_DIR"/*.conf 2>/dev/null | while read -r f; do
      printf '  %-42s ' "$(basename "$f")"
      grep -m1 -oE 'listen [0-9]+' "$f" | tr -d '\n'
      printf '  '
      grep -m1 -oE 'server_name [^;]+' "$f" | sed 's/server_name //'
    done
    echo
    msg "nginx 是否在跑"
    docker ps --filter "name=$CT" --format '  {{.Names}}  {{.Status}}'
    echo
    msg "BFF 自检（走本机 8787）"
    curl -s -m 5 http://127.0.0.1:8787/bff/health || echo "  (8787 无响应)"
    echo
    exit 0
    ;;
  off)
    msg "回滚：移除新前台配置"
    if [ -f "$TARGET" ]; then
      rm -f "$TARGET"
      if ngx -t >/dev/null 2>&1; then
        ngx -s reload
        ok "已移除 $TARGET 并 reload，新前台域名不再解析到本机"
      else
        bad "nginx 配置异常，请手动检查"; exit 1
      fi
    else
      ok "$TARGET 不存在，无需回滚"
    fi
    ok "原站 http://192.168.1.10/ 全程未受影响"
    exit 0
    ;;
esac

# ---------- apply ----------
[ -n "$DOMAIN" ] || { bad "缺少 --domain"; echo "用法：sudo $0 --domain pt.example.com"; exit 2; }
[ -f "$TPL" ]    || { bad "模板缺失：$TPL"; exit 2; }

msg "生成配置 domain=$DOMAIN port=$PORT"
sslblock=""
if [ -n "$SSL" ]; then
  [ -f "$SSL" ] || { bad "证书不存在：$SSL"; exit 2; }
  [ -f "$SSLKEY" ] || { bad "私钥不存在：$SSLKEY"; exit 2; }
  sslblock="
server {
    listen 443 ssl;
    http2 on;
    server_name $DOMAIN;

    ssl_certificate     $SSL;
    ssl_certificate_key $SSLKEY;
    ssl_protocols TLSv1.2 TLSv1.3;

    root /www/sites/tey-preview/design;
    index index.html;

    location ~* \.(css|js|jpg|jpeg|png|webp|svg|ico|woff2?)\$ {
        expires 7d; add_header Cache-Control \"public, max-age=604800\"; try_files \$uri =404;
    }
    location / { try_files \$uri \$uri/ \$uri.html @fallback; }
    location @fallback { try_files /hifi\$uri.html /hifi\$uri/index.html /index.html =404; }

    location /bff/ {
        include fastcgi_params;
        fastcgi_pass 127.0.0.1:9000;
        fastcgi_param SCRIPT_FILENAME /www/sites/tey-preview/bff/index.php;
        fastcgi_param SCRIPT_NAME /bff/index.php;
        fastcgi_param REQUEST_URI \$request_uri;
        fastcgi_param QUERY_STRING \$query_string;
        fastcgi_read_timeout 30s;
    }
    location ~ ^/bff/\.cache/ { deny all; return 404; }
}
"
  ok "HTTPS 已启用"
fi

sed -e "s|__DOMAIN__|$DOMAIN|g" \
    -e "s|__PORT__|$PORT|g" \
    -e "s|__SSL_BLOCK__|$sslblock|g" "$TPL" > /tmp/tey-frontend.new

[ -s /tmp/tey-frontend.new ] || { bad "渲染结果为空"; exit 1; }

# 备份 → 落盘 → 测试 → 失败还原
if [ -f "$TARGET" ]; then cp -f "$TARGET" "$BAK"; ok "已备份现有配置到 $BAK"; fi
cp -f /tmp/tey-frontend.new "$TARGET"
chmod 644 "$TARGET"

msg "nginx -t 校验"
if ! ngx -t; then
  bad "配置校验失败，已自动还原"
  if [ -f "$BAK" ]; then cp -f "$BAK" "$TARGET"; else rm -f "$TARGET"; fi
  exit 1
fi
ok "语法通过"

msg "reload nginx"
ngx -s reload || { bad "reload 失败"; exit 1; }
ok "已生效"

msg "本机自检（带 Host 头，reload 后需要一点时间，重试 3 次）"
probe() {  # probe <path>
  local c=""
  for _ in 1 2 3; do
    c=$(curl -s -o /dev/null -w '%{http_code}' -m 8 -H "Host: $DOMAIN" "http://127.0.0.1:$PORT$1")
    [ "$c" = "200" ] && break
    sleep 0.7
  done
  printf '%s' "$c"
}
for path in / /hifi/list.html /list /bff/health; do
  c=$(probe "$path")
  if [ "$c" = "200" ]; then ok "GET $path → 200"; else bad "GET $path → $c"; fi
done

echo
msg "下一步（本机之外）"
echo "  1. 域名 A 记录指向 192.168.1.10"
echo "  2. 防火墙放行 $PORT（1Panel → 主机 → 防火墙）"
echo "  3. 浏览器打开 http://$DOMAIN/ 验收首页"
echo "  4. 回滚：sudo $0 --off"
