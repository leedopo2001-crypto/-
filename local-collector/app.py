# -*- coding: utf-8 -*-
"""
커뮤니티 로컬 수집기
- 더블클릭(start.bat) → 브라우저에서 http://127.0.0.1:8747 열림
- 인기글 목록 불러오기(디시 실베/루리웹 베스트/에펨 포텐) + URL 직접 수집
- 본문 텍스트(.txt), 이미지, meta.json 을 collected/날짜/글제목/ 에 저장
"""
import os
import re
import json
import datetime
from urllib.parse import urlparse, parse_qs, urljoin

import requests
from bs4 import BeautifulSoup
from flask import Flask, request, jsonify, render_template_string

try:
    import cloudscraper
    HAS_CLOUD = True
except ImportError:
    HAS_CLOUD = False

BASE = os.path.dirname(os.path.abspath(__file__))
OUT_ROOT = os.path.join(BASE, "collected")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

app = Flask(__name__)


def make_session():
    """에펨코리아 Cloudflare 우회용. cloudscraper 있으면 사용."""
    if HAS_CLOUD:
        return cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "windows", "mobile": False}
        )
    return requests.Session()


SESSION = make_session()

try:
    import anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False

KEY_FILE = os.path.join(BASE, "api_key.txt")
ADAPT_MODEL = os.environ.get("RECKA_MODEL", "claude-opus-4-8")  # 바꾸려면 환경변수


def get_api_key():
    if os.path.exists(KEY_FILE):
        try:
            k = open(KEY_FILE, encoding="utf-8").read().strip()
            if k:
                return k
        except OSError:
            pass
    return os.environ.get("ANTHROPIC_API_KEY", "").strip()


def get_anthropic_client():
    if not HAS_ANTHROPIC:
        raise RuntimeError("anthropic 패키지가 없습니다. start.bat을 다시 실행해 설치하세요 (pip install anthropic).")
    key = get_api_key()
    if not key:
        raise RuntimeError("Anthropic API 키가 없습니다. 화면 상단 'AI 설정'에서 키를 입력하세요.")
    return anthropic.Anthropic(api_key=key)


# ──────────────────────────────── 공통 유틸

def fetch(url, referer=None, timeout=25):
    headers = {
        "User-Agent": UA,
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.5",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
    }
    if referer:
        headers["Referer"] = referer
    r = SESSION.get(url, headers=headers, timeout=timeout)
    r.raise_for_status()
    if not r.encoding or r.encoding.lower() == "iso-8859-1":
        r.encoding = r.apparent_encoding
    # Cloudflare 챌린지 감지 (cloudscraper로도 못 뚫은 경우)
    head = r.text[:3000]
    if "Just a moment" in head or "Checking your browser" in head:
        raise RuntimeError("Cloudflare 차단에 막힘 (잠시 후 재시도하거나 소량씩 수집)")
    return r


def clean_text(s):
    s = s.replace("​", "").replace("﻿", "").replace("\xa0", " ")
    lines = [ln.rstrip() for ln in s.splitlines()]
    out, blank = [], 0
    for ln in lines:
        if ln.strip():
            out.append(ln)
            blank = 0
        else:
            blank += 1
            if blank == 1:
                out.append("")
    return "\n".join(out).strip()


def safe_name(title, limit=60):
    name = re.sub(r'[\\/:*?"<>|\r\n\t]', " ", title).strip()
    name = re.sub(r"\s+", " ", name)
    return (name[:limit] or "untitled").strip()


def make_out_dir(title):
    date = datetime.date.today().isoformat()
    d = os.path.join(OUT_ROOT, date, safe_name(title))
    n, final = 1, d
    while os.path.exists(final):
        n += 1
        final = f"{d}_{n}"
    os.makedirs(final, exist_ok=True)
    return final


def download_images(urls, out_dir, referer, limit=15):
    img_dir = os.path.join(out_dir, "images")
    saved = []
    for i, u in enumerate(urls[:limit], 1):
        try:
            r = fetch(u, referer=referer, timeout=25)
            if len(r.content) > 15 * 1024 * 1024:
                continue
            ctype = r.headers.get("Content-Type", "")
            ext = ".jpg"
            for k, v in [("png", ".png"), ("gif", ".gif"), ("webp", ".webp"), ("jpeg", ".jpg")]:
                if k in ctype or u.lower().split("?")[0].endswith(k.replace("jpeg", "jpg")):
                    ext = v
                    break
            os.makedirs(img_dir, exist_ok=True)
            path = os.path.join(img_dir, f"{i:02d}{ext}")
            with open(path, "wb") as f:
                f.write(r.content)
            saved.append(os.path.basename(path))
        except Exception:
            continue
    return saved


# ──────────────────────────────── 사이트별 본문 파서

