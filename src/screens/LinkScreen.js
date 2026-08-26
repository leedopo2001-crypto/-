import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { acceptInvite, createInvite, isSupabaseConfigured } from '../api/supabase';

const RELATIONS = ['가족', '연인', '친구', '보호자'];

/**
 * 사람과 사람을 잇는 화면.
 *
 * 한쪽이 코드를 만들고 다른 쪽이 입력한다. 연결은 상호적이라 수락하면
 * 서로의 공유를 볼 수 있게 되는데, 이건 수락 전에 분명히 알려야 한다.
 */
export default function LinkScreen({ identity, onBack, onLinked }) {
  const [mode, setMode] = useState('invite'); // 'invite' | 'enter'
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [relation, setRelation] = useState('가족');
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  async function handleCreateInvite() {
    setBusy(true);
    setError(null);
    try {
      setInvite(await createInvite(identity));
    } catch (e) {
      setError(e.message || '초대 코드를 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAccept() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) {
      setError('코드를 확인해주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const peer = await acceptInvite(identity, trimmed, relation);
      onLinked(peer);
    } catch (e) {
      setError(
        /invalid or expired/.test(e.message || '')
          ? '코드가 잘못되었거나 만료됐습니다. 상대에게 새 코드를 받아주세요.'
          : /yourself/.test(e.message || '')
            ? '자기 자신과는 연결할 수 없습니다.'
            : e.message || '연결에 실패했습니다.',
      );
    } finally {
      setBusy(false);
    }
  }

  // 신원이 없으면 (Supabase 미설정이거나 발급에 실패) 연결 자체가 불가능하다.
  // 빈 화면 대신 왜 안 되는지, 대신 무엇이 되는지를 알려준다.
  if (!identity) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onBack} hitSlop={12}>
            <Text style={styles.headerBack}>‹ 뒤로</Text>
          </Pressable>
          <Text style={styles.headerTitle}>사람 연결</Text>
          <View style={{ minWidth: 60 }} />
        </View>
        <View style={styles.blocked}>
          <Text style={styles.blockedEmoji}>🔌</Text>
          <Text style={styles.blockedTitle}>아직 연결할 수 없습니다</Text>
          <Text style={styles.blockedDesc}>
            {isSupabaseConfigured
              ? '서버에 연결하지 못했습니다. 네트워크를 확인한 뒤 앱을 다시 실행해주세요.'
              : '사람 연결은 서버가 필요합니다. SETUP.md 를 따라 Supabase 를 설정한 뒤 앱을 다시 실행해주세요.'}
            {'\n\n'}
            그때까지도 SOS·추적·기록은 그대로 쓸 수 있고, 긴급 연락처로는
            문자가 정상 발송됩니다.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.headerBack}>‹ 뒤로</Text>
        </Pressable>
        <Text style={styles.headerTitle}>사람 연결</Text>
        <View style={{ minWidth: 60 }} />
      </View>

      <View style={styles.tabs}>
        {[
          ['invite', '코드 만들기'],
          ['enter', '코드 입력'],
        ].map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => {
              setMode(key);
              setError(null);
            }}
            style={[styles.tab, mode === key && styles.tabActive]}
          >
            <Text style={[styles.tabText, mode === key && styles.tabTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            연결하면 <Text style={styles.noticeStrong}>서로의</Text> 위치 공유를 볼 수
            있습니다. 한쪽만 보는 구조가 아닙니다.
          </Text>
        </View>

        {mode === 'invite' ? (
          <>
            <Text style={styles.lead}>
              코드를 만들어 상대에게 알려주세요.{'\n'}
              상대가 앱에서 코드를 입력하면 연결됩니다.
            </Text>

            {invite ? (
              <>
                <View style={styles.codeCard}>
                  <Text style={styles.codeValue}>{invite.code}</Text>
                  <Text style={styles.codeHint}>10분 안에 입력해야 합니다</Text>
                </View>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={async () => {
                    await Clipboard.setStringAsync(invite.code);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  <Text style={styles.secondaryText}>
                    {copied ? '✓ 복사되었습니다' : '📋 코드 복사'}
                  </Text>
                </Pressable>
                <Pressable style={styles.ghostButton} onPress={handleCreateInvite}>
                  <Text style={styles.ghostText}>새 코드 만들기</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                style={styles.primaryButton}
                onPress={handleCreateInvite}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>초대 코드 만들기</Text>
                )}
              </Pressable>
            )}
          </>
        ) : (
          <>
            <Text style={styles.lead}>상대에게 받은 코드를 입력하세요.</Text>

            <TextInput
              style={styles.codeInput}
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              placeholder="ABC123"
              placeholderTextColor="#bbb"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
            />

            <Text style={styles.sectionLabel}>관계</Text>
            <View style={styles.relationRow}>
              {RELATIONS.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setRelation(r)}
                  style={[styles.pill, relation === r && styles.pillActive]}
                >
                  <Text
                    style={[styles.pillText, relation === r && styles.pillTextActive]}
                  >
                    {r}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={styles.primaryButton}
              onPress={handleAccept}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>연결하기</Text>
              )}
            </Pressable>
          </>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
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
  headerBack: { fontSize: 16, color: '#E53935', minWidth: 60 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#222' },
  tabs: {
    flexDirection: 'row',
    padding: 4,
    margin: 20,
    marginBottom: 0,
    backgroundColor: '#F1F3F5',
    borderRadius: 12,
    gap: 4,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  tabActive: { backgroundColor: '#fff' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#888' },
  tabTextActive: { color: '#1A1A1E' },
  scroll: { padding: 20 },
  notice: {
    backgroundColor: '#EDE7F6',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  noticeText: { fontSize: 13, color: '#4527A0', lineHeight: 20 },
  noticeStrong: { fontWeight: '700' },
  lead: { fontSize: 15, color: '#555', lineHeight: 22, marginBottom: 20 },
  codeCard: {
    backgroundColor: '#1A1A1E',
    borderRadius: 16,
    paddingVertical: 28,
    alignItems: 'center',
    marginBottom: 12,
  },
  codeValue: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 8,
  },
  codeHint: { fontSize: 12, color: '#9E9E9E', marginTop: 8 },
  codeInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingVertical: 18,
    fontSize: 30,
    fontWeight: 'bold',
    letterSpacing: 8,
    textAlign: 'center',
    color: '#1A1A1E',
    backgroundColor: '#fafafa',
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  relationRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  pill: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#eee',
    alignItems: 'center',
  },
  pillActive: { backgroundColor: '#1A1A1E', borderColor: '#1A1A1E' },
  pillText: { fontSize: 14, fontWeight: '600', color: '#555' },
  pillTextActive: { color: '#fff' },
  primaryButton: {
    backgroundColor: '#E53935',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 54,
    justifyContent: 'center',
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    backgroundColor: '#F1F3F5',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryText: { color: '#444', fontSize: 14, fontWeight: '600' },
  ghostButton: { paddingVertical: 14, alignItems: 'center' },
  ghostText: { color: '#999', fontSize: 14 },
  errorBox: {
    backgroundColor: '#FFEBEE',
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
  },
  errorText: { color: '#B71C1C', fontSize: 14, lineHeight: 20 },
  blocked: { padding: 32, paddingTop: 80, alignItems: 'center' },
  blockedEmoji: { fontSize: 48, marginBottom: 16 },
  blockedTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#444',
    marginBottom: 12,
  },
  blockedDesc: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
  },
});
