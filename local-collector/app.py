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

BASE = os.path.dirname(os.path.abspath(__file__))
OUT_ROOT = os.path.join(BASE, "collected")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

app = Flask(__name__)


# ──────────────────────────────── 공통 유틸

def fetch(url, referer=None, timeout=20):
    headers = {
        "User-Agent": UA,
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.5",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
    }
    if referer:
        headers["Referer"] = referer
    r = requests.get(url, headers=headers, timeout=timeout)
    r.raise_for_status()
    if not r.encoding or r.encoding.lower() == "iso-8859-1":
        r.encoding = r.apparent_encoding
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
    t = soup.select_one("span.title_subject") or soup.select_one("title")
    title = t.get_text(strip=True) if t else "dcinside_post"
    body = soup.select_one("div.write_div")
    if not body:
        raise ValueError("본문(write_div)을 찾지 못했습니다")
    text = clean_text(body.get_text("\n"))
    imgs = [i.get("src") or i.get("data-original") or "" for i in body.select("img")]
    imgs = [u if u.startswith("http") else "https:" + u for u in imgs if u]
    return {"title": title, "url": url, "text": text, "images": imgs,
            "referer": "https://gall.dcinside.com/"}


def scrape_fmkorea(url):
    soup = BeautifulSoup(fetch(url, referer="https://www.fmkorea.com/").text, "lxml")
    t = soup.select_one("h1 .np_18px_span") or soup.select_one("h1") or soup.select_one("title")
    title = t.get_text(strip=True) if t else "fmkorea_post"
    body = soup.select_one("article .xe_content") or soup.select_one(".xe_content")
    if not body:
        raise ValueError("본문(xe_content)을 찾지 못했습니다 — 차단 페이지일 수 있음")
    text = clean_text(body.get_text("\n"))
    imgs = []
    for i in body.select("img"):
        src = i.get("data-original") or i.get("src") or ""
        if src.startswith("//"):
            src = "https:" + src
        elif src.startswith("/"):
            src = "https://www.fmkorea.com" + src
        if src.startswith("http"):
            imgs.append(src)
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
    return scrape_generic(url)


# ──────────────────────────────── 인기글 목록

def hot_dcinside():
    soup = BeautifulSoup(
        fetch("https://gall.dcinside.com/board/lists/?id=dcbest",
              referer="https://www.dcinside.com/").text, "lxml")
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


def hot_ruliweb():
    soup = BeautifulSoup(
        fetch("https://bbs.ruliweb.com/best/humor", referer="https://bbs.ruliweb.com/").text, "lxml")
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


def hot_fmkorea():
    soup = BeautifulSoup(
        fetch("https://www.fmkorea.com/best", referer="https://www.fmkorea.com/").text, "lxml")
    posts, seen = [], set()
    for a in soup.select("h3.title a, .li_best2_pop0 a, .hotdeal_var8 a"):
        href = a.get("href") or ""
        if not re.search(r"/\d{6,}", href):
            continue
        href = urljoin("https://www.fmkorea.com/", href.split("?")[0])
        if href in seen:
            continue
        seen.add(href)
        title = a.get_text(" ", strip=True)
        m = re.search(r"\[(\d+)\]\s*$", title)
        comments = m.group(1) if m else ""
        title = re.sub(r"\s*\[\d+\]\s*$", "", title)
        if title:
            posts.append({"title": title, "url": href, "comments": comments})
    return posts


HOT_SOURCES = {
    "dcinside": ("디시 실시간베스트", hot_dcinside),
    "ruliweb": ("루리웹 유머베스트", hot_ruliweb),
    "fmkorea": ("에펨 포텐", hot_fmkorea),
}


# ──────────────────────────────── API

@app.route("/api/hot")
def api_hot():
    site = request.args.get("site", "")
    if site not in HOT_SOURCES:
        return jsonify({"ok": False, "error": "알 수 없는 사이트"}), 400
    name, fn = HOT_SOURCES[site]
    try:
        posts = fn()
        if not posts:
            return jsonify({"ok": False, "error": f"{name}: 글 목록을 찾지 못했습니다 (구조 변경/차단 가능성)"})
        return jsonify({"ok": True, "site": name, "posts": posts[:40]})
    except Exception as e:
        return jsonify({"ok": False, "error": f"{name}: {e}"})


