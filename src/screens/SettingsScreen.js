import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  DEFAULT_MESSAGE_TEMPLATE,
  DEFAULT_TRACKING_MESSAGE_TEMPLATE,
  INTERVAL_OPTIONS,
  formatPhoneDisplay,
  normalizePhone,
} from '../storage';
import { DEFAULT_ANOMALY, SENSITIVITY_PRESETS } from '../lib/anomaly';

export default function SettingsScreen({
  initialSettings,
  onSave,
  onCancel,
  isFirstRun,
}) {
  const [userName, setUserName] = useState(initialSettings.userName || '');
  const [contacts, setContacts] = useState(initialSettings.contacts || []);
  const [messageTemplate, setMessageTemplate] = useState(
    initialSettings.messageTemplate || DEFAULT_MESSAGE_TEMPLATE,
  );
  const [trackingMessageTemplate, setTrackingMessageTemplate] = useState(
    initialSettings.trackingMessageTemplate || DEFAULT_TRACKING_MESSAGE_TEMPLATE,
  );
  const [intervalMinutes, setIntervalMinutes] = useState(
    initialSettings.trackingIntervalMinutes || 5,
  );
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [anomaly, setAnomaly] = useState({
    ...DEFAULT_ANOMALY,
    ...(initialSettings.anomaly || {}),
  });

  const addContact = () => {
    const name = newName.trim();
    const phone = normalizePhone(newPhone);
    if (!name) return Alert.alert('입력 오류', '이름을 입력해주세요.');
    if (!phone || phone.replace(/\D/g, '').length < 9) {
      return Alert.alert('입력 오류', '올바른 전화번호를 입력해주세요.');
    }
    if (contacts.some((c) => c.phone === phone)) {
      return Alert.alert('중복', '이미 추가된 번호입니다.');
    }
    setContacts([...contacts, { id: String(Date.now()), name, phone }]);
    setNewName('');
    setNewPhone('');
  };

  const removeContact = (id) => {
    const target = contacts.find((c) => c.id === id);
    Alert.alert('연락처 삭제', `"${target?.name}" 을(를) 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => setContacts(contacts.filter((c) => c.id !== id)),
      },
    ]);
  };

  const handleSave = () => {
    if (contacts.length === 0) {
      return Alert.alert('연락처 필요', '긴급 연락처를 최소 1명 추가해주세요.');
    }
    onSave({
      userName: userName.trim(),
      contacts,
      messageTemplate: messageTemplate.trim() || DEFAULT_MESSAGE_TEMPLATE,
      trackingMessageTemplate:
        trackingMessageTemplate.trim() || DEFAULT_TRACKING_MESSAGE_TEMPLATE,
      trackingIntervalMinutes: intervalMinutes,
      anomaly,
      onboarded: true,
    });
  };

  const matchedPreset = SENSITIVITY_PRESETS.find(
    (p) =>
      p.windowMinutes === anomaly.windowMinutes &&
      p.maxShake === anomaly.maxShake,
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        {!isFirstRun ? (
          <Pressable onPress={onCancel} hitSlop={12}>
            <Text style={styles.headerBack}>‹ 취소</Text>
          </Pressable>
        ) : (
          <View style={{ minWidth: 60 }} />
        )}
        <Text style={styles.headerTitle}>{isFirstRun ? '초기 설정' : '설정'}</Text>
        <Pressable onPress={handleSave} hitSlop={12}>
          <Text style={styles.headerSave}>저장</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionLabel}>내 이름 (선택)</Text>
        <TextInput
          style={styles.input}
          value={userName}
          onChangeText={setUserName}
          placeholder="예: 홍길동"
          placeholderTextColor="#aaa"
          maxLength={20}
        />

        <View style={styles.separator} />

        <Text style={styles.sectionLabel}>
          긴급 연락처 ({contacts.length}명)
        </Text>

        {contacts.length === 0 ? (
          <Text style={styles.emptyText}>
            긴급 시 문자를 받을 연락처를 추가해주세요.
          </Text>
        ) : (
          contacts.map((c) => (
            <View key={c.id} style={styles.contactRow}>
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>{c.name}</Text>
                <Text style={styles.contactPhone}>
                  {formatPhoneDisplay(c.phone)}
                </Text>
              </View>
              <Pressable
                onPress={() => removeContact(c.id)}
                style={styles.removeButton}
                hitSlop={8}
              >
                <Text style={styles.removeButtonText}>삭제</Text>
              </Pressable>
            </View>
          ))
        )}

        <View style={styles.addBox}>
          <Text style={styles.addTitle}>연락처 추가</Text>
          <TextInput
            style={styles.input}
            value={newName}
            onChangeText={setNewName}
            placeholder="이름"
            placeholderTextColor="#aaa"
            maxLength={20}
          />
          <TextInput
            style={styles.input}
            value={newPhone}
            onChangeText={setNewPhone}
            placeholder="전화번호 (예: 010-1234-5678)"
            placeholderTextColor="#aaa"
            keyboardType="phone-pad"
            maxLength={20}
          />
          <Pressable style={styles.addButton} onPress={addContact}>
            <Text style={styles.addButtonText}>+ 추가</Text>
          </Pressable>
        </View>

        <View style={styles.separator} />

        <Text style={styles.sectionLabel}>즉시 SOS 문구</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={messageTemplate}
          onChangeText={setMessageTemplate}
          placeholder={DEFAULT_MESSAGE_TEMPLATE}
          placeholderTextColor="#aaa"
          multiline
          maxLength={200}
        />
        <Text style={styles.hint}>
          사용 가능한 치환어: <Text style={styles.code}>{'{이름}'}</Text>,{' '}
          <Text style={styles.code}>{'{위치}'}</Text>
        </Text>

        <View style={{ height: 16 }} />

        <Text style={styles.sectionLabel}>실시간 추적 문구</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={trackingMessageTemplate}
          onChangeText={setTrackingMessageTemplate}
          placeholder={DEFAULT_TRACKING_MESSAGE_TEMPLATE}
          placeholderTextColor="#aaa"
          multiline
          maxLength={200}
        />
        <Text style={styles.hint}>
          사용 가능한 치환어: <Text style={styles.code}>{'{이름}'}</Text>,{' '}
          <Text style={styles.code}>{'{링크}'}</Text>
        </Text>

        <View style={styles.separator} />

        <Text style={styles.sectionLabel}>실시간 추적 주기</Text>
        <View style={styles.intervalRow}>
          {INTERVAL_OPTIONS.map((min) => (
            <Pressable
              key={min}
              onPress={() => setIntervalMinutes(min)}
              style={[
                styles.intervalPill,
                intervalMinutes === min && styles.intervalPillActive,
              ]}
            >
              <Text
                style={[
                  styles.intervalText,
                  intervalMinutes === min && styles.intervalTextActive,
                ]}
              >
                {min}분
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>
          짧을수록 배터리 소모가 커집니다. 5분이 권장값입니다.
        </Text>

        <View style={styles.separator} />

        <Text style={styles.sectionLabel}>이상 감지</Text>
        <Pressable
          style={styles.toggleRow}
          onPress={() => setAnomaly({ ...anomaly, enabled: !anomaly.enabled })}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>움직임이 없으면 확인하기</Text>
            <Text style={styles.toggleDesc}>
              추적 중 위치와 흔들림이 동시에 멈추면 확인창을 띄우고,
              응답이 없으면 긴급 연락처에 자동으로 알립니다.
            </Text>
          </View>
          <View style={[styles.switchTrack, anomaly.enabled && styles.switchOn]}>
            <View style={[styles.switchKnob, anomaly.enabled && styles.knobOn]} />
          </View>
        </Pressable>

        {anomaly.enabled && (
          <>
            <View style={styles.intervalRow}>
              {SENSITIVITY_PRESETS.map((preset) => {
                const active = matchedPreset?.key === preset.key;
                return (
                  <Pressable
                    key={preset.key}
                    onPress={() =>
                      setAnomaly({
                        ...anomaly,
                        windowMinutes: preset.windowMinutes,
                        maxMoveMeters: preset.maxMoveMeters,
                        maxShake: preset.maxShake,
                      })
                    }
                    style={[styles.intervalPill, active && styles.intervalPillActive]}
                  >
                    <Text
                      style={[styles.intervalText, active && styles.intervalTextActive]}
                    >
                      {preset.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>
              현재: {anomaly.windowMinutes}분 동안 {anomaly.maxMoveMeters}m 이내에
              머물고 흔들림이 없으면 확인합니다.
              {'\n'}전송 주기보다 창이 짧으면 판정할 근거가 부족해 잘 뜨지 않습니다.
              전송 주기의 2배 이상을 권장합니다.
              {'\n\n'}폰을 책상에 두고 앉아 있어도 같게 보이므로, 바로 알리지 않고
              먼저 확인창을 띄웁니다. 자동 발송 시에도 iOS 는 마지막 "보내기"를
              사람이 눌러야 합니다.
            </Text>
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </KeyboardAvoidingView>
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
  headerBack: { fontSize: 17, color: '#E53935', minWidth: 60 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#222' },
  headerSave: {
    fontSize: 17,
    fontWeight: '600',
    color: '#E53935',
    minWidth: 60,
    textAlign: 'right',
  },
  scrollContent: { padding: 20 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#222',
    backgroundColor: '#fafafa',
    marginBottom: 8,
  },
  multilineInput: { minHeight: 80, textAlignVertical: 'top' },
  hint: { fontSize: 12, color: '#999', marginTop: 4, lineHeight: 18 },
  code: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#1976D2',
    fontSize: 12,
  },
  separator: { height: 1, backgroundColor: '#eee', marginVertical: 24 },
  emptyText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    paddingVertical: 12,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#fafafa',
    borderRadius: 10,
    marginBottom: 8,
  },
  contactInfo: { flex: 1 },
  contactName: { fontSize: 16, fontWeight: '600', color: '#222' },
  contactPhone: { fontSize: 14, color: '#666', marginTop: 2 },
  removeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#fee',
  },
  removeButtonText: { color: '#E53935', fontSize: 14, fontWeight: '600' },
  addBox: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
  },
  addTitle: { fontSize: 15, fontWeight: '600', color: '#444', marginBottom: 10 },
  addButton: {
    backgroundColor: '#E53935',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  addButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  intervalRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  intervalPill: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#eee',
    alignItems: 'center',
  },
  intervalPillActive: { backgroundColor: '#E53935', borderColor: '#E53935' },
  intervalText: { fontSize: 15, fontWeight: '600', color: '#555' },
  intervalTextActive: { color: '#fff' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  toggleTitle: { fontSize: 15, fontWeight: '600', color: '#222' },
  toggleDesc: { fontSize: 12, color: '#888', marginTop: 4, lineHeight: 18 },
  switchTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ddd',
    padding: 3,
    justifyContent: 'center',
  },
  switchOn: { backgroundColor: '#E53935' },
  switchKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
  },
  knobOn: { alignSelf: 'flex-end' },
});
