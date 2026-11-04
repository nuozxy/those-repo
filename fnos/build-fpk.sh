#!/usr/bin/env bash
# ============================================================
# Those · fnOS 一键出包
#   源码 → 前端构建 → 同步进应用工程 → fnpack 打包 → those-<版本>.fpk
#
# 用法：
#   bash fnos/build-fpk.sh                    # 完整出包（会重新构建前端）
#   bash fnos/build-fpk.sh --skip-web         # 复用 api-ui/dist，跳过 npm 构建
#   bash fnos/build-fpk.sh --version 1.0.1    # 指定版本号（会写回 manifest）
#   bash fnos/build-fpk.sh --out D:/out       # 指定产物目录
#
# 可选环境变量（覆盖默认配置）：
#   API_BASE=https://those.cc/api/v1
#   COVER_PROXY=https://img.those.cc/img?f=0
#   SITE_ID=those   SITE_NAME=Those
#   FNPACK=/path/to/fnpack        # 手动指定 fnpack，跳过自动下载
#   NPM=npm                       # 手动指定 npm
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FNOS="$ROOT/fnos"
APP_WEB="$FNOS/app/web"
OUT_DIR="$ROOT/out"
SKIP_WEB=0
NEW_VERSION=""

API_BASE="${API_BASE:-https://those.cc/api/v1}"
COVER_PROXY="${COVER_PROXY:-https://img.those.cc/img?f=0}"
SITE_ID="${SITE_ID:-those}"
SITE_NAME="${SITE_NAME:-Those}"
FNPACK_VER="1.2.3"

c_ok()   { printf '\033[32m%s\033[0m\n' "$*"; }
c_info() { printf '\033[36m%s\033[0m\n' "$*"; }
c_warn() { printf '\033[33m%s\033[0m\n' "$*"; }
c_err()  { printf '\033[31m%s\033[0m\n' "$*" >&2; }
die()    { c_err "✗ $*"; exit 1; }

usage() {
  sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-web) SKIP_WEB=1; shift ;;
    --version)  NEW_VERSION="${2:-}"; [ -n "$NEW_VERSION" ] || die "--version 缺少版本号"; shift 2 ;;
    --out)      OUT_DIR="${2:-}"; [ -n "$OUT_DIR" ] || die "--out 缺少目录"; shift 2 ;;
    -h|--help)  usage ;;
    *) die "未知参数：$1（用 --help 查看用法）" ;;
  esac
done

# ---------- 1. 环境检测 ----------
c_info "[1/5] 检查环境"

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) OS_TAG="windows" ;;
  Linux)                OS_TAG="linux"   ;;
  Darwin)               OS_TAG="macos"   ;;
  *)                    OS_TAG="unknown" ;;
esac
case "$(uname -m)" in
  x86_64|amd64)  ARCH_TAG="amd64" ;;
  arm64|aarch64) ARCH_TAG="arm64" ;;
  *)             ARCH_TAG="amd64" ;;
esac
c_ok "  平台 $OS_TAG/$ARCH_TAG"

[ -f "$FNOS/manifest" ] || die "找不到 fnos/manifest，请确认在仓库根目录内运行"

# fnpack：FNPACK 环境变量 → PATH → 本地缓存 → 自动下载
FNPACK_BIN="${FNPACK:-}"
TOOLS_DIR="$FNOS/.tools"
FPK_CACHE="$TOOLS_DIR/fnpack-$FNPACK_VER-$OS_TAG-$ARCH_TAG"

resolve_fnpack() {
  if [ -n "$FNPACK_BIN" ]; then
    [ -x "$FNPACK_BIN" ] || die "FNPACK 指向的文件不可执行：$FNPACK_BIN"
    return
  fi
  if command -v fnpack >/dev/null 2>&1; then
    FNPACK_BIN="$(command -v fnpack)"
    return
  fi
  if [ -x "$FPK_CACHE" ]; then
    FNPACK_BIN="$FPK_CACHE"
    return
  fi
  if [ "$OS_TAG" != "windows" ] && [ "$OS_TAG" != "linux" ]; then
    die "未找到 fnpack，且当前平台不支持自动下载。
  请到 https://static2.fnnas.com/fnpack/ 下载后：
    FNPACK=/path/to/fnpack bash fnos/build-fpk.sh"
  fi
  local url="https://static2.fnnas.com/fnpack/fnpack-$FNPACK_VER-$OS_TAG-$ARCH_TAG"
  c_warn "  未找到 fnpack，从官方源下载（$FPK_VER $OS_TAG/$ARCH_TAG，约 4MB）"
  mkdir -p "$TOOLS_DIR"
  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 2 -m 180 -o "$FPK_CACHE" "$url" || die "fnpack 下载失败：$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -T 180 -O "$FPK_CACHE" "$url" || die "fnpack 下载失败：$url"
  else
    die "没有 curl/wget，无法自动下载 fnpack。请手动下载后设置 FNPACK=/path/to/fnpack"
  fi
  chmod +x "$FPK_CACHE"
  FNPACK_BIN="$FPK_CACHE"
}
resolve_fnpack
c_ok "  fnpack $( [ -n "${FNPACK:-}" ] && echo "（手动指定）" || echo "就绪" )"