def scrape_naver_blog(url):
    """blog.naver.com — iframe 우회: PostView.naver 직접 호출"""
    p = urlparse(url)
    qs = parse_qs(p.query)
    blog_id, log_no = qs.get("blogId", [None])[0], qs.get("logNo", [None])[0]
    if not (blog_id and log_no):
        parts = [x for x in p.path.split("/") if x]
        if len(parts) >= 2 and parts[-1].isdigit():
            blog_id, log_no = parts[-2], parts[-1]
    if not (blog_id and log_no):
        raise ValueError("네이버 블로그 주소에서 blogId/logNo를 찾지 못했습니다")

    view = f"https://blog.naver.com/PostView.naver?blogId={blog_id}&logNo={log_no}"
    soup = BeautifulSoup(fetch(view).text, "lxml")

    t = soup.select_one("div.se-title-text") or soup.select_one(".pcol1") or soup.select_one("title")
    title = t.get_text(strip=True) if t else f"{blog_id}_{log_no}"

    container = soup.select_one("div.se-main-container")
    if container:
        paras = [pg.get_text("\n", strip=False) for pg in container.select("p.se-text-paragraph")]
        text = clean_text("\n".join(paras)) if paras else clean_text(container.get_text("\n"))
    else:  # 구버전 에디터
        legacy = soup.select_one("#postViewArea") or soup.select_one(".post-view")
        if not legacy:
            raise ValueError("본문 컨테이너를 찾지 못했습니다 (구조 변경 가능성)")
        text = clean_text(legacy.get_text("\n"))
        container = legacy

    imgs = []
    for img in container.select("img"):
        src = img.get("data-lazy-src") or img.get("src") or ""
        if not src.startswith("http"):
            continue
        src = re.sub(r"\?type=w\d+.*$", "?type=w966", src)
        imgs.append(src)
    return {"title": title, "url": view, "text": text, "images": imgs, "referer": view}


def scrape_dcinside(url):
    soup = BeautifulSoup(fetch(url, referer="https://gall.dcinside.com/").text, "lxml")
    t = (soup.select_one("span.title_subject") or soup.select_one("h3.title .title_subject")
         or soup.select_one("meta[property='og:title']") or soup.select_one("title"))
    title = (t.get("content") if t and t.name == "meta" else t.get_text(strip=True)) if t else "dcinside_post"
    body = soup.select_one("div.write_div") or soup.select_one("div.writing_view_box")
    if not body:
        raise ValueError("본문(write_div)을 찾지 못했습니다")
    text = clean_text(body.get_text("\n"))
    imgs = extract_images(body)
    return {"title": title, "url": url, "text": text, "images": imgs,
            "referer": "https://gall.dcinside.com/"}


def extract_images(body, is_naver=False, base_host=None):
    """검증된 lazy-load 대응: data-lazy-src > data-original > src, blank 제외"""
    imgs = []
    for img in body.select("img"):
        src = (img.get("data-lazy-src") or img.get("data-original")
               or img.get("src") or "")
        if src.startswith("//"):
            src = "https:" + src
        elif src.startswith("/") and base_host:
            src = base_host + src
        if src.startswith("http") and "blank" not in src:
            imgs.append(src.split("?")[0] if is_naver else src)
    return imgs


def pick_title(soup, selectors, default):
    for sel in selectors:
        el = soup.select_one(sel)
        if el:
            val = el.get("content", "") if el.name == "meta" else el.get_text(strip=True)
            if val and val.strip():
                return val.strip()
    return default


def scrape_fmkorea(url):
    soup = BeautifulSoup(fetch(url, referer="https://www.fmkorea.com/").text, "lxml")
    t = (soup.select_one("h1.np_18px") or soup.select_one("meta[property='og:title']")
         or soup.select_one("h1") or soup.select_one("title"))
    title = (t.get("content") if t and t.name == "meta" else t.get_text(strip=True)) if t else "fmkorea_post"
    body = (soup.select_one("div.rd_body article .xe_content")
            or soup.select_one("article .xe_content")
            or soup.select_one("div.xe_content"))
    if not body:
        raise ValueError("본문(xe_content)을 찾지 못했습니다 — 차단 페이지일 수 있음")
    text = clean_text(body.get_text("\n"))
    imgs = extract_images(body, base_host="https://www.fmkorea.com")
    return {"title": title, "url": url, "text": text, "images": imgs,
            "referer": "https://www.fmkorea.com/"}


def scrape_ruliweb(url):
    soup = BeautifulSoup(fetch(url, referer="https://bbs.ruliweb.com/").text, "lxml")
    t = soup.select_one("span.subject_inner_text") or soup.select_one("title")
    title = t.get_text(strip=True) if t else "ruliweb_post"
    body = soup.select_one("div.view_content") or soup.select_one("article")
    if not body:
        raise ValueError("본문(view_content)을 찾지 못했습니다")
    text = clean_text(body.get_text("\n"))
    imgs = [i.get("src") or "" for i in body.select("img")]
    imgs = [u if u.startswith("http") else "https:" + u for u in imgs if u]
    return {"title": title, "url": url, "text": text, "images": imgs,
            "referer": "https://bbs.ruliweb.com/"}


