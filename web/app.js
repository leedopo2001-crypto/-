(function () {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.HERE_CONFIG || {};

  function getShortCode() {
    const path = window.location.pathname;
    const match = path.match(/\/t\/([a-z0-9]+)/i);
    if (match) return match[1];
    const params = new URLSearchParams(window.location.search);
    return params.get('t');
  }

  const shortCode = getShortCode();

  const overlay = document.getElementById('overlay');
  const overlayIcon = document.getElementById('overlayIcon');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayDesc = document.getElementById('overlayDesc');
  const statusDot = document.getElementById('statusDot');
  const statusLabel = document.getElementById('statusLabel');
  const userNameEl = document.getElementById('userName');
  const lastUpdateEl = document.getElementById('lastUpdate');
  const updateCountEl = document.getElementById('updateCount');

  function showOverlay(icon, title, desc) {
    overlayIcon.textContent = icon;
    overlayTitle.textContent = title;
    overlayDesc.textContent = desc || '';
    overlay.classList.remove('hidden');
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
  }

  if (!SUPABASE_URL || SUPABASE_URL.includes('your-project-ref')) {
    showOverlay('⚙️', '설정 필요', 'web/config.js 에 Supabase URL과 키를 입력해주세요.');
    return;
  }

  if (!shortCode) {
    showOverlay('🔗', '잘못된 링크', '공유받은 링크를 다시 확인해주세요.');
    return;
  }

  const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 2 } },
  });

  const map = L.map('map', { zoomControl: true, attributionControl: false }).setView([36.5, 127.8], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(map);

  const markerIcon = L.divIcon({
    html: '<div class="location-marker"></div>',
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  let marker = null;
  let updateCount = 0;
  let lastTimestamp = null;
  let firstLocation = true;

  function setStatus(state) {
    statusDot.className = 'status-dot';
    if (state === 'active') {
      statusDot.classList.add('active');
      statusLabel.textContent = '실시간 추적 중';
    } else if (state === 'ended') {
      statusDot.classList.add('ended');
      statusLabel.textContent = '추적 종료됨';
    } else {
      statusLabel.textContent = state;
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

  function updateLastUpdateLabel() {
    if (!lastTimestamp) return;
    lastUpdateEl.textContent = formatAgo(lastTimestamp);
  }

  setInterval(updateLastUpdateLabel, 10000);

  function applyLocation(loc) {
    const lat = Number(loc.latitude);
    const lng = Number(loc.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const latlng = [lat, lng];
    if (!marker) {
      marker = L.marker(latlng, { icon: markerIcon }).addTo(map);
    } else {
      marker.setLatLng(latlng);
    }

    if (firstLocation) {
      map.setView(latlng, 16);
      firstLocation = false;
    } else {
      map.panTo(latlng);
    }

    updateCount++;
    updateCountEl.textContent = `${updateCount}회`;
    lastTimestamp = new Date(loc.updated_at || Date.now());
    updateLastUpdateLabel();
  }

  async function loadInitial() {
    try {
      const { data: session, error: sessErr } = await client
        .from('sessions')
        .select('*')
        .eq('short_code', shortCode)
        .maybeSingle();

      if (sessErr) throw sessErr;
      if (!session) {
        showOverlay('❓', '세션을 찾을 수 없습니다', '링크를 다시 확인해주세요.');
        return;
      }

      userNameEl.textContent = session.user_name ? `${session.user_name}님의 위치` : '실시간 위치';
      setStatus(session.active ? 'active' : 'ended');

      const { data: locs, error: locErr } = await client
        .from('locations')
        .select('*')
        .eq('session_code', shortCode)
        .order('updated_at', { ascending: true })
        .limit(200);

      if (locErr) throw locErr;

      if (locs && locs.length > 0) {
        locs.forEach(applyLocation);
        hideOverlay();
      } else if (session.active) {
        showOverlay('📡', '위치 수신 대기 중', '곧 첫 위치가 도착합니다.');
      } else {
        showOverlay('🏁', '추적이 종료되었습니다', '마지막 위치가 없습니다.');
      }

      subscribeRealtime();
    } catch (e) {
      console.error(e);
      showOverlay('⚠️', '연결 오류', e.message || '잠시 후 다시 시도해주세요.');
    }
  }

  function subscribeRealtime() {
    client
      .channel(`loc-${shortCode}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'locations',
          filter: `session_code=eq.${shortCode}`,
        },
        (payload) => {
          applyLocation(payload.new);
          hideOverlay();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `short_code=eq.${shortCode}`,
        },
        (payload) => {
          if (payload.new.active === false) {
            setStatus('ended');
          }
        },
      )
      .subscribe();
  }

  loadInitial();
})();
