#!/usr/bin/env node
/**
 * 트렌드 데일리 — SNS/검색 트렌드 데일리 대시보드 로컬 서버
 *
 * 의존성 없음 (Node 18+ 내장 모듈만 사용)
 * 실행:  node server.js   →  http://localhost:3000
 *
 * 데이터 소스
 *  - Google Trends 일별 급상승 검색어 RSS (키 불필요)
 *  - Wikipedia 인기 문서 (Wikimedia REST API, 키 불필요)
 *  - Google News 검색 RSS — 키워드별 뉴스 기사 생산량 (키 불필요)
 *  - YouTube Data API v3 — 인기 급상승 영상 / 키워드별 영상 수 (YOUTUBE_API_KEY 필요, 선택)
 *
 * 스냅샷: 성공적으로 수집한 날의 데이터를 data/ 폴더에 저장 → 과거 날짜 조회 가능
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');

// ---------------------------------------------------------------------------
// .env 로드 (선택) — sns-trends/.env 파일의 KEY=VALUE 를 process.env 로
// ---------------------------------------------------------------------------
(function loadDotEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
})();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';

// ---------------------------------------------------------------------------
// 유틸
// ---------------------------------------------------------------------------
function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function fetchText(url, { timeoutMs = 12000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TrendDaily/1.0 (local dashboard)',
        Accept: '*/*',
        ...headers,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, opts) {
  return JSON.parse(await fetchText(url, opts));
}

// --- 간이 XML 헬퍼 (Google RSS 전용, 외부 파서 없이) -----------------------
function decodeEntities(s) {
  if (!s) return '';
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function xmlBlocks(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function xmlTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? decodeEntities(m[1]) : '';
}

// "50,000+" / "2M+" → 숫자
function parseTraffic(s) {
  if (!s) return 0;
  const t = s.replace(/[,+\s]/g, '').toUpperCase();
  const m = t.match(/^([\d.]+)([KMB]?)$/);
  if (!m) return 0;
  const mult = { '': 1, K: 1e3, M: 1e6, B: 1e9 }[m[2]] || 1;
  return Math.round(parseFloat(m[1]) * mult);
}

// ---------------------------------------------------------------------------
// 캐시
// ---------------------------------------------------------------------------
const cache = new Map(); // key -> { t, ttl, data }
function cacheGet(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < hit.ttl) return hit.data;
  return null;
}
function cacheSet(key, data, ttlMs) {
  cache.set(key, { t: Date.now(), ttl: ttlMs, data });
}

// ---------------------------------------------------------------------------
// 데이터 소스
// ---------------------------------------------------------------------------

