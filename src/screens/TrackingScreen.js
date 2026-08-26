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
import * as Battery from 'expo-battery';
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
import { clearActive, loadActive, saveActive } from '../lib/activeSession';
import { checkStillness, pruneShakeSamples } from '../lib/anomaly';
import { PREFIX_STILLNESS, sendEmergencySms } from '../lib/alert';
import CountdownPrompt from '../components/CountdownPrompt';
import Icon from '../components/Icon';

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

export default function TrackingScreen({ settings, onStop, resume, identity }) {
  const intervalMinutes =
    (resume && resume.intervalMinutes) || settings.trackingIntervalMinutes || 5;
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
  const [batteryPct, setBatteryPct] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [stillnessPrompt, setStillnessPrompt] = useState(false);
  const [anomalyNote, setAnomalyNote] = useState(null);

  const tickTimerRef = useRef(null);
  const pushTimerRef = useRef(null);
  const stoppedRef = useRef(false);
  const sessionRef = useRef(null);
  const pointsRef = useRef([]);
  const queueRef = useRef([]);
  const shakeRef = useRef(null);
  const batteryRef = useRef(null);
  // 흔들림은 위치보다 촘촘히 표본을 남긴다. 5분 주기 위치만으로는 "움직였는가"를
  // 판단할 표본이 두세 개뿐이라 근거가 너무 얇다.
  const shakeSamplesRef = useRef([]);
  const snoozeUntilRef = useRef(0);
  const promptOpenRef = useRef(false);
  const startedAtRef = useRef(
    (resume && resume.startedAt) || new Date().toISOString(),
  );

  useEffect(() => {
    activateKeepAwakeAsync('tracking');
    return () => deactivateKeepAwake('tracking');
  }, []);

  useEffect(() => {
    let lastSampleAt = 0;
    const stop = startShakeMonitor((index) => {
      shakeRef.current = index;
      setShakeIndex(index);

      // 센서는 0.2초마다 오지만 판정에는 30초 간격이면 충분하다.
      // 그 구간의 최댓값을 남겨야 짧은 움직임을 놓치지 않는다.
      const now = Date.now();
      const samples = shakeSamplesRef.current;
      if (now - lastSampleAt >= 30_000) {
        lastSampleAt = now;
        samples.push({ t: now, index });
        shakeSamplesRef.current = pruneShakeSamples(samples, now);
      } else if (samples.length > 0 && index > samples[samples.length - 1].index) {
        samples[samples.length - 1].index = index;
      }
    });
    return stop;
  }, []);

  // 배터리는 위치를 찍을 때마다 같이 보낸다. 추적이 멈췄을 때 지켜보는 쪽이
  // 방전 때문인지 사고인지 구분할 수 있어야 한다.
  useEffect(() => {
    let subscription = null;
    const apply = (level) => {
      if (!Number.isFinite(level)) return;
      const pct = Math.round(level * 100);
      batteryRef.current = pct;
      setBatteryPct(pct);
    };

    Battery.getBatteryLevelAsync().then(apply).catch(() => {});
    try {
      subscription = Battery.addBatteryLevelListener(({ batteryLevel }) =>
        apply(batteryLevel),
      );
    } catch {
      // 배터리 API 가 없는 환경(웹 등)에서는 값 없이 진행한다.
    }
    return () => subscription?.remove();
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

  // 이상 감지: 30초마다 최근 창을 다시 판정한다.
  useEffect(() => {
    const anomaly = settings.anomaly;
    if (!anomaly?.enabled) return undefined;

    const timer = setInterval(() => {
      if (stoppedRef.current || promptOpenRef.current) return;
      if (Date.now() < snoozeUntilRef.current) return;

      const verdict = checkStillness({
        points: pointsRef.current,
        shakeSamples: shakeSamplesRef.current,
        config: anomaly,
        nowMs: Date.now(),
      });

      if (verdict.still) {
        promptOpenRef.current = true;
        setStillnessPrompt(true);
      }
    }, 30_000);

    return () => clearInterval(timer);
  }, [settings.anomaly]);

  function handleStillnessSafe() {
    promptOpenRef.current = false;
    setStillnessPrompt(false);
    // 같은 자리에 계속 있으면 곧바로 다시 뜨므로, 한 창만큼 쉬어준다.
    const windowMs = (settings.anomaly?.windowMinutes || 10) * 60_000;
    snoozeUntilRef.current = Date.now() + windowMs;
    setAnomalyNote(null);
  }

  async function handleStillnessTimeout() {
    promptOpenRef.current = false;
    setStillnessPrompt(false);
    snoozeUntilRef.current = Date.now() + 30 * 60_000;

    const { result } = await sendEmergencySms({
      settings,
      prefix: PREFIX_STILLNESS,
    });
    setAnomalyNote(
      result === 'no-contacts'
        ? '움직임이 없어 알리려 했지만 등록된 연락처가 없습니다.'
        : '움직임이 없어 긴급 연락처에 알렸습니다.',
    );
  }

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
      // 이어하기: 이미 만들어진 세션을 그대로 쓴다. 새로 만들면 예전 링크가
      // 살아있는 채로 버려지고, 받은 사람은 멈춘 화면을 보게 된다.
      if (resume) {
        sessionRef.current = {
          shortCode: resume.shortCode,
          ownerToken: resume.ownerToken,
          url: resume.url,
        };
        pointsRef.current = resume.points || [];
        queueRef.current = resume.queue || [];
        setPendingCount(queueRef.current.length);
        setUpdateCount(pointsRef.current.length);
        setDistanceKm(totalKmOf(pointsRef.current));
        setSession(sessionRef.current);
        setStatus('active');

        await pushOnce();
        scheduleNext();
        return;
      }

      const created = await createSession({
        userName: settings.userName,
        intervalMinutes,
        // 신원을 붙이면 연결된 사람들이 문자 없이도 이 세션을 볼 수 있다.
        identity,
      });
      sessionRef.current = created;
      setSession(created);
      setStatus('active');
      await persist();

      await openSmsComposer(created);
      await pushOnce();
      scheduleNext();
    } catch (e) {
      setError(e.message || '세션 생성에 실패했습니다.');
      setStatus('error');
    }
  }

  function totalKmOf(points) {
    let km = 0;
    for (let i = 1; i < points.length; i += 1) {
      km += haversineKm(points[i - 1], points[i]);
    }
    return km;
  }

  /** 진행 상태를 기기에 저장한다. 앱이 죽어도 여기까지는 남는다. */
  async function persist() {
    const current = sessionRef.current;
    if (!current) return;
    await saveActive({
      shortCode: current.shortCode,
      ownerToken: current.ownerToken,
      url: current.url,
      userName: settings.userName || '',
      startedAt: startedAtRef.current,
      intervalMinutes,
      points: pointsRef.current,
      queue: queueRef.current,
    });
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

  /**
   * 위치를 한 번 찍는다.
   *
   * 측정한 점은 무조건 로컬에 먼저 쌓고, 서버 전송은 큐를 통해서만 한다.
   * 그래서 지하철이나 터널처럼 네트워크가 끊긴 구간에서도 점을 잃지 않고,
   * 신호가 돌아오면 밀린 것부터 순서대로 올라간다.
   */
  async function pushOnce() {
    if (stoppedRef.current) return;
    const current = sessionRef.current;
    if (!current) return;

    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const point = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? null,
        t: new Date().toISOString(),
        shake: shakeRef.current,
        battery: batteryRef.current,
      };

      const previous = pointsRef.current.at(-1);
      pointsRef.current.push(point);
      queueRef.current.push(point);

      if (previous) {
        const legKm = haversineKm(previous, point);
        setDistanceKm((km) => km + legKm);
        const dtMs = new Date(point.t) - new Date(previous.t);
        setSpeedKmh(dtMs > 0 ? legKm / (dtMs / 3_600_000) : null);
      }
      setUpdateCount(pointsRef.current.length);

      await persist();
    } catch {
      // 위치 자체를 못 얻은 경우. 다음 주기에 다시 시도한다.
    }

    await flushQueue();
  }

  /** 큐에 밀린 위치를 오래된 것부터 올린다. 실패하면 남겨두고 다음에 재시도. */
  async function flushQueue() {
    const current = sessionRef.current;
    if (!current) return;

    let sentAny = false;
    while (queueRef.current.length > 0) {
      const point = queueRef.current[0];
      try {
        await pushLocation({
          shortCode: current.shortCode,
          ownerToken: current.ownerToken,
          latitude: point.latitude,
          longitude: point.longitude,
          accuracy: point.accuracy,
          battery: point.battery,
          shake: point.shake,
          recordedAt: point.t,
        });
        queueRef.current.shift();
        sentAny = true;
      } catch {
        // 네트워크가 아직 안 돌아왔다. 순서를 지켜야 하므로 여기서 멈춘다.
        break;
      }
    }

    setPendingCount(queueRef.current.length);
    if (sentAny) setLastSentAt(new Date());
    await persist();
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
              await clearActive();
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
              <Icon name="send" size={16} color="#1565C0" />
              <Text style={styles.resendText}>연락처에 링크 다시 보내기</Text>
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

        {pendingCount > 0 && (
          <View style={styles.pendingBox}>
            <Text style={styles.pendingText}>
              전송 대기 중인 위치 {pendingCount}개 · 신호가 돌아오면 자동으로
              올라갑니다
            </Text>
          </View>
        )}

        {Number.isFinite(batteryPct) && batteryPct <= 20 && (
          <View style={styles.batteryBox}>
            <Text style={styles.batteryText}>
              배터리 {batteryPct}% · 방전되면 추적이 멈춥니다
            </Text>
          </View>
        )}

        <Text style={styles.hint}>
          {intervalMinutes}분마다 자동으로 새 위치가 전송됩니다.{'\n'}
          Expo Go에서는 앱을 켜둔 상태여야 합니다.
        </Text>

        {anomalyNote && (
          <View style={styles.anomalyBox}>
            <Text style={styles.anomalyText}>{anomalyNote}</Text>
          </View>
        )}

        <Pressable style={styles.stopButton} onPress={handleStop}>
          <Icon name="stop" size={18} color="#fff" />
          <Text style={styles.stopText}>추적 종료</Text>
        </Pressable>
      </ScrollView>

      <CountdownPrompt
        visible={stillnessPrompt}
        title="괜찮으세요?"
        description={`${settings.anomaly?.windowMinutes || 10}분 동안 위치와 움직임이 모두 없었습니다.\n응답이 없으면 긴급 연락처에 자동으로 알립니다.`}
        seconds={60}
        onSafe={handleStillnessSafe}
        onTimeout={handleStillnessTimeout}
      />

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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
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
  pendingBox: {
    backgroundColor: '#FFF8E1',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  pendingText: { color: '#8D6E63', fontSize: 13, lineHeight: 19 },
  batteryBox: {
    backgroundColor: '#FFEBEE',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  batteryText: { color: '#B71C1C', fontSize: 13, lineHeight: 19 },
  anomalyBox: {
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  anomalyText: { color: '#2E7D32', fontSize: 13, lineHeight: 19 },
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  stopText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});
