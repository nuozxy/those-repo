<?php
/**
 * TEY 图片代理 —— 单文件，不需要数据库、不需要常驻进程。
 *
 * 为什么需要它：豆瓣等图床按 Referer / 出口 IP 做防盗链，浏览器直连会被
 * 403 / 418，公共图片代理也抓不到。这个小文件在服务端带上正确的 Referer
 * 取图，顺带把结果缓存到本地磁盘，第二次起直接命中。
 *
 * 用法：放到任意 PHP 站点的根目录，然后在「连接设置 → 外链图片代理」填
 *       https://你的域名/img.php?f=0
 *       （f=0 表示抓不到就返回 404，前端会自动换下一个图片源）
 *
 * 支持的参数：
 *   u   必填（与 q 二选一），完整图片地址（需 urlencode）
 *   q   按片名去豆瓣搜一张海报再抓回来。原图 404 / 图床已删时用它兜底，
 *      前端会自动带上（见 coverProxy 的说明），不需要手动改数据
 *   f   可选，=0 时失败直接 404，不返回占位图
 *   w   可选，交给公共代理缩放时的宽度（仅在级联时使用）
 *
 * 安全：只允许 http/https、禁止内网/回环地址、限制单文件 8MB。
 */

declare(strict_types=1);

$CACHE_DIR = __DIR__ . '/.imgcache';
$CACHE_TTL = 7 * 86400;
$MAX_BYTES = 8 * 1024 * 1024;

$u = (string)($_GET['u'] ?? '');
$q = trim((string)($_GET['q'] ?? ''));
$strict = (string)($_GET['f'] ?? '') === '0';
$wantW = (int)($_GET['w'] ?? 0);

if (!is_dir($CACHE_DIR)) {
    @mkdir($CACHE_DIR, 0775, true);
}

function fail(bool $strict): void
{
    if ($strict) {
        // 失败也缓存半小时：避免同一张坏图在列表里被反复请求
        header('Cache-Control: public, max-age=1800');
        http_response_code(404);
        exit;
    }
    header('Content-Type: image/svg+xml; charset=utf-8');
    header('Cache-Control: public, max-age=600');
    echo '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">'
       . '<rect width="300" height="450" fill="#8a96a1" fill-opacity="0.09"/>'
       . '<g fill="none" stroke="#8a96a1" stroke-opacity="0.40" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">'
       . '<rect x="116" y="176" width="68" height="76" rx="9"/><circle cx="150" cy="200" r="8.5"/>'
       . '<path d="M116 238l19-19 15 13 15-15 19 21"/></g></svg>';
    exit;
}

/**
 * 按片名去豆瓣找一张海报。
 *
 * 用豆瓣的「搜索建议」接口（movie.douban.com/j/subject_suggest），实测不需要
 * API key、不需要登录，返回的 img 就是海报地址；命中率明显高于 TMDB/IMDb
 * 之类英文库（站内种子名多为中文 + 原文）。
 *
 * 「搞笑一家人3：短腿的反击」这种带副标题的整串会搜不到，所以按
 * 整串 → 冒号前 → 空格前 依次降级重试。
 *
 * 结果按查询词缓存 30 天（找不到也缓存成 '-'），避免每张卡片都去打豆瓣。
 * 返回空串表示没找到，由调用方决定是 404 还是占位图。
 */
function douban_poster(string $q, string $cacheDir): string
{
    $ck = $cacheDir . '/q_' . md5($q);
    if (is_file($ck) && (time() - (int)filemtime($ck)) < 30 * 86400) {
        $hit = trim((string)@file_get_contents($ck));
        return $hit === '-' ? '' : $hit;
    }

    $cands = [$q];
    $colon = preg_split('/[：:]/u', $q);
    if (is_array($colon) && count($colon) > 1) {
        $cands[] = trim($colon[0]);
    }
    $space = preg_split('/\s+/u', $q);
    if (is_array($space) && count($space) > 1) {
        $cands[] = trim($space[0]);
    }
    $cands = array_values(array_unique(array_filter(
        $cands,
        static fn($x) => is_string($x) && mb_strlen(trim($x), 'UTF-8') >= 2
    )));

    $img = '';
    foreach ($cands as $cand) {
        $ch = curl_init('https://movie.douban.com/j/subject_suggest?q=' . rawurlencode($cand));
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => false,
            CURLOPT_REFERER => 'https://movie.douban.com/',
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36',
        ]);
        $body = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($code !== 200 || !is_string($body) || $body === '') {
            continue;
        }
        $arr = json_decode($body, true);
        if (!is_array($arr)) {
            continue;
        }
        foreach ($arr as $it) {
            if (!empty($it['img']) && is_string($it['img'])) {
                // 建议接口给的是小图（s_ratio_poster），换成中图当卡片封面更清楚
                $img = str_replace('/s_ratio_poster/', '/m_ratio_poster/', $it['img']);
                break 2;
            }
        }
    }

    @file_put_contents($ck, $img !== '' ? $img : '-');
    return $img;
}