@app.route("/api/collect", methods=["POST"])
def api_collect():
    urls = (request.get_json(silent=True) or {}).get("urls", [])
    results = []
    for url in urls:
        url = url.strip()
        if not url:
            continue
        try:
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
            results.append({"url": url, "ok": True, "title": data["title"],
                            "dir": os.path.relpath(out_dir, BASE),
                            "chars": len(data["text"]), "images": len(saved_imgs)})
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
  button:disabled { opacity: .5; cursor: wait; }
  textarea { width: 100%; height: 90px; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; font-size: 13px; }
  .post { display: flex; gap: 8px; align-items: baseline; padding: 5px 2px; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
  .post .cmt { color: #dc2626; font-size: 12px; white-space: nowrap; }
  .log { font-size: 13px; line-height: 1.7; white-space: pre-wrap; }
  .ok { color: #15803d; } .err { color: #b91c1c; }
  .hint { color: #6b7280; font-size: 12px; }
</style></head><body><div class="wrap">
<h1>📥 커뮤니티 로컬 수집기</h1>
<p class="hint">수집한 글은 이 프로그램 폴더의 <b>collected/오늘날짜/</b> 아래에 저장됩니다.</p>

<h2>1. 인기글 목록 불러오기</h2>
<div class="card">
  <button onclick="loadHot('dcinside')">디시 실베</button>
  <button onclick="loadHot('ruliweb')">루리웹 베스트</button>
  <button onclick="loadHot('fmkorea')">에펨 포텐</button>
  <div id="hotStatus" class="hint" style="margin-top:8px"></div>
  <div id="hotList"></div>
  <div id="hotActions" style="display:none; margin-top:10px">
    <button onclick="collectChecked()">✅ 체크한 글 수집</button>
    <button class="gray" onclick="toggleAll()">전체 선택/해제</button>
  </div>
</div>

<h2>2. 주소로 직접 수집</h2>
<div class="card">
  <textarea id="urls" placeholder="글 주소를 한 줄에 하나씩 붙여넣으세요&#10;https://blog.naver.com/ranto28/224329396519&#10;https://gall.dcinside.com/board/view/?id=dcbest&no=..."></textarea>
  <div style="margin-top:8px"><button onclick="collectTextarea()">📥 수집 시작</button></div>
</div>

<h2>3. 결과</h2>
<div class="card"><div id="log" class="log hint">아직 수집한 글이 없습니다.</div></div>

<script>
const $ = id => document.getElementById(id);
async function loadHot(site) {
  $('hotStatus').textContent = '불러오는 중...';
  $('hotList').innerHTML = ''; $('hotActions').style.display = 'none';
  try {
    const r = await (await fetch('/api/hot?site=' + site)).json();
    if (!r.ok) { $('hotStatus').innerHTML = '<span class="err">' + r.error + '</span>'; return; }
    $('hotStatus').textContent = r.site + ' — ' + r.posts.length + '건';
    $('hotList').innerHTML = r.posts.map((p, i) =>
      `<label class="post"><input type="checkbox" class="pick" value="${p.url}">
       <span>${p.title}</span>${p.comments ? `<span class="cmt">💬${p.comments}</span>` : ''}</label>`).join('');
    $('hotActions').style.display = 'block';
  } catch (e) { $('hotStatus').innerHTML = '<span class="err">요청 실패: ' + e + '</span>'; }
}
function toggleAll() {
  const boxes = [...document.querySelectorAll('.pick')];
  const on = boxes.some(b => !b.checked);
  boxes.forEach(b => b.checked = on);
}
async function collect(urls) {
  if (!urls.length) { alert('수집할 주소가 없습니다'); return; }
  $('log').textContent = urls.length + '건 수집 중... (이미지 포함이라 시간이 좀 걸립니다)';
  document.querySelectorAll('button').forEach(b => b.disabled = true);
  try {
    const r = await (await fetch('/api/collect', { method: 'POST',
      headers: {'Content-Type': 'application/json'}, body: JSON.stringify({urls}) })).json();
    $('log').innerHTML = r.results.map(x => x.ok
      ? `<div class="ok">✅ ${x.title} — 글자 ${x.chars.toLocaleString()}자, 이미지 ${x.images}장 → ${x.dir}</div>`
      : `<div class="err">❌ ${x.url}<br>&nbsp;&nbsp;사유: ${x.error}</div>`).join('');
  } catch (e) { $('log').innerHTML = '<span class="err">수집 요청 실패: ' + e + '</span>'; }
  document.querySelectorAll('button').forEach(b => b.disabled = false);
}
function collectChecked() {
  collect([...document.querySelectorAll('.pick:checked')].map(b => b.value));
}
function collectTextarea() {
  collect($('urls').value.split('\\n').map(s => s.trim()).filter(Boolean));
}
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