# ── 아래 4개는 실전 미검증 셀렉터(사이트 구조 추정). 안 되면 F12로 본문 div class 확인 후 교체.

def scrape_theqoo(url):
    # 더쿠는 Rhymix/XE 기반이라 본문 구조가 에펨과 유사
    soup = BeautifulSoup(fetch(url, referer="https://theqoo.net/").text, "lxml")
    title = pick_title(soup, ["h1.title", ".rd_hd .title", "meta[property='og:title']", "title"], "theqoo_post")
    body = (soup.select_one("div.rd_body article .xe_content")
            or soup.select_one("article .xe_content")
            or soup.select_one("div.xe_content"))
    if not body:
        raise ValueError("본문(xe_content)을 찾지 못했습니다 — 더쿠 구조 변경 가능")
    return {"title": title, "url": url, "text": clean_text(body.get_text("\n")),
            "images": extract_images(body), "referer": "https://theqoo.net/"}


def scrape_nate(url):
    soup = BeautifulSoup(fetch(url, referer="https://pann.nate.com/").text, "lxml")
    title = pick_title(soup, [".post-tit-info h4", "#cts_ttl", ".tit", "meta[property='og:title']", "title"], "nate_pann")
    body = (soup.select_one("#contentArea") or soup.select_one("div.usertxt")
            or soup.select_one(".contentArea"))
    if not body:
        raise ValueError("본문(#contentArea)을 찾지 못했습니다 — 네이트판 구조 변경 가능")
    return {"title": title, "url": url, "text": clean_text(body.get_text("\n")),
            "images": extract_images(body, base_host="https://pann.nate.com"),
            "referer": "https://pann.nate.com/"}


def scrape_bobae(url):
    soup = BeautifulSoup(fetch(url, referer="https://www.bobaedream.co.kr/").text, "lxml")
    title = pick_title(soup, [".writerProfile .title", ".title-order", "meta[property='og:title']", "title"], "bobae_post")
    body = (soup.select_one("div.bodyCont") or soup.select_one("#contentBody")
            or soup.select_one(".content_txt"))
    if not body:
        raise ValueError("본문(div.bodyCont)을 찾지 못했습니다 — 보배드림 구조 변경 가능")
    return {"title": title, "url": url, "text": clean_text(body.get_text("\n")),
            "images": extract_images(body, base_host="https://www.bobaedream.co.kr"),
            "referer": "https://www.bobaedream.co.kr/"}


def scrape_mlbpark(url):
    soup = BeautifulSoup(fetch(url, referer="https://mlbpark.donga.com/").text, "lxml")
    title = pick_title(soup, [".titles", "#contentTitle", "meta[property='og:title']", "title"], "mlbpark_post")
    body = (soup.select_one("div.ar_txt") or soup.select_one("#contentDetail")
            or soup.select_one(".view_content"))
    if not body:
        raise ValueError("본문(div.ar_txt)을 찾지 못했습니다 — 엠팍 구조 변경 가능")
    return {"title": title, "url": url, "text": clean_text(body.get_text("\n")),
            "images": extract_images(body, base_host="https://mlbpark.donga.com"),
            "referer": "https://mlbpark.donga.com/"}


def scrape_generic(url):
    """모르는 사이트: 텍스트가 가장 많은 블록을 본문으로 추정"""
    soup = BeautifulSoup(fetch(url).text, "lxml")
    for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()
    t = soup.select_one("title")
    title = t.get_text(strip=True) if t else url
    best, best_len = None, 0
    for el in soup.select("article, div, section"):
        n = len(el.get_text(strip=True))
        if n > best_len:
            best, best_len = el, n
    if not best or best_len < 100:
        raise ValueError("본문으로 볼 만한 영역을 찾지 못했습니다")
    imgs = [i.get("src") or "" for i in best.select("img")]
    imgs = [u for u in imgs if u.startswith("http")]
    return {"title": title, "url": url, "text": clean_text(best.get_text("\n")),
            "images": imgs, "referer": url}


def scrape(url):
    host = urlparse(url).netloc
    if "blog.naver.com" in host:
        return scrape_naver_blog(url)
    if "dcinside.com" in host:
        return scrape_dcinside(url)
    if "fmkorea.com" in host:
        return scrape_fmkorea(url)
    if "ruliweb.com" in host:
        return scrape_ruliweb(url)
    if "theqoo.net" in host:
        return scrape_theqoo(url)
    if "pann.nate.com" in host:
        return scrape_nate(url)
    if "bobaedream" in host:
        return scrape_bobae(url)
    if "mlbpark" in host:
        return scrape_mlbpark(url)
    return scrape_generic(url)