/** Google Trends 일별 급상승 검색어 (신/구 엔드포인트 순차 시도) */
async function fetchGoogleTrends(geo) {
  const urls = [
    `https://trends.google.com/trending/rss?geo=${geo}`,
    `https://trends.google.com/trends/trendingsearches/daily/rss?geo=${geo}`,
  ];
  let lastErr;
  for (const url of urls) {
    try {
      const xml = await fetchText(url);
      const items = xmlBlocks(xml, 'item').map((block, i) => {
        const newsItems = xmlBlocks(block, 'ht:news_item').map((n) => ({
          title: xmlTag(n, 'ht:news_item_title'),
          url: xmlTag(n, 'ht:news_item_url'),
          source: xmlTag(n, 'ht:news_item_source'),
        }));
        const trafficRaw = xmlTag(block, 'ht:approx_traffic');
        return {
          rank: i + 1,
          keyword: xmlTag(block, 'title'),
          trafficLabel: trafficRaw || null,
          traffic: parseTraffic(trafficRaw),
          picture: xmlTag(block, 'ht:picture') || null,
          pubDate: xmlTag(block, 'pubDate') || null,
          news: newsItems.slice(0, 3),
        };
      });
      if (items.length) return items;
      lastErr = new Error('RSS 파싱 결과가 비어 있음');
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Google Trends 수집 실패');
}

/** Wikipedia 인기 문서 (어제 기준 — 오늘 데이터는 아직 집계 전) */
async function fetchWikipediaTop(geo) {
  const lang = { KR: 'ko', JP: 'ja', US: 'en', GB: 'en', TW: 'zh', DE: 'de', FR: 'fr' }[geo] || 'en';
  const d = new Date(Date.now() - 24 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${lang}.wikipedia/all-access/${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  const json = await fetchJson(url);
  const skip = /^(Special:|특수:|特別:|Main_Page|위키백과:|Wikipedia:|메인_페이지|Portal:|Help:|파일:|File:|틀:|Template:|분류:|Category:)/i;
  const articles = (json.items?.[0]?.articles || [])
    .filter((a) => !skip.test(a.article) && a.article !== '-')
    .slice(0, 15)
    .map((a, i) => ({
      rank: i + 1,
      title: a.article.replace(/_/g, ' '),
      views: a.views,
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(a.article)}`,
    }));
  return { lang, date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, articles };
}

/** YouTube 인기 급상승 (API 키 필요) */
async function fetchYouTubeTrending(geo) {
  if (!YOUTUBE_API_KEY) return { error: 'no_key' };
  const url =
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics` +
    `&chart=mostPopular&regionCode=${geo}&maxResults=12&key=${YOUTUBE_API_KEY}`;
  const json = await fetchJson(url);
  return {
    videos: (json.items || []).map((v, i) => ({
      rank: i + 1,
      id: v.id,
      title: v.snippet?.title || '',
      channel: v.snippet?.channelTitle || '',
      thumbnail: v.snippet?.thumbnails?.medium?.url || '',
      views: Number(v.statistics?.viewCount || 0),
      publishedAt: v.snippet?.publishedAt || null,
      url: `https://www.youtube.com/watch?v=${v.id}`,
    })),
  };
}

/** 키워드별 콘텐츠 생산량 — 뉴스 기사 수 (Google News RSS, 최근 100건 기준) */
async function fetchNewsVolume(keyword, geo) {
  const locale = { KR: ['ko', 'KR', 'KR:ko'], JP: ['ja', 'JP', 'JP:ja'], US: ['en-US', 'US', 'US:en'], GB: ['en-GB', 'GB', 'GB:en'] }[geo] || ['en-US', 'US', 'US:en'];
  const url =
    `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}` +
    `&hl=${locale[0]}&gl=${locale[1]}&ceid=${locale[2]}`;
  const xml = await fetchText(url);
  const items = xmlBlocks(xml, 'item');
  const now = Date.now();
  let last24h = 0;
  let last7d = 0;
  const latest = [];
  for (const block of items) {
    const pub = new Date(xmlTag(block, 'pubDate')).getTime();
    if (!Number.isNaN(pub)) {
      if (now - pub < 24 * 3600 * 1000) last24h++;
      if (now - pub < 7 * 24 * 3600 * 1000) last7d++;
    }
    if (latest.length < 5) {
      latest.push({
        title: xmlTag(block, 'title'),
        url: xmlTag(block, 'link'),
        source: xmlTag(block, 'source'),
        pubDate: xmlTag(block, 'pubDate'),
      });
    }
  }
  return { sampled: items.length, last24h, last7d, latest };
}

/** 키워드별 유튜브 영상 수 (API 키 필요, totalResults는 추정치) */
async function fetchYouTubeVolume(keyword, geo) {
  if (!YOUTUBE_API_KEY) return { error: 'no_key' };
  const base =
    `https://www.googleapis.com/youtube/v3/search?part=id&type=video&maxResults=1` +
    `&q=${encodeURIComponent(keyword)}&regionCode=${geo}&key=${YOUTUBE_API_KEY}`;
  const after24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const after7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const [d1, d7] = await Promise.all([
    fetchJson(`${base}&publishedAfter=${encodeURIComponent(after24h)}`),
    fetchJson(`${base}&publishedAfter=${encodeURIComponent(after7d)}`),
  ]);
  return {
    last24h: d1.pageInfo?.totalResults ?? 0,
    last7d: d7.pageInfo?.totalResults ?? 0,
  };
}

/** 플랫폼별 검색 바로가기 (인스타/릴스/틱톡/X/스레드는 공개 트렌드 API 미제공) */
function platformLinks(keyword) {
  const q = encodeURIComponent(keyword);
  const tag = encodeURIComponent(keyword.replace(/\s+/g, ''));
  return [
    { platform: 'YouTube', url: `https://www.youtube.com/results?search_query=${q}` },
    { platform: 'Google', url: `https://www.google.com/search?q=${q}` },
    { platform: 'Instagram', url: `https://www.instagram.com/explore/search/keyword/?q=${q}` },
    { platform: 'Reels', url: `https://www.instagram.com/explore/tags/${tag}/` },
    { platform: 'TikTok', url: `https://www.tiktok.com/search?q=${q}` },
    { platform: 'X', url: `https://x.com/search?q=${q}&f=live` },
    { platform: 'Threads', url: `https://www.threads.net/search?q=${q}&serp_type=default` },
    { platform: 'Naver', url: `https://search.naver.com/search.naver?query=${q}` },
  ];
}

// ---------------------------------------------------------------------------
// 스냅샷 (데일리 히스토리)
// ---------------------------------------------------------------------------
function snapshotPath(date, geo) {
  return path.join(DATA_DIR, `${date}_${geo}.json`);
}

function saveSnapshot(dashboard) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(snapshotPath(dashboard.date, dashboard.geo), JSON.stringify(dashboard, null, 2));
  } catch (e) {
    console.error('스냅샷 저장 실패:', e.message);
  }
}

function listSnapshots() {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs
    .readdirSync(DATA_DIR)
    .map((f) => f.match(/^(\d{4}-\d{2}-\d{2})_([A-Z]{2})\.json$/))
    .filter(Boolean)
    .map((m) => ({ date: m[1], geo: m[2] }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

// ---------------------------------------------------------------------------
// 데모 데이터 (네트워크 불가/실패 시 UI 확인용 — 화면에 '샘플'로 표시됨)
// ---------------------------------------------------------------------------
function loadSampleData(geo) {
  const sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'sample-data.json'), 'utf8'));
  return { ...sample, geo, date: todayStr(), generatedAt: new Date().toISOString(), demo: true };
}

// ---------------------------------------------------------------------------
// API 핸들러
// ---------------------------------------------------------------------------
async function apiDashboard(query) {
  const geo = (query.get('geo') || 'KR').toUpperCase().slice(0, 2);
  const demo = query.get('demo') === '1';
  if (demo) return loadSampleData(geo);

  const cacheKey = `dash:${geo}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const [google, wiki, youtube] = await Promise.allSettled([
    fetchGoogleTrends(geo),
    fetchWikipediaTop(geo),
    fetchYouTubeTrending(geo),
  ]);

  // 핵심 소스(구글 트렌드)까지 전부 실패하면 데모 데이터로 폴백
  if (google.status === 'rejected' && wiki.status === 'rejected') {
    console.error('라이브 수집 실패 → 샘플 데이터 표시:', google.reason?.message);
    return loadSampleData(geo);
  }

  const dashboard = {
    date: todayStr(),
    geo,
    generatedAt: new Date().toISOString(),
    demo: false,
    googleTrends: google.status === 'fulfilled' ? google.value : { error: String(google.reason?.message || google.reason) },
    wikipediaTop: wiki.status === 'fulfilled' ? wiki.value : { error: String(wiki.reason?.message || wiki.reason) },
    youtubeTrending: youtube.status === 'fulfilled' ? youtube.value : { error: String(youtube.reason?.message || youtube.reason) },
  };

  cacheSet(cacheKey, dashboard, 30 * 60 * 1000);
  if (Array.isArray(dashboard.googleTrends)) saveSnapshot(dashboard);
  return dashboard;
}

async function apiKeyword(query) {
  const keyword = (query.get('q') || '').trim();
  const geo = (query.get('geo') || 'KR').toUpperCase().slice(0, 2);
  if (!keyword) throw Object.assign(new Error('q 파라미터가 필요합니다'), { status: 400 });
  if (query.get('demo') === '1') {
    const sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'sample-data.json'), 'utf8'));
    return { ...sample.keywordSample, keyword, links: platformLinks(keyword), demo: true };
  }

  const cacheKey = `kw:${geo}:${keyword}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const [news, yt] = await Promise.allSettled([
    fetchNewsVolume(keyword, geo),
    fetchYouTubeVolume(keyword, geo),
  ]);

  const result = {
    keyword,
    geo,
    demo: false,
    news: news.status === 'fulfilled' ? news.value : { error: String(news.reason?.message || news.reason) },
    youtube: yt.status === 'fulfilled' ? yt.value : { error: String(yt.reason?.message || yt.reason) },
    links: platformLinks(keyword),
  };
  cacheSet(cacheKey, result, 15 * 60 * 1000);
  return result;
}

function apiHistory() {
  return listSnapshots();
}

function apiHistoryDate(date, query) {
  const geo = (query.get('geo') || 'KR').toUpperCase().slice(0, 2);
  const p = snapshotPath(date, geo);
  if (!fs.existsSync(p)) throw Object.assign(new Error('해당 날짜의 스냅샷이 없습니다'), { status: 404 });
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ---------------------------------------------------------------------------
// HTTP 서버
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);

  try {
    if (pathname === '/api/dashboard') return sendJson(res, 200, await apiDashboard(url.searchParams));
    if (pathname === '/api/keyword') return sendJson(res, 200, await apiKeyword(url.searchParams));
    if (pathname === '/api/history') return sendJson(res, 200, apiHistory());
    const hist = pathname.match(/^\/api\/history\/(\d{4}-\d{2}-\d{2})$/);
    if (hist) return sendJson(res, 200, apiHistoryDate(hist[1], url.searchParams));
    if (pathname === '/api/status') {
      return sendJson(res, 200, { youtubeKey: Boolean(YOUTUBE_API_KEY), snapshots: listSnapshots().length });
    }

    // 정적 파일
    let filePath = path.normalize(path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname));
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not Found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    console.error(`[${req.method} ${pathname}]`, e.message);
    sendJson(res, e.status || 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  📊 트렌드 데일리 실행 중');
  console.log(`  →  http://localhost:${PORT}`);
  console.log('');
  console.log(`  YouTube API 키: ${YOUTUBE_API_KEY ? '설정됨 ✓' : '없음 (유튜브 패널 비활성 — README 참고)'}`);
  console.log('');
});