# ---------- 2. 前端构建 ----------
c_info "[2/5] 前端构建"
if [ "$SKIP_WEB" = "1" ] && [ -f "$ROOT/api-ui/dist/index.html" ]; then
  c_warn "  已指定 --skip-web，复用现有 api-ui/dist"
else
  NPM_BIN="${NPM:-}"
  if [ -z "$NPM_BIN" ]; then
    for cand in npm npm.cmd; do
      if command -v "$cand" >/dev/null 2>&1; then NPM_BIN="$cand"; break; fi
    done
  fi
  [ -n "$NPM_BIN" ] || die "未找到 npm，请安装 Node.js 18+ 后重试"
  pushd "$ROOT/api-ui" >/dev/null
  if [ -f package-lock.json ]; then
    c_info "  npm ci …"
    "$NPM_BIN" ci --no-audit --no-fund || die "npm ci 失败"
  else
    c_info "  npm install …"
    "$NPM_BIN" install --no-audit --no-fund || die "npm install 失败"
  fi
  c_info "  npm run build …"
  "$NPM_BIN" run build || die "前端构建失败"
  popd >/dev/null
  [ -f "$ROOT/api-ui/dist/index.html" ] || die "构建产物缺失：api-ui/dist/index.html"
fi
ENTRY="$(grep -o 'index-[A-Za-z0-9_-]*\.js' "$ROOT/api-ui/dist/index.html" | head -1 || true)"
c_ok "  产物 ${ENTRY:-index.html}"

# ---------- 3. 同步进应用工程 ----------
c_info "[3/5] 同步静态文件到 fnos/app/web"
rm -rf "$APP_WEB"
mkdir -p "$APP_WEB"
cp -r "$ROOT/api-ui/dist/." "$APP_WEB/"

# 应用内预置运行时配置（站点 + 图片代理），装完只需贴一次令牌
cat > "$APP_WEB/config.js" <<EOF
/* ============================================================
 * Those · fnOS 应用运行时配置
 * 本文件由 fnos/build-fpk.sh 自动生成，请勿手工修改。
 * 站点已预置，首次打开只需在「连接设置」里粘贴 API 令牌。
 * ============================================================ */
window.__TEY_API__ = {
  brand: 'Those',
  activeSite: '${SITE_ID}',
  imageMode: 'auto',
  /* 图片代理：破图床防盗链 + 按片名补图（Cloudflare Worker） */
  coverProxy: '${COVER_PROXY}',
  sites: [
    { id: '${SITE_ID}', name: '${SITE_NAME}', apiBase: '${API_BASE}', color: '#2bd9c4' },
  ],
};
EOF
FILE_COUNT="$(find "$APP_WEB" -type f | wc -l | tr -d ' ')"
SIZE="$(du -sh "$APP_WEB" 2>/dev/null | cut -f1)"
c_ok "  $FILE_COUNT 个文件 / $SIZE"

# ---------- 4. 版本号 ----------
c_info "[4/5] 版本号"
if [ -n "$NEW_VERSION" ]; then
  sed -i.bak "s/^version=.*/version=\"$NEW_VERSION\"/" "$FNOS/manifest" && rm -f "$FNOS/manifest.bak"
  c_ok "  manifest 已更新为 $NEW_VERSION（记得一并提交）"
fi
VERSION="$(grep '^version=' "$FNOS/manifest" | cut -d'"' -f2)"
[ -n "$VERSION" ] || die "manifest 里读不到 version"
c_ok "  $VERSION"

# ---------- 5. 打包 ----------
c_info "[5/5] fnpack 打包"
STAGE="$(mktemp -d 2>/dev/null || mktemp -d -t those)"
trap 'rm -rf "$STAGE" 2>/dev/null || true' EXIT
PKG_DIR="$STAGE/those"
mkdir -p "$PKG_DIR"
cp -r "$FNOS/." "$PKG_DIR/"
rm -rf "$PKG_DIR/.tools" "$PKG_DIR/.out" "$PKG_DIR"/manifest.bak

pushd "$STAGE" >/dev/null
"$FNPACK_BIN" build -d those || die "fnpack 打包失败"
[ -f "$STAGE/those.fpk" ] || die "打包结束但没有生成 those.fpk"
popd >/dev/null

mkdir -p "$OUT_DIR"
OUT_FILE="$OUT_DIR/those-fnos-$VERSION.fpk"
cp "$STAGE/those.fpk" "$OUT_FILE"
OUT_SIZE="$(du -h "$OUT_FILE" | cut -f1)"

echo
c_ok "✅ 出包完成"
echo "   包文件  $OUT_FILE  ($OUT_SIZE)"
echo "   版本    $VERSION"
echo "   前端    ${ENTRY:-index.html}"
echo "   配置    $API_BASE"
echo "   代理    $COVER_PROXY"
echo
echo "   安装：飞牛桌面 → 应用中心 → 右上「手动安装」→ 选上面的 .fpk"
echo "   端口：8790（首次启动需从 Docker Hub 拉 nginx:1.27-alpine，建议先配置镜像加速）"