# ──────────────────────────────── 인기글 목록

HOT_PAGES = 3  # 인기글 목록에서 긁을 페이지 수


def page_url(base, n):
    """base URL에 page 파라미터를 붙임 (쿼리 유무 자동 판단)"""
    if n <= 1:
        return base
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}page={n}"


def hot_dcinside(page=1):
    url = page_url("https://gall.dcinside.com/board/lists/?id=dcbest", page)
    soup = BeautifulSoup(fetch(url, referer="https://www.dcinside.com/").text, "lxml")
    posts = []
    for tr in soup.select("tr.ub-content"):
        a = tr.select_one("td.gall_tit a")
        if not a or not a.get("href"):
            continue
        href = urljoin("https://gall.dcinside.com/", a["href"])
        reply = tr.select_one(".reply_num")
        posts.append({
            "title": a.get_text(strip=True),
            "url": href,
            "comments": reply.get_text(strip=True).strip("[]") if reply else "",
        })
    return posts


def hot_ruliweb(page=1):
    url = page_url("https://bbs.ruliweb.com/best/humor", page)
    soup = BeautifulSoup(fetch(url, referer="https://bbs.ruliweb.com/").text, "lxml")
    posts, seen = [], set()
    for a in soup.select("a.deco, td.subject a, .title_wrapper a"):
        href = a.get("href") or ""
        if "/read/" not in href:
            continue
        href = urljoin("https://bbs.ruliweb.com/", href.split("?")[0])
        if href in seen:
            continue
        seen.add(href)
        title = a.get_text(strip=True)
        if title:
            posts.append({"title": title, "url": href, "comments": ""})
    return posts


def hot_fmkorea(page=1):
    url = page_url("https://www.fmkorea.com/best", page)
    soup = BeautifulSoup(fetch(url, referer="https://www.fmkorea.com/").text, "lxml")
    posts, seen = [], set()
    # 제목 링크만 집기: h3.title 안의 a. (추천수/썸네일 링크 제외)
    for a in soup.select("h3.title a"):
        href = a.get("href") or ""
        if not re.search(r"/\d{6,}", href):
            continue
        title = a.get_text(" ", strip=True)
        # 추천수/댓글수만 든 링크 방어: "추천 216", "123" 같은 건 제목 아님
        if not title or title.startswith("추천") or re.fullmatch(r"[\d,]+", title):
            continue
        url = urljoin("https://www.fmkorea.com/", href.split("?")[0])
        if url in seen:
            continue
        seen.add(url)
        # 댓글수는 제목이 속한 행(li)에서 따로 찾기
        cmt = ""
        row = a.find_parent(["li", "tr", "div"])
        if row:
            c = row.select_one("a.comment_count, span.comment_count, .comment_count")
            if c:
                cmt = re.sub(r"[^\d]", "", c.get_text())
        posts.append({"title": title, "url": url, "comments": cmt})
    return posts


def _list_from_rows(html, base, link_pat, row_sel, title_sel, cmt_sel=None):
    """게시판 리스트 공용 파서: 각 행에서 링크·제목·(댓글수) 추출. 미검증 사이트용."""
    soup = BeautifulSoup(html, "lxml")
    posts, seen = [], set()
    for row in soup.select(row_sel):
        a = row.select_one(title_sel)
        if not a or not a.get("href"):
            continue
        href = urljoin(base, a["href"])
        if link_pat and not re.search(link_pat, href):
            continue
        if href in seen:
            continue
        seen.add(href)
        title = a.get_text(strip=True)
        if not title:
            continue
        cmt = ""
        if cmt_sel:
            c = row.select_one(cmt_sel)
            if c:
                cmt = re.sub(r"[^\d]", "", c.get_text())
        posts.append({"title": title, "url": href, "comments": cmt})
    return posts


def hot_theqoo(page=1):
    html = fetch(page_url("https://theqoo.net/hot", page), referer="https://theqoo.net/").text
    return _list_from_rows(html, "https://theqoo.net/", r"/hot/\d+",
                           "table.theqoo_board tbody tr, tbody tr",
                           "td.title a, a.title", "td.m_no, .replyNum")


def hot_nate(page=1):
    html = fetch(page_url("https://pann.nate.com/talk/ranking", page),
                 referer="https://pann.nate.com/").text
    return _list_from_rows(html, "https://pann.nate.com/", r"/talk/\d+",
                           "ul.post-list li, tbody tr, li",
                           "a.subject, dt a, a", ".count, .rp")


def hot_bobae(page=1):
    html = fetch(page_url("https://www.bobaedream.co.kr/board/bulletin/list.php?code=best", page),
                 referer="https://www.bobaedream.co.kr/").text
    return _list_from_rows(html, "https://www.bobaedream.co.kr/", r"view\.php",
                           "table tbody tr, .bestList li",
                           "a.bsubject, td.pl14 a, a.subject", "span.commentNum, .reply")


