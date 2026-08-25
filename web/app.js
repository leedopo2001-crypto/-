// /t/:code 로 접속해도 동작하도록 루트 절대 경로로 import 한다.
import { formatDistance, haversineKm, interpolateGreatCircle, speedKmh, totalDistanceKm } from '/lib/geo.js';
import { cleanLocations } from '/lib/outlier.js';
import { easeInOutCubic, tween } from '/lib/animation.js';
import { buildTrack, startReplay } from '/lib/replay.js';
import { demoRows, demoSession } from '/lib/demo-route.js';

const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.HERE_CONFIG || {};

const el = (id) => document.getElementById(id);
const overlay = el('overlay');
const overlayIcon = el('overlayIcon');
const overlayTitle = el('overlayTitle');
const overlayDesc = el('overlayDesc');
const statusDot = el('statusDot');
const statusLabel = el('statusLabel');
const userNameEl = el('userName');
const lastUpdateEl = el('lastUpdate');
const distanceEl = el('distance');
const speedEl = el('speed');
const fitButton = el('fitButton');
const followButton = el('followButton');
const replayButton = el('replayButton');
const filteredNote = el('filteredNote');
const demoBadge = el('demoBadge');
const lastUpdateLabel = el('lastUpdateLabel');
const speedLabel = el('speedLabel');

