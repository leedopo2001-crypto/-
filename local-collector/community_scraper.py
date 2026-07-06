"""
커뮤니티/블로그 글 긁어오기 (네이버블로그 / 에펨코리아 / 디시인사이드)
- 본문 txt 저장 + 이미지 다운로드
- 에펨코리아 Cloudflare 차단은 cloudscraper로 우회 시도

사용법:
    python community_scraper.py https://www.fmkorea.com/best/10021193504
    python community_scraper.py https://gall.dcinside.com/board/view/?id=...&no=...
    python community_scraper.py https://blog.naver.com/ranto28/224329396519

여러 글:
    python community_scraper.py URL1 URL2 ...
이미지 없이 본문만:
    python community_scraper.py --no-img URL
"""

import os
import re
import sys
import requests
from urllib.parse import urlparse
from bs4 import BeautifulSoup

try:
    import cloudscraper
    HAS_CLOUD = True
except ImportError:
    HAS_CLOUD = False

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
HEADERS = {"User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9"}

# 사이트별 설정: 본문 셀렉터(우선순위), 제목 셀렉터, Referer
SITES = {
    "naver": {
        "match": "blog.naver.com",
        "body": ["div.se-main-container", "div#postViewArea", "div.post-view"],
        "title": ["div.se-title-text", "meta[property='og:title']"],
        "para": "p.se-text-paragraph",
        "referer": "https://blog.naver.com/",
    },
    "fmkorea": {
        "match": "fmkorea.com",
        "body": ["div.rd_body article .xe_content", "article .xe_content",
                 "div.xe_content"],
        "title": ["h1.np_18px", "meta[property='og:title']"],
        "para": None,
        "referer": "https://www.fmkorea.com/",
    },
    "dcinside": {
        "match": "dcinside.com",
        "body": ["div.write_div", "div.writing_view_box"],
        "title": ["span.title_subject", "h3.title .title_subject",
                  "meta[property='og:title']"],
        "para": None,
        "referer": "https://gall.dcinside.com/",
    },
}


def detect_site(url):
    for name, cfg in SITES.items():
        if cfg["match"] in url:
            return name, cfg
    return None, None


def make_session():
    """Cloudflare 우회용 세션. cloudscraper 있으면 사용."""
    if HAS_CLOUD:
        return cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "windows", "mobile": False}
        )
    return requests.Session()


def clean_line(t):
    return t.replace("\u200b", "").replace("\ufeff", "").strip()


def safe_filename(name):
    name = re.sub(r'[\\/:*?"<>|\n\r\t]', "_", name)
    return name.strip()[:80] or "post"


def naver_view_url(url):
    """네이버는 PostView 주소로 변환해야 본문이 보임"""
    m = re.search(r"blog\.naver\.com/([^/?]+)/(\d+)", url)
    if m:
        return (f"https://blog.naver.com/PostView.naver"
                f"?blogId={m.group(1)}&logNo={m.group(2)}")
    return url


def get_title(soup, selectors):
    for sel in selectors:
        el = soup.select_one(sel)
        if el:
            if el.name == "meta":
                return el.get("content", "").strip()
            return clean_line(el.get_text())
    return "제목없음"


def scrape_post(url, sess):
    site, cfg = detect_site(url)
    if cfg is None:
        raise ValueError(f"지원하지 않는 사이트: {url}")

    fetch_url = naver_view_url(url) if site == "naver" else url
    r = sess.get(fetch_url, headers=HEADERS, timeout=25)
    r.encoding = r.apparent_encoding or "utf-8"
    html = r.text

    # Cloudflare 챌린지 감지
    if "Just a moment" in html or "Checking your browser" in html:
        raise RuntimeError("Cloudflare 차단에 막힘 (cloudscraper로도 통과 못함)")

    soup = BeautifulSoup(html, "lxml")

    body = None
    for sel in cfg["body"]:
        body = soup.select_one(sel)
        if body:
            break
    if body is None:
        return {"site": site, "title": get_title(soup, cfg["title"]),
                "text": "(본문 못 찾음 - F12로 본문 div class 확인 필요)",
                "images": [], "url": fetch_url}

    title = get_title(soup, cfg["title"])

    # 본문 텍스트
    if cfg["para"]:
        paras = body.select(cfg["para"])
        lines = [clean_line(p.get_text()) for p in paras] if paras \
            else [clean_line(x) for x in body.get_text("\n").split("\n")]
    else:
        lines = [clean_line(x) for x in body.get_text("\n").split("\n")]
    text = "\n".join(l for l in lines if l)

    # 이미지
    images = []
    for img in body.select("img"):
        src = (img.get("data-lazy-src") or img.get("data-original")
               or img.get("src") or "")
        if src.startswith("//"):
            src = "https:" + src
        if src.startswith("http") and "blank" not in src:
            images.append(src.split("?")[0] if "naver" in src else src)

    return {"site": site, "title": title, "text": text,
            "images": images, "url": fetch_url, "referer": cfg["referer"]}


def download_images(result, sess):
    if not result["images"]:
        return 0, None
    folder = safe_filename(result["title"]) + "_images"
    os.makedirs(folder, exist_ok=True)
    h = dict(HEADERS)
    h["Referer"] = result.get("referer", "")
    ok = 0
    for i, src in enumerate(result["images"], 1):
        try:
            resp = sess.get(src, headers=h, timeout=25)
            if resp.status_code != 200 or not resp.content:
                print(f"    [이미지 {i}] 실패 (status {resp.status_code})")
                continue
            ext = os.path.splitext(urlparse(src).path)[1].lower()
            if ext not in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
                ctype = resp.headers.get("Content-Type", "")
                ext = {"image/jpeg": ".jpg", "image/png": ".png",
                       "image/gif": ".gif", "image/webp": ".webp"}.get(ctype, ".jpg")
            with open(os.path.join(folder, f"{i:02d}{ext}"), "wb") as f:
                f.write(resp.content)
            ok += 1
        except Exception as e:
            print(f"    [이미지 {i}] 오류: {e}")
    return ok, folder


def save_post(result):
    fname = safe_filename(result["title"]) + ".txt"
    with open(fname, "w", encoding="utf-8") as f:
        f.write(f"제목: {result['title']}\n주소: {result['url']}\n")
        f.write(f"이미지 {len(result['images'])}개\n" + "=" * 60 + "\n\n")
        f.write(result["text"])
        if result["images"]:
            f.write("\n\n" + "=" * 60 + "\n[이미지 주소]\n")
            f.write("\n".join(result["images"]))
    return fname


if __name__ == "__main__":
    args = sys.argv[1:]
    get_images = True
    if "--no-img" in args:
        get_images = False
        args.remove("--no-img")
    if not args:
        print("사용법: python community_scraper.py [--no-img] <글주소> [주소2 ...]")
        sys.exit(1)
    if not HAS_CLOUD:
        print("경고: cloudscraper 미설치 -> 에펨코리아는 차단될 수 있음")
        print("      pip install cloudscraper 권장\n")

    sess = make_session()
    for url in args:
        try:
            result = scrape_post(url, sess)
            fname = save_post(result)
            print(f"[저장완료] {fname}  ({result['site']})")
            print(f"  제목: {result['title']}")
            print(f"  본문 {len(result['text'])}자, 이미지 {len(result['images'])}개")
            if get_images:
                ok, folder = download_images(result, sess)
                if folder:
                    print(f"  이미지 {ok}/{len(result['images'])}개 저장 -> {folder}/")
            print()
        except Exception as e:
            print(f"[실패] {url}\n  오류: {e}\n")
