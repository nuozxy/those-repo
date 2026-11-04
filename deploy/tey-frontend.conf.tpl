# ============================================================
# TEY 太乙 · 新前台（前后端分离版）
# 由 deploy/go-live.sh 生成，请勿手改（改模板后重跑脚本）
# 原站配置：192.168.1.10.conf —— 本文件与它按 Host 区分，互不覆盖
# ============================================================
server {
    listen __PORT__;
    server_name __DOMAIN__;

    root /www/sites/tey-preview/design;
    index index.html index.htm;

    charset utf-8;
    client_max_body_size 8m;

    # ---- 安全响应头 ----
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    # ---- 静态压缩：前端资源体积压掉 70% ----
    gzip on;
    gzip_min_length 1024;
    gzip_comp_level 5;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    # ---- 静态资源长缓存（文件名不带 hash，用 7 天折中）----
    location ~* \.(css|js|jpg|jpeg|png|webp|svg|ico|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
        try_files $uri =404;
    }

    # ---- 页面：不带扩展名也能访问 /list → /hifi/list.html ----
    location / {
        try_files $uri $uri/ $uri.html @fallback;
    }
    location @fallback {
        try_files /hifi$uri.html /hifi$uri/index.html /index.html =404;
    }

    # ---- BFF：单入口 PHP ----
    location /bff/ {
        include fastcgi_params;
        fastcgi_pass 127.0.0.1:9000;
        fastcgi_param SCRIPT_FILENAME /www/sites/tey-preview/bff/index.php;
        fastcgi_param SCRIPT_NAME /bff/index.php;
        fastcgi_param REQUEST_URI $request_uri;
        fastcgi_param QUERY_STRING $query_string;
        fastcgi_read_timeout 30s;
    }

    # 缓存目录绝不外泄（含原站会话 cookie）
    location ~ ^/bff/\.cache/ {
        deny all;
        return 404;
    }

    location = /favicon.ico { access_log off; log_not_found off; }
}
__SSL_BLOCK__