function showOverlay(icon, title, desc) {
  overlayIcon.textContent = icon;
  overlayTitle.textContent = title;
  overlayDesc.textContent = desc || '';
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

function getShortCode() {
  const match = window.location.pathname.match(/\/t\/([a-z0-9]+)/i);
  if (match) return match[1];
  return new URLSearchParams(window.location.search).get('t');
}

const shortCode = getShortCode();
const isDemo =
  new URLSearchParams(window.location.search).get('demo') === '1' ||
  shortCode === 'demo';

const supabaseReady = Boolean(SUPABASE_URL) && !SUPABASE_URL.includes('your-project-ref');

if (isDemo) {
  demoBadge.classList.remove('hidden');
  // 배지가 좌상단 줌 컨트롤과 겹치므로 컨트롤을 아래로 내린다 (styles.css).
  document.body.classList.add('is-demo');
  start('demo');
} else if (!supabaseReady) {
  showOverlay(
    '⚙️',
    '설정 필요',
    'web/config.js 에 Supabase URL과 키를 입력해주세요. 설정 없이 둘러보려면 주소 끝에 ?demo=1 을 붙이세요.',
  );
} else if (!shortCode) {
  showOverlay('🔗', '잘못된 링크', '공유받은 링크를 다시 확인해주세요.');
} else {
  start(shortCode);
}

function start(code) {
  // 데모 모드는 Supabase 를 전혀 건드리지 않는다.
  const client = isDemo
    ? null
    : window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 2 } },
    });

  const map = L.map('map', { zoomControl: true, attributionControl: true }).setView(
    [36.5, 127.8],
    6,
  );

  // CARTO Voyager: OSM 데이터 기반이지만 대비가 낮아 경로 선이 잘 보인다.
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    subdomains: 'abcd',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  }).addTo(map);

  const markerIcon = L.divIcon({
    html: '<div class="location-marker"></div>',
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  const startIcon = L.divIcon({
    html: '<div class="start-marker"></div>',
    className: '',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });

  // 지나온 경로: 아래쪽 굵은 흰 선 + 위쪽 빨간 선으로 어떤 배경에서도 보이게 한다.
  const trailCasing = L.polyline([], {
    color: '#ffffff',
    weight: 8,
    opacity: 0.9,
    lineJoin: 'round',
    lineCap: 'round',
  }).addTo(map);
  const trail = L.polyline([], {
    color: '#E53935',
    weight: 4,
    opacity: 1,
    lineJoin: 'round',
    lineCap: 'round',
  }).addTo(map);

  // 재생 중에만 쓰는 "최근 구간" 강조선. 전체를 같은 색으로 그리면 지금 어디를
  // 지나는 중인지 안 보이기 때문에, 최근 일부만 굵고 진하게 덧그린다.
  const recentTrail = L.polyline([], {
    color: '#8B0000',
    weight: 7,
    opacity: 0,
    lineJoin: 'round',
    lineCap: 'round',
  }).addTo(map);

  let marker = null;
  let startMarker = null;
  let points = [];
  let rawCount = 0;
  let removedCount = 0;
  let lastTimestamp = null;
  let followMode = true;
  let cancelTween = null;
  let cancelReplay = null;

  followButton.addEventListener('click', () => {
    setFollow(!followMode);
    if (followMode && points.length > 0) {
      map.panTo(latLngOf(points.at(-1)));
    }
  });

  const REPLAY_DURATION_MS = 12_000;

  function setFollow(on) {
    followMode = on;
    followButton.classList.toggle('active', on);
    followButton.textContent = on ? '🎯 따라가기 켜짐' : '🎯 따라가기 꺼짐';
  }

  function stopReplay() {
    if (cancelReplay) cancelReplay();
    cancelReplay = null;
    recentTrail.setStyle({ opacity: 0 });
    recentTrail.setLatLngs([]);
    replayButton.textContent = '▶ 경로 재생';
    replayButton.classList.remove('active');
    lastUpdateLabel.textContent = '마지막 업데이트';
    speedLabel.textContent = '최근 속도';
    drawTrail();
    if (points.length > 0 && marker) marker.setLatLng(latLngOf(points.at(-1)));
    renderStats();
  }

  replayButton.addEventListener('click', () => {
    if (cancelReplay) {
      stopReplay();
      return;
    }
    if (points.length < 2) return;

    // 재생 중에는 따라가기를 끄고 전체 경로가 보이게 맞춘다.
    setFollow(false);
    map.fitBounds(trail.getBounds(), { padding: [70, 70], maxZoom: 17 });

    if (cancelTween) { cancelTween(); cancelTween = null; }

    const track = buildTrack(points);
    // 최근 구간은 전체의 18% 로 잡는다 (너무 길면 강조 효과가 사라진다).
    const recentKm = Math.max(0.05, track.totalKm * 0.18);

    replayButton.textContent = '⏹ 재생 중지';
    replayButton.classList.add('active');
    recentTrail.setStyle({ opacity: 1 });
    lastUpdateLabel.textContent = '재생 진행';
    speedLabel.textContent = '기록 시각';

    cancelReplay = startReplay({
      track,
      durationMs: REPLAY_DURATION_MS,
      onFrame: ({ position, segmentIndex, distanceKm, progress }) => {
        const head = [position.latitude, position.longitude];

        const travelled = points.slice(0, segmentIndex + 1).map(latLngOf);
        travelled.push(head);
        trailCasing.setLatLngs(travelled);
        trail.setLatLngs(travelled);

        // 최근 recentKm 만큼만 잘라서 덧그린다.
        const fromKm = Math.max(0, distanceKm - recentKm);
        let fromIndex = track.cumulative.findIndex((km) => km >= fromKm);
        if (fromIndex < 0) fromIndex = 0;
        const recent = points.slice(fromIndex, segmentIndex + 1).map(latLngOf);
        recent.push(head);
        recentTrail.setLatLngs(recent);

        if (marker) marker.setLatLng(head);

        distanceEl.textContent = formatDistance(distanceKm);
        lastUpdateEl.textContent = `재생 ${Math.round(progress * 100)}%`;
        const at = points[Math.min(segmentIndex + 1, points.length - 1)];
        speedEl.textContent = at?.instant
          ? at.instant.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
          : '—';
      },
      onDone: stopReplay,
    });
  });

  fitButton.addEventListener('click', () => {
    if (points.length === 0) return;
    setFollow(false);
    if (points.length === 1) {
      map.setView(latLngOf(points[0]), 16);
    } else {
      map.fitBounds(trail.getBounds(), { padding: [60, 60], maxZoom: 17 });
    }
  });

  // 사용자가 지도를 직접 움직이면 따라가기를 끈다.
  map.on('dragstart', () => {
    if (followMode) setFollow(false);
  });

  function latLngOf(point) {
    return [point.latitude, point.longitude];
  }

  function toPoint(row) {
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return {
      latitude,
      longitude,
      accuracy: row.accuracy == null ? null : Number(row.accuracy),
      instant: new Date(row.updated_at || Date.now()),
    };
  }

  function setStatus(state) {
    statusDot.className = 'status-dot';
    if (state === 'active') {
      statusDot.classList.add('active');
      statusLabel.textContent = '실시간 추적 중';
    } else if (state === 'ended') {
      statusDot.classList.add('ended');
      statusLabel.textContent = '추적 종료됨';
    }
  }

  function formatAgo(date) {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 5) return '방금';
    if (diff < 60) return `${diff}초 전`;
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins}분 전`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}시간 ${mins % 60}분 전`;
  }

  function refreshElapsed() {
    // 재생 중에는 이 칸이 진행률을 보여주고 있으므로 건드리지 않는다.
    if (cancelReplay) return;
    if (lastTimestamp) lastUpdateEl.textContent = formatAgo(lastTimestamp);
  }
  setInterval(refreshElapsed, 10_000);

  function renderStats() {
    replayButton.disabled = points.length < 2;

    distanceEl.textContent = formatDistance(totalDistanceKm(points));

    if (points.length >= 2) {
      const kmh = speedKmh(points.at(-2), points.at(-1));
      speedEl.textContent = kmh == null ? '—' : `${kmh.toFixed(1)} km/h`;
    } else {
      speedEl.textContent = '—';
    }

    lastTimestamp = points.at(-1)?.instant ?? null;
    refreshElapsed();

    if (removedCount > 0) {
      filteredNote.textContent = `부정확한 GPS 신호 ${removedCount}개를 걸러냈습니다`;
      filteredNote.classList.remove('hidden');
    } else {
      filteredNote.classList.add('hidden');
    }
  }

  function drawTrail() {
    const path = points.map(latLngOf);
    trailCasing.setLatLngs(path);
    trail.setLatLngs(path);

    if (points.length > 0 && !startMarker) {
      startMarker = L.marker(latLngOf(points[0]), { icon: startIcon })
        .addTo(map)
        .bindTooltip('출발', { direction: 'top', offset: [0, -8] });
    }
  }

  /** 마커를 이전 위치에서 새 위치로 대권 경로 따라 부드럽게 이동시킨다. */
  function moveMarker(from, to) {
    if (cancelTween) cancelTween();

    if (!marker) {
      marker = L.marker(latLngOf(to), { icon: markerIcon }).addTo(map);
      return;
    }
    if (!from) {
      marker.setLatLng(latLngOf(to));
      return;
    }

    // 이동 거리에 따라 애니메이션 길이를 정한다 (0.4s ~ 2.5s).
    const km = haversineKm(from, to);
    const durationMs = Math.min(2500, Math.max(400, km * 900));

    cancelTween = tween({
      durationMs,
      easing: easeInOutCubic,
      onUpdate: (progress) => {
        const position = interpolateGreatCircle(from, to, progress);
        marker.setLatLng([position.latitude, position.longitude]);
        if (followMode) map.panTo([position.latitude, position.longitude], { animate: false });
      },
      onDone: () => {
        cancelTween = null;
      },
    });
  }

  function applyRows(rows, { initial } = { initial: false }) {
    const incoming = rows.map(toPoint).filter(Boolean);
    if (incoming.length === 0) return;

    const previousLast = points.at(-1) ?? null;
    rawCount += incoming.length;

    const merged = [...points, ...incoming].sort(
      (a, b) => a.instant.getTime() - b.instant.getTime(),
    );
    const cleaned = cleanLocations(merged);
    points = cleaned.points;
    removedCount = rawCount - points.length;

    // 재생 중이면 데이터만 갱신하고 화면은 건드리지 않는다. 여기서 다시 그리면
    // 재생 프레임과 서로 덮어써서 마커가 튄다. 재생이 끝나면 stopReplay 가
    // drawTrail/renderStats 를 불러 최신 상태로 복구한다.
    if (cancelReplay) return;

    drawTrail();
    renderStats();

    const newLast = points.at(-1);
    if (!newLast) return;

    if (initial) {
      marker = marker || L.marker(latLngOf(newLast), { icon: markerIcon }).addTo(map);
      marker.setLatLng(latLngOf(newLast));
      if (points.length === 1) {
        map.setView(latLngOf(newLast), 16);
      } else {
        map.fitBounds(trail.getBounds(), { padding: [60, 60], maxZoom: 17 });
      }
    } else {
      moveMarker(previousLast, newLast);
    }
  }

  async function loadInitial() {
    if (isDemo) {
      userNameEl.textContent = `${demoSession.user_name} 경로`;
      setStatus('ended');
      applyRows(demoRows(), { initial: true });
      hideOverlay();
      return;
    }

    try {
      const { data: session, error: sessErr } = await client
        .from('sessions')
        .select('*')
        .eq('short_code', code)
        .maybeSingle();

      if (sessErr) throw sessErr;
      if (!session) {
        showOverlay('❓', '세션을 찾을 수 없습니다', '링크를 다시 확인해주세요.');
        return;
      }

      userNameEl.textContent = session.user_name
        ? `${session.user_name}님의 위치`
        : '실시간 위치';
      setStatus(session.active ? 'active' : 'ended');

      const { data: locs, error: locErr } = await client
        .from('locations')
        .select('*')
        .eq('session_code', code)
        .order('updated_at', { ascending: true })
        .limit(500);

      if (locErr) throw locErr;

      if (locs && locs.length > 0) {
        applyRows(locs, { initial: true });
        hideOverlay();
      } else if (session.active) {
        showOverlay('📡', '위치 수신 대기 중', '곧 첫 위치가 도착합니다.');
      } else {
        showOverlay('🏁', '추적이 종료되었습니다', '기록된 위치가 없습니다.');
      }

      subscribeRealtime();
    } catch (e) {
      console.error(e);
      showOverlay('⚠️', '연결 오류', e.message || '잠시 후 다시 시도해주세요.');
    }
  }

  function subscribeRealtime() {
    client
      .channel(`loc-${code}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'locations',
          filter: `session_code=eq.${code}`,
        },
        (payload) => {
          applyRows([payload.new]);
          hideOverlay();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `short_code=eq.${code}`,
        },
        (payload) => {
          if (payload.new.active === false) setStatus('ended');
        },
      )
      .subscribe();
  }

  loadInitial();
}
