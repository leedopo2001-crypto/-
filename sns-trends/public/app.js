/* 트렌드 데일리 — 프런트엔드 */
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const state = {
    geo: 'KR',
    date: 'today',        // 'today' | 'YYYY-MM-DD'
    demo: new URLSearchParams(location.search).get('demo') === '1',
    dashboard: null,
    selectedKeyword: null,
  };

  const fmt = new Intl.NumberFormat('ko-KR');
  const fmtCompact = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 });

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------------------------------------------------------------- 툴팁
  const tooltip = $('#tooltip');
  function showTooltip(evt, name, value) {
    tooltip.innerHTML = `<span class="tt-name">${esc(name)}</span><br/><span class="tt-val">${esc(value)}</span>`;
    tooltip.hidden = false;
    const pad = 12;
    let x = evt.clientX + pad;
    let y = evt.clientY + pad;
    const r = tooltip.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = evt.clientY - r.height - pad;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }
  function hideTooltip() { tooltip.hidden = true; }

  // ------------------------------------------------- 가로 막대 차트 (SVG)
  // rows: [{ label, value, valueLabel }]
  function barChartSVG(rows, { valueSuffix = '' } = {}) {
    if (!rows.length) return '';
    const max = Math.max(...rows.map((r) => r.value), 1);
    const rowH = 26;
    const labelW = 118;
    const chartW = 560;
    const barMaxW = chartW - labelW - 90;
    const h = rows.length * rowH + 8;

    const bars = rows.map((r, i) => {
      const y = i * rowH + 6;
      const w = Math.max(3, Math.round((r.value / max) * barMaxW));
      const vLabel = r.valueLabel || fmtCompact.format(r.value) + valueSuffix;
      // 베이스라인 쪽은 각지고 데이터 끝만 4px 라운드
      const barH = 14;
      const rad = Math.min(4, w / 2);
      const barPath =
        `M ${labelW},${y} h ${w - rad} q ${rad},0 ${rad},${rad} ` +
        `v ${barH - rad * 2} q 0,${rad} ${-rad},${rad} h ${-(w - rad)} z`;
      return `
        <g class="bar-row" data-name="${esc(r.label)}" data-val="${esc(vLabel)}">
          <text class="cat-label" x="${labelW - 8}" y="${y + 12}" text-anchor="end">${esc(truncate(r.label, 12))}</text>
          <path class="bar" d="${barPath}"/>
          <text class="bar-label" x="${labelW + w + 6}" y="${y + 11.5}">${esc(vLabel)}</text>
          <rect class="bar-hit" x="0" y="${y - 3}" width="${chartW}" height="${rowH - 2}"/>
        </g>`;
    }).join('');

    return `
      <svg class="viz" viewBox="0 0 ${chartW} ${h}" role="img" aria-label="막대 차트">
        <line class="axis-line" x1="${labelW}" y1="2" x2="${labelW}" y2="${h - 2}"/>
        ${bars}
      </svg>`;
  }

  function truncate(s, n) {
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function attachChartTooltips(container) {
    container.querySelectorAll('.bar-row').forEach((g) => {
      g.addEventListener('mousemove', (e) => showTooltip(e, g.dataset.name, g.dataset.val));
      g.addEventListener('mouseleave', hideTooltip);
    });
  }

  // ---------------------------------------------------------------- API
  async function api(path, params = {}) {
    const q = new URLSearchParams(params);
    if (state.demo) q.set('demo', '1');
    const res = await fetch(`${path}?${q}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // ------------------------------------------------------------ 대시보드
  async function loadDashboard() {
    $('#google-body').innerHTML = '<div class="loading">불러오는 중…</div>';
    $('#wiki-body').innerHTML = '<div class="loading">불러오는 중…</div>';
    $('#youtube-body').innerHTML = '<div class="loading">불러오는 중…</div>';

    try {
      const data = state.date === 'today'
        ? await api('/api/dashboard', { geo: state.geo })
        : await api(`/api/history/${state.date}`, { geo: state.geo });
      state.dashboard = data;
      renderStatus(data);
      renderGoogle(data.googleTrends);
      renderWiki(data.wikipediaTop);
      renderYouTube(data.youtubeTrending);
    } catch (e) {
      const msg = `<div class="error-note">데이터를 불러오지 못했습니다: ${esc(e.message)}</div>`;
      $('#google-body').innerHTML = msg;
      $('#wiki-body').innerHTML = '';
      $('#youtube-body').innerHTML = '';
    }
  }

  function renderStatus(data) {
    const bar = $('#status-bar');
    bar.hidden = false;
    const time = data.generatedAt ? new Date(data.generatedAt).toLocaleString('ko-KR') : '';
    bar.innerHTML =
      (data.demo ? '<span class="demo-badge">샘플 데이터</span>' : '') +
      `기준일 <strong>${esc(data.date || '')}</strong> · ${esc(data.geo || '')} · 수집 시각 ${esc(time)}` +
      (data.demo ? ' — 실제 데이터는 인터넷 연결 후 새로고침하세요' : '');
  }

  function renderGoogle(trends) {
    const body = $('#google-body');
    if (!Array.isArray(trends)) {
      body.innerHTML = `<div class="error-note">구글 트렌드 수집 실패: ${esc(trends?.error || '알 수 없는 오류')}</div>`;
      return;
    }
    const max = Math.max(...trends.map((t) => t.traffic), 1);
    body.innerHTML = trends.slice(0, 20).map((t) => {
      const w = Math.max(1.5, (t.traffic / max) * 100);
      const news = t.news?.[0]
        ? `<div class="trend-news"><a href="${esc(t.news[0].url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">📰 ${esc(t.news[0].title)}</a></div>`
        : '';
      return `
        <div class="trend-row" data-kw="${esc(t.keyword)}" role="button" tabindex="0">
          <div class="trend-rank">${t.rank}</div>
          <div class="trend-main">
            <div class="trend-kw">${esc(t.keyword)}</div>
            <div class="trend-bar-track"><div class="trend-bar" style="width:${w}%"></div></div>
            ${news}
          </div>
          <div class="trend-traffic">${esc(t.trafficLabel || '')}<br/><span style="font-size:11px">검색량</span></div>
        </div>`;
    }).join('');

    body.querySelectorAll('.trend-row').forEach((row) => {
      const select = () => selectKeyword(row.dataset.kw, row);
      row.addEventListener('click', select);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter') select(); });
    });
  }

  function renderWiki(wiki) {
    const body = $('#wiki-body');
    if (!wiki || wiki.error || !wiki.articles?.length) {
      body.innerHTML = `<div class="error-note">위키피디아 데이터 수집 실패: ${esc(wiki?.error || '데이터 없음')}</div>`;
      return;
    }
    $('#wiki-sub').textContent = `${wiki.date} 기준 · ${wiki.lang}.wikipedia — 대중 관심사 지표`;
    body.innerHTML = `<ol class="rank-list">` + wiki.articles.map((a) => `
      <li>
        <span class="rank">${a.rank}</span>
        <span class="name"><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a></span>
        <span class="meta">${fmtCompact.format(a.views)}회 조회</span>
      </li>`).join('') + `</ol>`;
  }

  function renderYouTube(yt) {
    const body = $('#youtube-body');
    const sub = $('#youtube-sub');
    if (!yt || yt.error === 'no_key') {
      sub.textContent = '';
      body.innerHTML = `
        <div class="error-note">
          유튜브 패널은 <strong>YouTube Data API 키</strong>가 필요합니다 (무료).<br/><br/>
          1. <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener">Google Cloud Console</a>에서 YouTube Data API v3 활성화 후 API 키 발급<br/>
          2. <code>sns-trends/.env</code> 파일에 <code>YOUTUBE_API_KEY=발급받은키</code> 저장<br/>
          3. 서버 재시작 (<code>node server.js</code>)
        </div>`;
      return;
    }
    if (yt.error) {
      body.innerHTML = `<div class="error-note">유튜브 수집 실패: ${esc(yt.error)}</div>`;
      return;
    }
    sub.textContent = '지금 인기 급상승 동영상';
    body.innerHTML = yt.videos.map((v) => `
      <div class="yt-item">
        ${v.thumbnail
          ? `<img class="yt-thumb" src="${esc(v.thumbnail)}" alt="" loading="lazy"/>`
          : `<div class="yt-thumb-ph">▶️</div>`}
        <div class="yt-info">
          <div class="yt-title-line"><a href="${esc(v.url)}" target="_blank" rel="noopener">${v.rank}. ${esc(v.title)}</a></div>
          <div class="yt-meta">${esc(v.channel)} · 조회수 ${fmtCompact.format(v.views)}회</div>
        </div>
      </div>`).join('');
  }

  // ------------------------------------------------------- 키워드 상세
  async function selectKeyword(keyword, rowEl) {
    document.querySelectorAll('.trend-row.selected').forEach((el) => el.classList.remove('selected'));
    if (rowEl) rowEl.classList.add('selected');
    state.selectedKeyword = keyword;
    $('#keyword-input').value = keyword;

    const body = $('#keyword-body');
    body.innerHTML = '<div class="loading">분석 중…</div>';
    try {
      const data = await api('/api/keyword', { q: keyword, geo: state.geo });
      renderKeyword(data);
    } catch (e) {
      body.innerHTML = `<div class="error-note">키워드 분석 실패: ${esc(e.message)}</div>`;
    }
  }

  function renderKeyword(data) {
    const body = $('#keyword-body');
    const kw = data.keyword;

    // 스탯 타일 — 지난 24시간 콘텐츠 생산량
    const newsOk = data.news && !data.news.error;
    const ytOk = data.youtube && !data.youtube.error;
    const tiles = [];
    if (newsOk) {
      tiles.push({
        label: '뉴스 기사 (24시간)',
        value: fmt.format(data.news.last24h),
        note: `최근 ${data.news.sampled}건 표본 중 · 7일 ${fmt.format(data.news.last7d)}건`,
      });
    }
    if (ytOk) {
      tiles.push({
        label: '유튜브 신규 영상 (24시간)',
        value: fmtCompact.format(data.youtube.last24h),
        note: `7일 ${fmtCompact.format(data.youtube.last7d)}개 · 추정치`,
      });
    }

    // 생산량 비교 차트 (측정 가능한 소스만)
    const chartRows = [];
    if (newsOk) chartRows.push({ label: '뉴스 (24h)', value: data.news.last24h, valueLabel: `${fmt.format(data.news.last24h)}건` });
    if (newsOk) chartRows.push({ label: '뉴스 (7일)', value: data.news.last7d, valueLabel: `${fmt.format(data.news.last7d)}건` });
    if (ytOk) chartRows.push({ label: '유튜브 (24h)', value: data.youtube.last24h, valueLabel: `${fmtCompact.format(data.youtube.last24h)}개` });
    if (ytOk) chartRows.push({ label: '유튜브 (7일)', value: data.youtube.last7d, valueLabel: `${fmtCompact.format(data.youtube.last7d)}개` });

    body.innerHTML = `
      <div class="kw-title">「${esc(kw)}」<span class="kw-geo">${esc(data.geo || state.geo)}${data.demo ? ' · 샘플' : ''}</span></div>

      ${tiles.length ? `<div class="stat-row">${tiles.map((t) => `
        <div class="stat-tile">
          <div class="stat-label">${esc(t.label)}</div>
          <div class="stat-value">${esc(t.value)}</div>
          <div class="stat-note">${esc(t.note)}</div>
        </div>`).join('')}</div>` : ''}

      ${chartRows.length ? `
        <div class="chart-wrap">
          <div class="chart-title">콘텐츠 생산량 비교</div>
          ${barChartSVG(chartRows)}
        </div>` : ''}

      ${!ytOk && data.youtube?.error === 'no_key'
        ? `<div class="error-note" style="margin-bottom:12px">유튜브 영상 수는 API 키 설정 시 표시됩니다 (유튜브 카드 안내 참고)</div>` : ''}
      ${!newsOk ? `<div class="error-note" style="margin-bottom:12px">뉴스 데이터 수집 실패: ${esc(data.news?.error || '')}</div>` : ''}

      <div class="section-label">플랫폼에서 바로 보기</div>
      <div class="platform-links">
        ${(data.links || []).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.platform)} ↗</a>`).join('')}
      </div>

      ${newsOk && data.news.latest?.length ? `
        <div class="section-label">관련 최신 뉴스</div>
        <ul class="kw-news-list">
          ${data.news.latest.map((n) => `
            <li><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a><span class="src">${esc(n.source || '')}</span></li>`).join('')}
        </ul>` : ''}
    `;
    attachChartTooltips(body);
  }

  // ------------------------------------------------------------ 히스토리
  async function loadHistoryOptions() {
    try {
      const snapshots = await api('/api/history');
      const select = $('#date-select');
      const current = select.value;
      select.innerHTML = '<option value="today">오늘 (실시간)</option>' +
        [...new Set(snapshots.filter((s) => s.geo === state.geo).map((s) => s.date))]
          .map((d) => `<option value="${esc(d)}">${esc(d)} (저장됨)</option>`).join('');
      select.value = [...select.options].some((o) => o.value === current) ? current : 'today';
    } catch { /* 히스토리는 부가 기능 — 실패해도 무시 */ }
  }

  // ------------------------------------------------------------- 이벤트
  $('#geo-select').addEventListener('change', (e) => {
    state.geo = e.target.value;
    state.date = 'today';
    loadHistoryOptions();
    loadDashboard();
  });
  $('#date-select').addEventListener('change', (e) => {
    state.date = e.target.value;
    loadDashboard();
  });
  $('#refresh-btn').addEventListener('click', () => {
    state.date = 'today';
    $('#date-select').value = 'today';
    loadDashboard();
  });
  $('#keyword-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const kw = $('#keyword-input').value.trim();
    if (kw) selectKeyword(kw, null);
  });

  // ---------------------------------------------------------------- 시작
  loadHistoryOptions();
  loadDashboard();
})();
