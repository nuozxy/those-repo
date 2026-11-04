#!/usr/bin/env bash
# 打包 API 前台为可上传的 tar.gz（dist + 配置片段 + 说明）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
API="$ROOT/api-ui"
OUT="$ROOT/deploy/api-frontend/out"
STAMP="$(date +%Y%m%d-%H%M)"
NAME="those-api-frontend-$STAMP"

cd "$API"
[ -d node_modules ] || npm install
npm run build >/dev/null

rm -rf "$OUT/$NAME" && mkdir -p "$OUT/$NAME"
cp -r dist/. "$OUT/$NAME/"
cp "$ROOT/deploy/api-frontend/nginx-spa.conf" "$OUT/$NAME/nginx-spa.conf.txt"
cp "$ROOT/docs/1Panel-API前端部署.md" "$OUT/$NAME/部署说明.md"
mkdir -p "$OUT/$NAME/.meta" && cp "$API/README.md" "$OUT/$NAME/.meta/README.md"
mkdir -p "$OUT/$NAME/optional/image-proxy" && cp "$ROOT/deploy/image-proxy/img.php" "$OUT/$NAME/optional/image-proxy/img.php"

mkdir -p "$OUT"
tar -czf "$OUT/$NAME.tar.gz" -C "$OUT/$NAME" .
rm -rf "$OUT/$NAME"
ls -lh "$OUT/$NAME.tar.gz"
echo "打包完成：deploy/api-frontend/out/$NAME.tar.gz"
