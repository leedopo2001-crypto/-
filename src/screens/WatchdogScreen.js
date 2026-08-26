import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getWebhook, isSupabaseConfigured, setWebhook } from '../api/supabase';

/**
 * 서버 워치독의 발송 설정.
 *
 * 판정 자체(지연됨 표시)는 설정 없이도 동작한다. 여기서 정하는 것은
 * "아무도 앱을 안 보고 있을 때 어디로 밀어낼 것인가" 하나다.
 */
export default function WatchdogScreen({ identity, onBack }) {
  const [url, setUrl] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      if (!identity || !isSupabaseConfigured) {
        setLoading(false);
        return;
      }
      try {
        const config = await getWebhook(identity);
        if (config) {
          setUrl(config.webhook_url || '');
          setEnabled(config.enabled !== false);
        }
      } catch {
        // 설정이 없으면 기본값 그대로 둔다.
      }
      setLoading(false);
    })();
  }, [identity]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      await setWebhook(identity, { url: url.trim(), enabled });
      setNote(
        url.trim()
          ? '저장했습니다. 신호가 끊기면 이 주소로 알림이 갑니다.'
          : '저장했습니다. 발송 주소가 없으므로 앱에서만 표시됩니다.',
      );
    } catch (e) {
      setError(
        /https/.test(e.message || '')
          ? '보안을 위해 https 주소만 쓸 수 있습니다.'
          : e.message || '저장하지 못했습니다.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (!identity || !isSupabaseConfigured) {
    return (
      <View style={styles.container}>
        <Header onBack={onBack} />
        <View style={styles.blocked}>
          <Text style={styles.blockedTitle}>서버 설정이 필요합니다</Text>
          <Text style={styles.blockedDesc}>
            워치독은 서버에서 도는 기능입니다. SETUP.md 를 따라 Supabase 를
            설정한 뒤 다시 열어주세요.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>
          약속한 주기가 지나도 새 위치가 오지 않으면 서버가 알아차립니다.
          {'\n'}폰이 꺼지거나 부서져도 동작합니다.
        </Text>

        <View style={styles.levels}>
          <View style={styles.level}>
            <Text style={styles.levelTitle}>표시 — 설정 없이 동작</Text>
            <Text style={styles.levelDesc}>
              연결된 사람의 앱과 공유 링크에 "신호 끊김"이 표시됩니다.
              단, 상대가 화면을 보고 있어야 압니다.
            </Text>
          </View>
          <View style={styles.level}>
            <Text style={styles.levelTitle}>발송 — 아래 주소 필요</Text>
            <Text style={styles.levelDesc}>
              아무도 앱을 안 보고 있어도 지정한 곳으로 알림이 갑니다.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>알림 받을 주소 (웹훅)</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="https://discord.com/api/webhooks/..."
          placeholderTextColor="#bbb"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />

        <Pressable
          style={styles.toggleRow}
          onPress={() => setEnabled((v) => !v)}
        >
          <Text style={styles.toggleLabel}>발송 사용</Text>
          <View style={[styles.switchTrack, enabled && styles.switchOn]}>
            <View style={[styles.switchKnob, enabled && styles.knobOn]} />
          </View>
        </Pressable>

        <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving || loading}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveText}>저장</Text>
          )}
        </Pressable>

        {note && <Text style={styles.note}>{note}</Text>}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>주소는 어디서 얻나요</Text>
        <Text style={styles.help}>
          <Text style={styles.helpStrong}>디스코드</Text> — 서버 설정 → 연동 →
          웹후크 → 새 웹후크 → URL 복사. 가장 간단하고 바로 됩니다.
          {'\n\n'}
          <Text style={styles.helpStrong}>슬랙</Text> — 앱 디렉터리에서 Incoming
          Webhooks 추가 후 URL 복사.
          {'\n\n'}
          둘 다 무료이고, 알림이 폰 푸시로 옵니다. 문자와 달리 받는 사람이
          앱을 열어둘 필요가 없습니다.
        </Text>

        <Pressable
          onPress={() =>
            Linking.openURL('https://support.discord.com/hc/ko/articles/228383668')
          }
        >
          <Text style={styles.link}>디스코드 웹후크 만드는 법 (공식 문서)</Text>
        </Pressable>

        <Text style={styles.caution}>
          이 주소를 아는 사람은 해당 채널에 글을 쓸 수 있습니다. 공개된 곳에
          붙여넣지 마세요. 서버는 https 주소만 받습니다.
        </Text>
      </ScrollView>
    </View>
  );
}

function Header({ onBack }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={12}>
        <Text style={styles.headerBack}>‹ 뒤로</Text>
      </Pressable>
      <Text style={styles.headerTitle}>신호 끊김 알림</Text>
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
  scroll: { padding: 20, paddingBottom: 50 },
  lead: { fontSize: 15, color: '#555', lineHeight: 22, marginBottom: 20 },
  levels: { gap: 10, marginBottom: 26 },
  level: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 14,
  },
  levelTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1E' },
  levelDesc: { fontSize: 12.5, color: '#777', marginTop: 4, lineHeight: 19 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#222',
    backgroundColor: '#fafafa',
    minHeight: 70,
    textAlignVertical: 'top',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: '#222' },
  switchTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ddd',
    padding: 3,
    justifyContent: 'center',
  },
  switchOn: { backgroundColor: '#E53935' },
  switchKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  knobOn: { alignSelf: 'flex-end' },
  saveButton: {
    backgroundColor: '#1A1A1E',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 50,
    justifyContent: 'center',
  },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  note: { marginTop: 14, fontSize: 13, color: '#2E7D32', lineHeight: 19 },
  errorBox: {
    backgroundColor: '#FFEBEE',
    borderRadius: 10,
    padding: 14,
    marginTop: 14,
  },
  errorText: { color: '#B71C1C', fontSize: 14, lineHeight: 20 },
  help: { fontSize: 13, color: '#666', lineHeight: 21 },
  helpStrong: { fontWeight: '700', color: '#222' },
  link: {
    marginTop: 14,
    fontSize: 13.5,
    color: '#1565C0',
    fontWeight: '600',
  },
  caution: {
    marginTop: 26,
    fontSize: 12,
    color: '#999',
    lineHeight: 19,
  },
  blocked: { padding: 32, paddingTop: 70, alignItems: 'center' },
  blockedTitle: { fontSize: 17, fontWeight: '700', color: '#444', marginBottom: 10 },
  blockedDesc: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 22 },
});
