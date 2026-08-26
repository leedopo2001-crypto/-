import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  buildTrackingUrl,
  getLocations,
  getSession,
  isSupabaseConfigured,
} from '../api/supabase';
import { formatDistance, haversineKm } from '../lib/geo';
import ViewerFrame from '../components/ViewerFrame';

const RECENT_KEY = '@here:watch-recent:v1';
const POLL_MS = 20_000;

/** 전체 링크든 코드만이든 코드로 정규화한다. 실패하면 null. */
function parseCode(input) {
  const trimmed = (input || '').trim();
  const fromUrl = trimmed.match(/\/t\/([a-z0-9]+)/i);
  if (fromUrl) return fromUrl[1].toLowerCase();
  if (/^[a-z0-9]{6,12}$/i.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

function formatAgo(iso) {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 5) return '방금';
  if (diff < 60) return `${diff}초 전`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}분 전`;
  return `${Math.floor(mins / 60)}시간 ${mins % 60}분 전`;
}

export default function WatchScreen({ onBack, initialCode }) {
  const [input, setInput] = useState('');
  const [recent, setRecent] = useState([]);
  const [watching, setWatching] = useState(null); // { code, url }
  const [session, setSession] = useState(null);
  const [points, setPoints] = useState([]);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);

  const pollRef = useRef(null);
  const sinceRef = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => setRecent(raw ? JSON.parse(raw) : []))
      .catch(() => {});
    // 마이페이지에서 공유 중인 사람을 탭해 들어온 경우, 코드 입력을 건너뛴다.
    if (initialCode) startWatching(initialCode);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // "N분 전" 표시가 멈춰 보이지 않게 30초마다 다시 그린다.
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  async function rememberRecent(code, name) {
    const next = [
      { code, name: name || '', at: new Date().toISOString() },
      ...recent.filter((r) => r.code !== code),
    ].slice(0, 8);
    setRecent(next);
    AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
  }

  async function startWatching(rawInput) {
    setError(null);
    const code = parseCode(rawInput);
    if (!code) {
      setError('코드나 공유 링크를 확인해주세요. (예: ab12cd34 또는 https://…/t/ab12cd34)');
      return;
    }
    if (!isSupabaseConfigured) {
      setError('Supabase가 설정되지 않았습니다. .env 파일을 확인해주세요.');
      return;
    }

    Keyboard.dismiss();

    try {
      const found = await getSession(code);
      if (!found) {
        setError('해당 코드의 공유 세션을 찾을 수 없습니다.');
        return;
      }

      sinceRef.current = null;
      setPoints([]);
      setSession(found);
      setWatching({ code, url: buildTrackingUrl(code) });
      rememberRecent(code, found.user_name);

      await pollOnce(code);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => pollOnce(code), POLL_MS);
    } catch (e) {
      setError(e.message || '연결에 실패했습니다.');
    }
  }

  async function pollOnce(code) {
    try {
      const rows = await getLocations(code, sinceRef.current);
      if (rows.length > 0) {
        sinceRef.current = rows.at(-1).updated_at;
        setPoints((prev) => [...prev, ...rows]);
      }
      const s = await getSession(code);
      if (s) {
        setSession(s);
        if (!s.active && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch {
      // 일시적 오류는 다음 폴링에서 재시도
    }
  }

  function stopWatching() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setWatching(null);
    setSession(null);
    setPoints([]);
    setError(null);
  }

  let distanceKm = 0;
  for (let i = 1; i < points.length; i += 1) {
    distanceKm += haversineKm(points[i - 1], points[i]);
  }
  const last = points.at(-1);

  // 위치가 안 오는 게 "정지"인지 "신호 끊김"인지 구분해서 알려준다.
  // 약속한 주기를 한 번 더 넘겼을 때만 경고한다.
  const intervalMin = Number(session?.interval_minutes) || null;
  let staleReason = null;
  if (session?.active && last && intervalMin) {
    const overdueMs =
      Date.now() - new Date(last.updated_at).getTime() - intervalMin * 60_000;
    if (overdueMs > intervalMin * 60_000) {
      staleReason = Number.isFinite(last.battery) && last.battery <= 15
        ? `⚠️ 위치가 늦습니다. 마지막 배터리 ${last.battery}% — 방전됐을 수 있습니다.`
        : '⚠️ 약속한 주기보다 위치가 늦습니다. 네트워크가 끊겼거나 앱이 종료됐을 수 있습니다.';
    }
  }

  // ===== 지켜보는 중 화면 =====
  if (watching) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={stopWatching} hitSlop={12}>
            <Text style={styles.headerBack}>‹ 다른 코드</Text>
          </Pressable>
          <Text style={styles.headerTitle}>
            {session?.user_name ? `${session.user_name}님` : '지켜보기'}
          </Text>
          <Pressable onPress={onBack} hitSlop={12}>
            <Text style={styles.headerClose}>닫기</Text>
          </Pressable>
        </View>

        <View style={styles.watchBar}>
          <View
            style={[styles.dot, session?.active ? styles.dotActive : styles.dotEnded]}
          />
          <Text style={styles.watchBarText}>
            {session?.active ? '실시간 추적 중' : '추적 종료됨'}
            {' · '}
            {formatDistance(distanceKm)}
            {' · '}
            {formatAgo(last?.updated_at)}
            {Number.isFinite(last?.battery) ? ` · 🔋${last.battery}%` : ''}
          </Text>
        </View>

        {staleReason && (
          <View style={styles.staleBar}>
            <Text style={styles.staleText}>{staleReason}</Text>
          </View>
        )}

        <ViewerFrame url={watching.url} />
      </View>
    );
  }

  // ===== 코드 입력 화면 =====
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.headerBack}>‹ 뒤로</Text>
        </Pressable>
        <Text style={styles.headerTitle}>지켜보기</Text>
        <View style={{ minWidth: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>
          공유받은 링크나 코드를 입력하면{'\n'}앱 안에서 바로 위치를 볼 수 있습니다.
        </Text>

        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="링크 또는 코드 (예: ab12cd34)"
          placeholderTextColor="#aaa"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Pressable style={styles.watchButton} onPress={() => startWatching(input)}>
          <Text style={styles.watchButtonText}>👀 지켜보기 시작</Text>
        </Pressable>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {recent.length > 0 && (
          <>
            <Text style={styles.recentLabel}>최근 본 세션</Text>
            {recent.map((r) => (
              <Pressable
                key={r.code}
                style={styles.recentRow}
                onPress={() => startWatching(r.code)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.recentName}>{r.name || '이름 없음'}</Text>
                  <Text style={styles.recentCode}>{r.code}</Text>
                </View>
                <Text style={styles.recentArrow}>›</Text>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 12,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  headerBack: { fontSize: 16, color: '#E53935', minWidth: 80 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#222' },
  headerClose: { fontSize: 16, color: '#999', minWidth: 80, textAlign: 'right' },
  scroll: { padding: 20 },
  lead: { fontSize: 15, color: '#555', lineHeight: 22, marginBottom: 20 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#222',
    backgroundColor: '#fafafa',
    marginBottom: 12,
  },
  watchButton: {
    backgroundColor: '#E53935',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  watchButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  errorBox: {
    backgroundColor: '#FFEBEE',
    borderRadius: 10,
    padding: 14,
    marginTop: 14,
  },
  errorText: { color: '#B71C1C', fontSize: 14, lineHeight: 20 },
  recentLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 28,
    marginBottom: 10,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  recentName: { fontSize: 15, fontWeight: '600', color: '#222' },
  recentCode: { fontSize: 13, color: '#999', marginTop: 2 },
  recentArrow: { fontSize: 20, color: '#bbb' },
  watchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  dotActive: { backgroundColor: '#2E7D32' },
  dotEnded: { backgroundColor: '#9E9E9E' },
  watchBarText: { fontSize: 13, color: '#555', fontWeight: '600' },
  staleBar: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#FFF4E5',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0e0c0',
  },
  staleText: { fontSize: 12.5, color: '#8a5a00', lineHeight: 18 },
});
