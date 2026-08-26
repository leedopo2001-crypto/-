import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import {
  createSession,
  endSession,
  isSupabaseConfigured,
  pushLocation,
} from '../api/supabase';
import { renderTemplate } from '../storage';
import { SMS_WEB_FALLBACK, sendSms } from '../sms';
import MessagePreviewModal from '../components/MessagePreviewModal';
import { formatDistance, haversineKm } from '../lib/geo';
import { saveSession } from '../lib/history';
import { shakeLabel, startShakeMonitor } from '../lib/shake';

function formatElapsed(secondsAgo) {
  if (secondsAgo < 5) return '방금';
  if (secondsAgo < 60) return `${secondsAgo}초 전`;
  const mins = Math.floor(secondsAgo / 60);
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}시간 ${mins % 60}분 전`;
}

function formatCountdown(seconds) {
  if (seconds <= 0) return '곧';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}초 후`;
  return `${mins}분 ${secs}초 후`;
}

export default function TrackingScreen({ settings, onStop }) {
  const intervalMinutes = settings.trackingIntervalMinutes || 5;
  const intervalMs = intervalMinutes * 60 * 1000;

  const [status, setStatus] = useState('starting');
  const [session, setSession] = useState(null);
  const [updateCount, setUpdateCount] = useState(0);
  const [lastSentAt, setLastSentAt] = useState(null);
  const [nextInMs, setNextInMs] = useState(intervalMs);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);
  const [previewMessage, setPreviewMessage] = useState(null);
  const [distanceKm, setDistanceKm] = useState(0);
  const [speedKmh, setSpeedKmh] = useState(null);
  const [shakeIndex, setShakeIndex] = useState(null);

  const tickTimerRef = useRef(null);
  const pushTimerRef = useRef(null);
  const stoppedRef = useRef(false);
  const sessionRef = useRef(null);
  const pointsRef = useRef([]);
  const shakeRef = useRef(null);
  const startedAtRef = useRef(new Date().toISOString());

  useEffect(() => {
    activateKeepAwakeAsync('tracking');
    return () => deactivateKeepAwake('tracking');
  }, []);

  useEffect(() => {
    const stop = startShakeMonitor((index) => {
      shakeRef.current = index;
      setShakeIndex(index);
    });
    return stop;
  }, []);

  useEffect(() => {
    startTracking();
    return () => {
      stoppedRef.current = true;
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    };
  }, []);

  useEffect(() => {
    tickTimerRef.current = setInterval(() => {
      setTick((t) => t + 1);
      setNextInMs((ms) => Math.max(0, ms - 1000));
    }, 1000);
    return () => clearInterval(tickTimerRef.current);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && sessionRef.current && !stoppedRef.current) {
        pushOnce();
      }
    });
    return () => sub.remove();
  }, []);

  async function startTracking() {
    if (!isSupabaseConfigured) {
      setError(
        'Supabase가 설정되지 않았습니다.\n.env 파일을 설정한 뒤 앱을 재시작해주세요.',
      );
      setStatus('error');
      return;
    }

    const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
    if (locStatus !== 'granted') {
      setError('위치 권한이 필요합니다.');
      setStatus('error');
      return;
    }

    try {
      const created = await createSession({ userName: settings.userName });
      sessionRef.current = created;
      setSession(created);
      setStatus('active');

      await openSmsComposer(created);
      await pushOnce();
      scheduleNext();
    } catch (e) {
      setError(e.message || '세션 생성에 실패했습니다.');
      setStatus('error');
    }
  }

  async function openSmsComposer(created) {
    try {
      const message = renderTemplate(settings.trackingMessageTemplate, {
        이름: settings.userName || 'here',
        링크: created.url,
        위치: created.url,
      });
      const phones = (settings.contacts || []).map((c) => c.phone);
      if (phones.length === 0) return;

      const { result } = await sendSms(phones, message);
      if (result === SMS_WEB_FALLBACK) {
        setPreviewMessage(message);
      }
    } catch {
      // composer 취소는 무시
    }
  }

  async function pushOnce() {
    if (stoppedRef.current) return;
    const current = sessionRef.current;
    if (!current) return;
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      await pushLocation({
        shortCode: current.shortCode,
        ownerToken: current.ownerToken,
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy,
      });

      // 로컬 기록: 종료 후에도 이 기기에서 동선/통계를 볼 수 있게 쌓아둔다.
      const point = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? null,
        t: new Date().toISOString(),
        shake: shakeRef.current,
      };
      const previous = pointsRef.current.at(-1);
      pointsRef.current.push(point);

      if (previous) {
        const legKm = haversineKm(previous, point);
        setDistanceKm((km) => km + legKm);
        const dtMs = new Date(point.t) - new Date(previous.t);
        setSpeedKmh(dtMs > 0 ? legKm / (dtMs / 3_600_000) : null);
      }

      setUpdateCount((c) => c + 1);
      setLastSentAt(new Date());
    } catch (e) {
      // 위치 실패는 조용히 넘어감, 다음 주기에 재시도
    }
  }

  function scheduleNext() {
    if (stoppedRef.current) return;
    setNextInMs(intervalMs);
    pushTimerRef.current = setTimeout(async () => {
      await pushOnce();
      scheduleNext();
    }, intervalMs);
  }

  async function handleResend() {
    if (!session) return;
    await openSmsComposer(session);
  }

  async function handleStop() {
    Alert.alert(
      '추적 종료',
      '정말 실시간 위치 추적을 종료할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '종료',
          style: 'destructive',
          onPress: async () => {
            stoppedRef.current = true;
            if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
            if (sessionRef.current) {
              try {
                await endSession(
                  sessionRef.current.shortCode,
                  sessionRef.current.ownerToken,
                );
              } catch {}

              // 앱을 강제 종료하면 여기까지 못 오므로, 정상 종료했을 때만 남는다.
              try {
                await saveSession({
                  shortCode: sessionRef.current.shortCode,
                  url: sessionRef.current.url,
                  userName: settings.userName || '',
                  startedAt: startedAtRef.current,
                  endedAt: new Date().toISOString(),
                  intervalMinutes,
                  points: pointsRef.current,
                });
              } catch {}
            }
            onStop();
          },
        },
      ],
    );
  }

  const lastSentLabel = lastSentAt
    ? formatElapsed(Math.floor((Date.now() - lastSentAt.getTime()) / 1000))
    : '-';
  const nextLabel = formatCountdown(Math.floor(nextInMs / 1000));

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.statusPill}>
          <View style={[styles.dot, status === 'active' && styles.dotActive]} />
          <Text style={styles.statusText}>
            {status === 'starting' && '시작 중...'}
            {status === 'active' && '실시간 추적 중'}
            {status === 'error' && '오류'}
          </Text>
        </View>

        <Text style={styles.title}>
          {settings.userName || '나'}님의 위치를{'\n'}공유하고 있습니다
        </Text>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {session && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>실시간 공유 링크</Text>
            <Text style={styles.cardUrl} numberOfLines={2}>
              {session.url}
            </Text>
            <Pressable style={styles.resendButton} onPress={handleResend}>
              <Text style={styles.resendText}>📨 연락처에 링크 다시 보내기</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.statsRow}>
          <Stat label="업데이트" value={`${updateCount}회`} />
          <Stat label="마지막" value={lastSentLabel} />
          <Stat label="다음" value={nextLabel} />
        </View>

        <View style={styles.statsRow}>
          <Stat label="이동 거리" value={formatDistance(distanceKm)} />
          <Stat
            label="최근 속도"
            value={Number.isFinite(speedKmh) ? `${speedKmh.toFixed(1)} km/h` : '—'}
          />
          <Stat
            label="흔들림"
            value={
              Number.isFinite(shakeIndex)
                ? `${shakeIndex} · ${shakeLabel(shakeIndex)}`
                : '—'
            }
          />
        </View>

        <Text style={styles.hint}>
          {intervalMinutes}분마다 자동으로 새 위치가 전송됩니다.{'\n'}
          Expo Go에서는 앱을 켜둔 상태여야 합니다.
        </Text>

        <Pressable style={styles.stopButton} onPress={handleStop}>
          <Text style={styles.stopText}>🛑 추적 종료</Text>
        </Pressable>
      </ScrollView>

      <MessagePreviewModal
        visible={previewMessage !== null}
        message={previewMessage || ''}
        contacts={settings.contacts || []}
        onClose={() => setPreviewMessage(null)}
      />
    </View>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scroll: { padding: 24, paddingTop: 60 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFF3E0',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    marginBottom: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFA000',
    marginRight: 8,
  },
  dotActive: { backgroundColor: '#2E7D32' },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#222',
    lineHeight: 32,
    marginBottom: 24,
  },
  errorBox: {
    backgroundColor: '#FFEBEE',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  errorText: { color: '#B71C1C', fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: '#F5F5F5',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  cardUrl: {
    fontSize: 15,
    color: '#1976D2',
    marginBottom: 12,
  },
  resendButton: {
    backgroundColor: '#E3F2FD',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  resendText: { color: '#1565C0', fontWeight: '600', fontSize: 14 },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderRadius: 10,
    paddingVertical: 12,
    marginHorizontal: 4,
  },
  statLabel: { fontSize: 11, color: '#999', marginBottom: 4 },
  statValue: { fontSize: 15, fontWeight: '600', color: '#222' },
  hint: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 18,
  },
  stopButton: {
    backgroundColor: '#E53935',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  stopText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});