if ($u === '' && $q !== '') {
    $u = douban_poster($q, $CACHE_DIR);
    if ($u === '') {
        fail($strict);
    }
}

if ($u === '') {
    http_response_code(400);
    exit('missing u');
}

$parts = parse_url($u);
$scheme = strtolower((string)($parts['scheme'] ?? ''));
$host = strtolower((string)($parts['host'] ?? ''));

if (!in_array($scheme, ['http', 'https'], true) || $host === '') {
    fail($strict);
}

// 只放行公网主机，挡住内网探测
$isIp = filter_var($host, FILTER_VALIDATE_IP) !== false;
if ($isIp) {
    $ok = filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false;
} else {
    $ok = $host !== 'localhost' && !str_ends_with($host, '.local') && str_contains($host, '.');
}
if (!$ok) {
    fail($strict);
}

// 防盗链规则：命中哪一类就用对应的 Referer
$referer = '';
if ($host === 'douban.com' || str_ends_with($host, '.douban.com')
    || $host === 'doubanio.com' || str_ends_with($host, '.doubanio.com')) {
    $referer = 'https://movie.douban.com/';
} elseif (str_ends_with($host, 'hhanclub.net')) {
    $referer = 'https://hhanclub.net/';
} elseif ($host === 'image.tmdb.org') {
    $referer = ''; // TMDB 不需要 Referer，带了反而可能被限
} else {
    $referer = $scheme . '://' . $host . '/';
}

$key = md5($u . '|' . $wantW);
$file = $CACHE_DIR . '/' . $key;

if (is_file($file) && (time() - (int)filemtime($file)) < $CACHE_TTL && (int)filesize($file) > 1024) {
    header('Content-Type: image/jpeg');
    header('Cache-Control: public, max-age=86400');
    header('X-Tey-Image: hit');
    readfile($file);
    exit;
}

/** @return array{0:int,1:string,2:string} [http code, body, content type] */
function fetch(string $url, string $referer, int $maxBytes): array
{
    $ch = curl_init($url);
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36',
    ];
    // 空 Referer 不要发：部分图床 / 公共代理会因此拒绝请求
    if ($referer !== '') {
        $opts[CURLOPT_REFERER] = $referer;
    }
    curl_setopt_array($ch, $opts);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $type = (string)(curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: 'image/jpeg');
    curl_close($ch);
    if (!is_string($body) || strlen($body) > $maxBytes) {
        return [0, '', ''];
    }
    return [$code, $body, $type];
}

[$code, $body, $type] = fetch($u, $referer, $MAX_BYTES);

// 自建出口被抓不到时，级联公共图片代理再试一次（可解决出口 IP 被拉黑）。
// 实测公共代理带 w 参数时成功率明显更高（不带 w 常超时），默认按 720 缩放。
if ($code !== 200 || strlen($body) <= 1024) {
    $w = $wantW > 0 ? $wantW : 720;
    $alt = 'https://images.weserv.nl/?url=' . rawurlencode($u)
         . '&w=' . $w . '&output=jpg&q=82';
    [$code, $body, $type] = fetch($alt, '', $MAX_BYTES);
}

if ($code === 200 && strlen($body) > 1024) {
    @file_put_contents($file, $body);
    header('Content-Type: ' . $type);
    header('Cache-Control: public, max-age=86400');
    header('X-Tey-Image: miss');
    echo $body;
    exit;
}

fail($strict);