def hot_mlbpark(page=1):
    html = fetch(page_url("https://mlbpark.donga.com/mp/b.php?b=bullpen", page),
                 referer="https://mlbpark.donga.com/").text
    return _list_from_rows(html, "https://mlbpark.donga.com/", r"b\.php\?.*id=",
                           "table tbody tr, .tblType01 tr",
                           "a.txt, td.t_left a, a.bullpen", "span.replycnt, .num")


HOT_SOURCES = {
    "dcinside": ("디시 실시간베스트", hot_dcinside),
    "ruliweb": ("루리웹 유머베스트", hot_ruliweb),
    "fmkorea": ("에펨 포텐", hot_fmkorea),
    "theqoo": ("더쿠 핫게 (미검증)", hot_theqoo),
    "nate": ("네이트판 랭킹 (미검증)", hot_nate),
    "bobae": ("보배드림 베스트 (미검증)", hot_bobae),
    "mlbpark": ("엠팍 불펜 (미검증)", hot_mlbpark),
}


# ──────────────────────────────── API

@app.route("/api/hot")
def api_hot():
    site = request.args.get("site", "")
    if site not in HOT_SOURCES:
        return jsonify({"ok": False, "error": "알 수 없는 사이트"}), 400
    name, fn = HOT_SOURCES[site]
    all_posts, seen = [], set()
    try:
        for n in range(1, HOT_PAGES + 1):
            try:
                page_posts = fn(n)
            except Exception as e:
                if n == 1:
                    raise
                break  # 뒷페이지 실패는 있는 것까지만
            fresh = [p for p in page_posts if p["url"] not in seen]
            for p in fresh:
                seen.add(p["url"])
            all_posts += fresh
            if not fresh:
                break  # 새 글 없으면 마지막 페이지
    except Exception as e:
        return jsonify({"ok": False, "error": f"{name}: {e}"})

    if not all_posts:
        return jsonify({"ok": False, "error": f"{name}: 글 목록을 찾지 못했습니다 (구조 변경/차단 가능성)"})

    # 댓글 많은 순 정렬 → 화제글이 위로. 댓글수 없는 사이트는 원래 순서 유지.
    def cnum(p):
        try:
            return int(p.get("comments") or 0)
        except (ValueError, TypeError):
            return 0
    sorted_by_comment = any(cnum(p) > 0 for p in all_posts)
    if sorted_by_comment:
        all_posts.sort(key=cnum, reverse=True)
    return jsonify({"ok": True, "site": name, "sorted": sorted_by_comment,
                    "pages": n, "posts": all_posts[:80]})


