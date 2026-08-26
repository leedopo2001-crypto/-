import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  DURATION_PRESETS,
  clearCheckIn,
  formatRemaining,
  isExpired,
  loadCheckIn,
  remainingMs,
  saveCheckIn,
} from '../lib/checkin';
import {
  cancelReminders,
  ensureNotificationPermission,
  scheduleCheckInReminders,
} from '../lib/notify';
import { PREFIX_CHECKIN, sendEmergencySms } from '../lib/alert';
import CountdownPrompt from '../components/CountdownPrompt';
import Icon from '../components/Icon';

export default function CheckInScreen({ settings, onBack }) {
  const [checkIn, setCheckIn] = useState(null);
  const [loading, setLoading] = useState(true);
  const [minutes, setMinutes] = useState(30);
  const [label, setLabel] = useState('');
  const [tick, setTick] = useState(0);
  const [expiredPrompt, setExpiredPrompt] = useState(false);
  const [note, setNote] = useState(null);

  const promptShownRef = useRef(false);

  useEffect(() => {
    (async () => {
      const loaded = await loadCheckIn();
      setCheckIn(loaded);
      setLoading(false);
      // 앱이 꺼져 있는 동안 마감을 넘겼을 수도 있다. 열자마자 확인한다.
      if (isExpired(loaded)) triggerExpiry();
    })();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((v) => v + 1);
      setCheckIn((current) => {
        if (current && isExpired(current)) triggerExpiry();
        return current;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  function triggerExpiry() {
    if (promptShownRef.current) return;
    promptShownRef.current = true;
    setExpiredPrompt(true);
  }

  async function handleStart() {
    if ((settings.contacts || []).length === 0) {
      Alert.alert('연락처 없음', '먼저 설정에서 긴급 연락처를 추가해주세요.');
      return;
    }

    const granted = await ensureNotificationPermission();
    const deadlineMs = Date.now() + minutes * 60_000;
    const notificationIds = granted
      ? await scheduleCheckInReminders({ deadlineMs, label: label.trim() })
      : [];

    const state = {
      deadlineMs,
      label: label.trim(),
      startedAtMs: Date.now(),
      notificationIds,
    };
    await saveCheckIn(state);
    promptShownRef.current = false;
    setCheckIn(state);
    setNote(
      granted
        ? null
        : '알림 권한이 없어 예고 알림은 오지 않습니다. 앱을 열어두시면 정상 동작합니다.',
    );
  }

  async function handleSafe() {
    if (checkIn?.notificationIds) await cancelReminders(checkIn.notificationIds);
    await clearCheckIn();
    promptShownRef.current = false;
    setExpiredPrompt(false);
    setCheckIn(null);
    setNote('무사히 도착으로 처리했습니다.');
  }

  async function handleExpiredTimeout() {
    setExpiredPrompt(false);
    if (checkIn?.notificationIds) await cancelReminders(checkIn.notificationIds);
    await clearCheckIn();
    setCheckIn(null);

    const { result } = await sendEmergencySms({
      settings,
      prefix: PREFIX_CHECKIN,
    });
    setNote(
      result === 'no-contacts'
        ? '알리려 했지만 등록된 연락처가 없습니다.'
        : '체크인 응답이 없어 긴급 연락처에 알렸습니다.',
    );
  }

  function handleExtend(extraMinutes) {
    if (!checkIn) return;
    (async () => {
      await cancelReminders(checkIn.notificationIds);
      const deadlineMs = checkIn.deadlineMs + extraMinutes * 60_000;
      const notificationIds = await scheduleCheckInReminders({
        deadlineMs,
        label: checkIn.label,
      });
      const next = { ...checkIn, deadlineMs, notificationIds };
      await saveCheckIn(next);
      promptShownRef.current = false;
      setCheckIn(next);
    })();
  }

  if (loading) return <View style={styles.container} />;

  // ===== 진행 중 =====
  if (checkIn) {
    const left = remainingMs(checkIn);
    return (
      <View style={styles.container}>
        <Header title="자동 체크인" onBack={onBack} />
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.countdownCard}>
            <Text style={styles.countdownLabel}>
              {checkIn.label || '체크인'} 까지
            </Text>
            <Text style={styles.countdownValue}>{formatRemaining(left)}</Text>
            <Text style={styles.countdownHint}>
              시간이 지나면 확인창이 뜨고, 응답이 없으면{'\n'}
              긴급 연락처 {settings.contacts?.length || 0}명에게 자동으로 알립니다.
            </Text>
          </View>

          <View style={styles.extendRow}>
            {[10, 30].map((m) => (
              <Pressable
                key={m}
                style={styles.extendButton}
                onPress={() => handleExtend(m)}
              >
                <Text style={styles.extendText}>+{m}분</Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.safeButton} onPress={handleSafe}>
            <Icon name="checkCircle" size={20} color="#fff" />
            <Text style={styles.safeText}>무사히 도착</Text>
          </Pressable>

          {note && <Text style={styles.note}>{note}</Text>}

          <Text style={styles.limitation}>
            지금 구성에서 "자동"의 범위{'\n'}
            · 앱이 열려 있어야 시간을 셀 수 있습니다. 닫혀 있으면 알림만 오고,
            앱을 열어야 그때부터 진행됩니다.{'\n'}
            · 시간이 지나면 문자 앱이 내용과 수신자까지 채워진 채로 열립니다.
            다만 iOS 정책상 마지막 "보내기"는 사람이 눌러야 합니다.{'\n'}
            · 완전 무인 발송은 EAS 빌드(Android) 또는 서버 발송이 필요합니다.
          </Text>
        </ScrollView>

        <CountdownPrompt
          visible={expiredPrompt}
          title="체크인 시간이 지났습니다"
          description={`응답이 없으면 긴급 연락처에 위치와 함께 자동으로 알립니다.`}
          seconds={60}
          confirmLabel="무사해요"
          onSafe={handleSafe}
          onTimeout={handleExpiredTimeout}
        />
      </View>
    );
  }

  // ===== 설정 =====
  return (
    <View style={styles.container}>
      <Header title="자동 체크인" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>
          정해진 시간 안에 "무사히 도착"을 누르지 않으면{'\n'}
          긴급 연락처에 위치와 함께 자동으로 알립니다.
        </Text>

        <Text style={styles.sectionLabel}>시간</Text>
        <View style={styles.presetRow}>
          {DURATION_PRESETS.map((m) => (
            <Pressable
              key={m}
              onPress={() => setMinutes(m)}
              style={[styles.pill, minutes === m && styles.pillActive]}
            >
              <Text style={[styles.pillText, minutes === m && styles.pillTextActive]}>
                {m >= 60 ? `${m / 60}시간` : `${m}분`}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>메모 (선택)</Text>
        <TextInput
          style={styles.input}
          value={label}
          onChangeText={setLabel}
          placeholder="예: 귀가 중"
          placeholderTextColor="#aaa"
          maxLength={20}
        />

        <Pressable style={styles.startButton} onPress={handleStart}>
          <Icon name="timer" size={18} color="#fff" />
          <Text style={styles.startText}>{minutes}분 체크인 시작</Text>
        </Pressable>

        {note && <Text style={styles.note}>{note}</Text>}
      </ScrollView>
    </View>
  );
}

function Header({ title, onBack }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={12}>
        <Text style={styles.headerBack}>‹ 뒤로</Text>
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ minWidth: 60 }} />
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
  headerBack: { fontSize: 16, color: '#E53935', minWidth: 60 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#222' },
  scroll: { padding: 20 },
  lead: { fontSize: 15, color: '#555', lineHeight: 22, marginBottom: 24 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 8,
  },
  presetRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  pill: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#eee',
    alignItems: 'center',
  },
  pillActive: { backgroundColor: '#E53935', borderColor: '#E53935' },
  pillText: { fontSize: 14, fontWeight: '600', color: '#555' },
  pillTextActive: { color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#222',
    backgroundColor: '#fafafa',
    marginBottom: 24,
  },
  startButton: {
    backgroundColor: '#E53935',
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  startText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  countdownCard: {
    backgroundColor: '#FFF3E0',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  countdownLabel: { fontSize: 14, color: '#8D6E63', marginBottom: 6 },
  countdownValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#E65100',
    marginBottom: 12,
  },
  countdownHint: {
    fontSize: 13,
    color: '#8D6E63',
    textAlign: 'center',
    lineHeight: 19,
  },
  extendRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  extendButton: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  extendText: { fontSize: 15, fontWeight: '600', color: '#555' },
  safeButton: {
    backgroundColor: '#2E7D32',
    paddingVertical: 18,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  safeText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  note: {
    marginTop: 16,
    fontSize: 13,
    color: '#2E7D32',
    lineHeight: 19,
  },
  limitation: {
    marginTop: 24,
    fontSize: 12,
    color: '#999',
    lineHeight: 18,
  },
});