def collect_one(url):
    """글 1건 수집 → raw 저장. 수집 데이터/경로/이미지 반환."""
    data = scrape(url)
    out_dir = make_out_dir(data["title"])
    with open(os.path.join(out_dir, "content.txt"), "w", encoding="utf-8") as f:
        f.write(f"제목: {data['title']}\n주소: {data['url']}\n")
        f.write("=" * 60 + "\n\n")
        f.write(data["text"])
        if data["images"]:
            f.write("\n\n" + "=" * 60 + "\n[이미지 주소]\n")
            f.write("\n".join(data["images"]))
    saved_imgs = download_images(data["images"], out_dir, data["referer"])
    with open(os.path.join(out_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump({"title": data["title"], "url": url, "resolved_url": data["url"],
                   "collected_at": datetime.datetime.now().isoformat(timespec="seconds"),
                   "text_chars": len(data["text"]), "images_saved": saved_imgs},
                  f, ensure_ascii=False, indent=2)
    return {"data": data, "out_dir": out_dir, "images": saved_imgs}


def site_label(url):
    host = urlparse(url).netloc
    for k, v in [("blog.naver", "네이버블로그"), ("dcinside", "디시인사이드"),
                 ("fmkorea", "에펨코리아"), ("ruliweb", "루리웹"), ("theqoo", "더쿠"),
                 ("pann.nate", "네이트판"), ("bobaedream", "보배드림"), ("mlbpark", "엠팍")]:
        if k in host:
            return v
    return host


STYLE_SYSTEM = """당신은 국내 커뮤니티 콘텐츠를 '나만의 콘텐츠'로 각색하는 작가입니다.
원문을 그대로 복붙하지 말고, 반드시 본인 표현으로 재구성해서 두 가지 버전을 만듭니다.

# 버전 A — 렉카체 (숏폼 나레이션, 45~60초 분량)
이슈 유튜버 나레이션 톤. 구조 고정:
1. 훅(첫 3초): 결론의 냄새만 풍기는 의문/도치형 한 문장 ("아니 이게 커뮤를 반으로 갈랐습니다")
2. 상황 전개: 원문 상황을 3~4문장으로 압축. "~했다고 합니다" 전문(傳聞)체로, 단정하지 않기
3. 반응: 여론이 갈리는 지점 묘사 ("근데 댓글 여론이 심상치 않습니다")
4. 마무리: 시청자에게 공 넘기기 ("여러분이라면 어느 쪽이십니까?")
톤: 과장 수식어(충격/난리/역대급) OK. 문장 짧게. "~인데요" "~습니다" 종결.

# 버전 B — 커뮤체 (커뮤니티 재업로드용 글)
- 음슴체 기본("~함" "~임" "~라는데" "~각임")
- 제목 어그로+정보형 ("MBTI로 소개팅 거른 결말.jpg")
- 본문: 상황 요약 → 핵심 장면 → 떡밥 질문으로 마무리 ("니들 생각은 어떰?")
- ㅋㅋ 2~4개, 확장자 드립(.jpg .txt) 활용. 반말이되 조롱 아님

# 절대 금지선
- 실명·실존 인물/업체 특정 비방 (익명화해도 특정되면 금지)
- 성별·지역·세대 집단 혐오 (vs 구도 '소개'는 OK, 한쪽 '조롱'은 금지)
- 원문에 없는 사실·결말 창작 (형용사 과장은 OK, 없던 전개 지어내기 금지)
- 원문 통짜 복붙 (직접 인용은 한두 줄까지)

# 출력 형식 (마크다운)
## 제목 후보
- 후보 3개

## 버전 A — 렉카체
(내용)

## 버전 B — 커뮤체
(내용)

한국어로만 작성하고, 위 마크다운 구조를 그대로 지키세요."""


def adapt_with_claude(data):
    """수집 데이터를 렉카체/커뮤체로 각색. 마크다운 문자열 반환."""
    client = get_anthropic_client()
    body = (data.get("text") or "")[:8000]  # 토큰 상한 방어
    user = (f"아래 커뮤니티 글을 각색해줘.\n\n"
            f"[출처] {data.get('site', '')} / {data.get('url', '')}\n"
            f"[제목] {data.get('title', '')}\n\n[본문]\n{body}")
    msg = client.messages.create(
        model=ADAPT_MODEL,
        max_tokens=8000,
        system=STYLE_SYSTEM,
        messages=[{"role": "user", "content": user}],
    )
    parts = [b.text for b in msg.content if getattr(b, "type", "") == "text"]
    return "\n".join(parts).strip()


@app.route("/api/keystatus")
def api_keystatus():
    return jsonify({"has_key": bool(get_api_key()), "has_sdk": HAS_ANTHROPIC, "model": ADAPT_MODEL})


@app.route("/api/setkey", methods=["POST"])
def api_setkey():
    key = (request.get_json(silent=True) or {}).get("key", "").strip()
    if not key:
        return jsonify({"ok": False, "error": "키가 비어 있습니다"})
    with open(KEY_FILE, "w", encoding="utf-8") as f:
        f.write(key)
    return jsonify({"ok": True})


@app.route("/api/collect", methods=["POST"])
def api_collect():
    urls = (request.get_json(silent=True) or {}).get("urls", [])
    results = []
    for url in urls:
        url = url.strip()
        if not url:
            continue
        try:
            c = collect_one(url)
            results.append({"url": url, "ok": True, "title": c["data"]["title"],
                            "dir": os.path.relpath(c["out_dir"], BASE),
                            "chars": len(c["data"]["text"]), "images": len(c["images"])})
        except Exception as e:
            results.append({"url": url, "ok": False, "error": str(e)})
    return jsonify({"results": results})


@app.route("/api/produce", methods=["POST"])
def api_produce():
    """수집 → Claude 각색 → drafts 저장. 각색 결과 반환."""
    urls = (request.get_json(silent=True) or {}).get("urls", [])
    results = []
    for url in urls:
        url = url.strip()
        if not url:
            continue
        try:
            c = collect_one(url)
            data = dict(c["data"])
            data["site"] = site_label(url)
            adapted = adapt_with_claude(data)
            draft_path = os.path.join(c["out_dir"], "draft.md")
            with open(draft_path, "w", encoding="utf-8") as f:
                f.write(f"# {data['title']}\n\n원문: {data['url']}\n출처: {data['site']}\n\n---\n\n{adapted}\n")
            results.append({"url": url, "ok": True, "title": data["title"],
                            "dir": os.path.relpath(c["out_dir"], BASE), "draft": adapted})
        except Exception as e:
            results.append({"url": url, "ok": False, "error": str(e)})
    return jsonify({"results": results})


# ──────────────────────────────── UI

PAGE = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>커뮤니티 로컬 수집기</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Malgun Gothic', Pretendard, sans-serif; margin: 0; background: #f4f5f7; color: #1f2328; }
  .wrap { max-width: 860px; margin: 0 auto; padding: 24px 16px 60px; }
  h1 { font-size: 20px; } h2 { font-size: 15px; margin: 28px 0 8px; }
  .card { background: #fff; border: 1px solid #e1e4e8; border-radius: 10px; padding: 16px; }
  button { background: #2563eb; color: #fff; border: 0; border-radius: 8px; padding: 8px 14px;
           font-size: 14px; cursor: pointer; margin: 2px; }
  button.gray { background: #6b7280; }
  button.prod { background: #9333ea; }
  button.mini { padding: 3px 9px; font-size: 12px; margin: 0 0 0 4px; }
  button:disabled { opacity: .5; cursor: wait; }
  textarea { width: 100%; height: 90px; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; font-size: 13px; }
  input[type=password] { padding: 8px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; }
  .post { display: flex; gap: 8px; align-items: center; padding: 5px 2px; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
  .post .ttl { flex: 1; }
  .post .cmt { color: #dc2626; font-size: 12px; white-space: nowrap; }
  .post .rowbtns { white-space: nowrap; }
  .log { font-size: 13px; line-height: 1.7; white-space: pre-wrap; }
  .ok { color: #15803d; } .err { color: #b91c1c; }
  .hint { color: #6b7280; font-size: 12px; }
  .draft { margin-bottom: 14px; }
  pre.dtext { white-space: pre-wrap; background: #faf9fb; border: 1px solid #ece9f2;
              border-radius: 8px; padding: 12px; font-size: 13px; font-family: inherit; margin-top: 6px; }
</style></head><body><div class="wrap">
<h1>📥 커뮤니티 로컬 수집기</h1>
<p class="hint">수집한 글은 이 프로그램 폴더의 <b>collected/오늘날짜/</b> 아래에 저장됩니다. "제작"은 수집 후 AI가 렉카체·커뮤체로 각색합니다.</p>

<div class="card" style="margin-bottom:12px">
  <b>🤖 AI 설정 (제작 기능용)</b>
  <div id="keyStatus" class="hint" style="margin:6px 0">확인 중...</div>
  <input type="password" id="apikey" placeholder="Anthropic API 키 (sk-ant-...)" style="width:65%">
  <button onclick="saveKey()">키 저장</button>
  <div class="hint" style="margin-top:6px">키는 이 폴더 <b>api_key.txt</b>에만 저장됩니다(외부 전송 없음). 발급: console.anthropic.com</div>
</div>

<h2>1. 인기글 목록 불러오기</h2>
<div class="card">
  <button onclick="loadHot('dcinside')">디시 실베</button>
  <button onclick="loadHot('ruliweb')">루리웹 베스트</button>
  <button onclick="loadHot('fmkorea')">에펨 포텐</button>
  <button onclick="loadHot('theqoo')">더쿠 핫게</button>
  <button onclick="loadHot('nate')">네이트판</button>
  <button onclick="loadHot('bobae')">보배드림</button>
  <button onclick="loadHot('mlbpark')">엠팍 불펜</button>
  <div id="hotStatus" class="hint" style="margin-top:8px"></div>
  <div id="hotList"></div>
  <div id="hotActions" style="display:none; margin-top:10px">
    <button onclick="collectChecked()">✅ 체크한 글 수집</button>
    <button class="prod" onclick="produceChecked()">🎬 체크한 글 수집+제작</button>
    <button class="gray" onclick="toggleAll()">전체 선택/해제</button>
  </div>
</div>

<h2>2. 주소로 직접 수집</h2>
<div class="card">
  <textarea id="urls" placeholder="글 주소를 한 줄에 하나씩 붙여넣으세요&#10;https://blog.naver.com/ranto28/224329396519&#10;https://gall.dcinside.com/board/view/?id=dcbest&no=..."></textarea>
  <div style="margin-top:8px">
    <button onclick="collectTextarea()">📥 수집 시작</button>
    <button class="prod" onclick="produceTextarea()">🎬 수집 후 제작</button>
  </div>
</div>

<h2>3. 결과</h2>
<div class="card"><div id="log" class="log hint">아직 수집한 글이 없습니다.</div></div>

<script>
const $ = id => document.getElementById(id);
let HOT = [];
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function disableAll(on){document.querySelectorAll('button').forEach(b=>b.disabled=on);}

async function loadHot(site) {
  $('hotStatus').textContent = '불러오는 중...';
  $('hotList').innerHTML = ''; $('hotActions').style.display = 'none';
  try {
    const r = await (await fetch('/api/hot?site=' + site)).json();
    if (!r.ok) { $('hotStatus').innerHTML = '<span class="err">' + esc(r.error) + '</span>'; return; }
    HOT = r.posts;
    $('hotStatus').textContent = r.site + ' — ' + r.posts.length + '건 (' + r.pages + '페이지'
      + (r.sorted ? ', 댓글 많은 순' : '') + ')';
    $('hotList').innerHTML = r.posts.map((p, i) =>
      `<div class="post">
         <input type="checkbox" class="pick" data-i="${i}">
         <span class="ttl">${esc(p.title)}</span>
         ${p.comments ? `<span class="cmt">💬${esc(p.comments)}</span>` : ''}
         <span class="rowbtns">
           <button class="mini gray" onclick="viewIdx(${i})">보기</button>
           <button class="mini prod" onclick="produceIdx(${i})">제작</button>
         </span>
       </div>`).join('');
    $('hotActions').style.display = 'block';
  } catch (e) { $('hotStatus').innerHTML = '<span class="err">요청 실패: ' + e + '</span>'; }
}
function viewIdx(i){ window.open(HOT[i].url, '_blank'); }
function produceIdx(i){ produce([HOT[i].url]); }
function checkedUrls(){ return [...document.querySelectorAll('.pick:checked')].map(b => HOT[b.dataset.i].url); }
function toggleAll() {
  const boxes = [...document.querySelectorAll('.pick')];
  const on = boxes.some(b => !b.checked);
  boxes.forEach(b => b.checked = on);
}

async function collect(urls) {
  if (!urls.length) { alert('수집할 주소가 없습니다'); return; }
  $('log').textContent = urls.length + '건 수집 중... (이미지 포함이라 시간이 좀 걸립니다)';
  disableAll(true);
  try {
    const r = await (await fetch('/api/collect', { method: 'POST',
      headers: {'Content-Type': 'application/json'}, body: JSON.stringify({urls}) })).json();
    $('log').innerHTML = r.results.map(x => x.ok
      ? `<div class="ok">✅ ${esc(x.title)} — 글자 ${x.chars.toLocaleString()}자, 이미지 ${x.images}장 → ${esc(x.dir)}</div>`
      : `<div class="err">❌ ${esc(x.url)}<br>&nbsp;&nbsp;사유: ${esc(x.error)}</div>`).join('');
  } catch (e) { $('log').innerHTML = '<span class="err">수집 요청 실패: ' + e + '</span>'; }
  disableAll(false);
}
async function produce(urls) {
  if (!urls.length) { alert('제작할 주소가 없습니다'); return; }
  $('log').textContent = urls.length + '건 제작 중... (수집 후 AI가 각색합니다. 글당 20~40초 걸려요)';
  disableAll(true);
  try {
    const r = await (await fetch('/api/produce', { method: 'POST',
      headers: {'Content-Type': 'application/json'}, body: JSON.stringify({urls}) })).json();
    $('log').innerHTML = r.results.map(x => x.ok
      ? `<div class="draft"><div class="ok">🎬 ${esc(x.title)} → ${esc(x.dir)}/draft.md</div>`
        + `<pre class="dtext">${esc(x.draft)}</pre></div>`
      : `<div class="err">❌ ${esc(x.url)}<br>&nbsp;&nbsp;사유: ${esc(x.error)}</div>`).join('');
  } catch (e) { $('log').innerHTML = '<span class="err">제작 요청 실패: ' + e + '</span>'; }
  disableAll(false);
}
function collectChecked(){ collect(checkedUrls()); }
function produceChecked(){ produce(checkedUrls()); }
function collectTextarea(){ collect($('urls').value.split('\\n').map(s => s.trim()).filter(Boolean)); }
function produceTextarea(){ produce($('urls').value.split('\\n').map(s => s.trim()).filter(Boolean)); }

async function refreshKey(){
  try {
    const r = await (await fetch('/api/keystatus')).json();
    $('keyStatus').innerHTML = !r.has_sdk
      ? '<span class="err">anthropic 패키지 없음 — start.bat을 다시 실행해 설치하세요</span>'
      : (r.has_key ? '<span class="ok">✅ API 키 설정됨 (모델: ' + esc(r.model) + ') — 제작 사용 가능</span>'
                   : '<span class="err">API 키 미설정 — 제작하려면 키를 입력하세요</span>');
  } catch (e) { $('keyStatus').innerHTML = '<span class="err">상태 확인 실패</span>'; }
}
async function saveKey(){
  const key = $('apikey').value.trim();
  if (!key) { alert('키를 입력하세요'); return; }
  const r = await (await fetch('/api/setkey', { method: 'POST',
    headers: {'Content-Type': 'application/json'}, body: JSON.stringify({key}) })).json();
  if (r.ok) { $('apikey').value = ''; refreshKey(); } else { alert(r.error); }
}
window.addEventListener('load', refreshKey);
</script>
</div></body></html>"""


@app.route("/")
def index():
    return render_template_string(PAGE)


if __name__ == "__main__":
    os.makedirs(OUT_ROOT, exist_ok=True)
    print("=" * 50)
    print("  커뮤니티 로컬 수집기 실행 중")
    print("  브라우저에서 http://127.0.0.1:8747 을 여세요")
    print("  종료: 이 창을 닫거나 Ctrl+C")
    print("=" * 50)
    app.run(host="127.0.0.1", port=8747, debug=False)
