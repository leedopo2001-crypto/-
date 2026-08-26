import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { isSupabaseConfigured, listLinks, unlink, updateProfile } from '../api/supabase';
import { updateLocalIdentity } from '../lib/identity';
import { listSessions } from '../lib/history';
import { formatDistance } from '../lib/geo';

const EMOJIS = ['🙂', '🌙', '🐣', '🌿', '🔥', '🐻', '⭐️', '🍀'];

function agoLabel(iso) {
  if (!iso) return null;
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return '방금';
  if (diff < 60) return `${diff}분 전`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export default function MyPageScreen({
  identity,
  settings,
  onBack,
  onOpenSettings,
  onOpenLink,
  onWatchPeer,
  onIdentityChanged,
}) {
  const [links, setLinks] = useState(null);
  const [name, setName] = useState(identity?.displayName || settings.userName || '');
  const [emoji, setEmoji] = useState(identity?.emoji || '🙂');
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState({ count: 0, distanceKm: 0 });

  const refresh = useCallback(async () => {
    if (identity && isSupabaseConfigured) {
      try {
        setLinks(await listLinks(identity));
      } catch {
        setLinks([]);
      }
    } else {
      setLinks([]);
    }

    const sessions = await listSessions();
    setSummary({
      count: sessions.length,
      distanceKm: sessions.reduce((a, s) => a + (s.stats?.distanceKm || 0), 0),
    });
  }, [identity]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleSaveProfile() {
    setSaving(true);
    try {
      if (identity && isSupabaseConfigured) {
        await updateProfile(identity, { displayName: name.trim(), emoji });
      }
      const next = await updateLocalIdentity({
        displayName: name.trim(),
        emoji,
      });
      onIdentityChanged?.(next);
    } catch (e) {
      Alert.alert('저장 실패', e.message || '잠시 후 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  }

  function handleUnlink(peer) {
    Alert.alert(
      '연결 해제',
      `${peer.display_name || '이 사람'}과의 연결을 끊을까요?\n양쪽 모두에서 끊깁니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '해제',
          style: 'destructive',
          onPress: async () => {
            try {
              await unlink(identity, peer.user_id);
              refresh();
            } catch (e) {
              Alert.alert('실패', e.message || '해제하지 못했습니다.');
            }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.headerBack}>‹ 뒤로</Text>
        </Pressable>
        <Text style={styles.headerTitle}>마이페이지</Text>
        <Pressable onPress={onOpenSettings} hitSlop={12}>
          <Text style={styles.headerAction}>설정</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* 프로필 */}
        <View style={styles.profileCard}>
          <Text style={styles.avatar}>{emoji}</Text>
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder="이름을 입력하세요"
            placeholderTextColor="#bbb"
            maxLength={20}
          />
          <View style={styles.emojiRow}>
            {EMOJIS.map((e) => (
              <Pressable
                key={e}
                onPress={() => setEmoji(e)}
                style={[styles.emojiPick, emoji === e && styles.emojiPickActive]}
              >
                <Text style={styles.emojiPickText}>{e}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={styles.saveButton}
            onPress={handleSaveProfile}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveText}>프로필 저장</Text>
            )}
          </Pressable>
        </View>

        {/* 연결된 사람 */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionLabel}>
            연결된 사람 {links ? `${links.length}명` : ''}
          </Text>
          <Pressable onPress={onOpenLink} hitSlop={10}>
            <Text style={styles.sectionAction}>+ 연결</Text>
          </Pressable>
        </View>

        {!isSupabaseConfigured && (
          <Text style={styles.muted}>
            Supabase 설정이 필요합니다. 연결 없이도 문자 전송은 동작합니다.
          </Text>
        )}

        {links === null && <ActivityIndicator style={{ marginVertical: 20 }} />}

        {links?.length === 0 && isSupabaseConfigured && (
          <Text style={styles.muted}>
            아직 연결된 사람이 없습니다. 미리 연결해두면 위급할 때 문자를
            보내지 않아도 상대 앱에 바로 뜹니다.
          </Text>
        )}

        {links?.map((peer) => {
          const live = Boolean(peer.active_code);
          return (
            <Pressable
              key={peer.user_id}
              style={[styles.peerRow, live && styles.peerRowLive]}
              onPress={() => live && onWatchPeer(peer)}
              onLongPress={() => handleUnlink(peer)}
            >
              <Text style={styles.peerEmoji}>{peer.emoji || '🙂'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.peerName}>
                  {peer.display_name || '이름 없음'}
                  {peer.relation ? (
                    <Text style={styles.peerRelation}> · {peer.relation}</Text>
                  ) : null}
                </Text>
                <Text style={[styles.peerStatus, live && styles.peerStatusLive]}>
                  {live
                    ? `공유 중 · ${agoLabel(peer.last_location_at) || '위치 대기'}`
                    : '지금은 공유 중이 아닙니다'}
                </Text>
              </View>
              {live && <View style={styles.liveDot} />}
              <Text style={styles.peerArrow}>{live ? '›' : ''}</Text>
            </Pressable>
          );
        })}

        {links?.length > 0 && (
          <Text style={styles.hint}>
            공유 중인 사람을 탭하면 바로 지켜볼 수 있습니다.
            길게 누르면 연결을 해제합니다.
          </Text>
        )}

        {/* 긴급 연락처 (문자 폴백) */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionLabel}>
            긴급 연락처 {settings.contacts?.length || 0}명
          </Text>
          <Pressable onPress={onOpenSettings} hitSlop={10}>
            <Text style={styles.sectionAction}>편집</Text>
          </Pressable>
        </View>
        <Text style={styles.muted}>
          앱을 쓰지 않는 사람에게는 문자로 나갑니다. 연결된 사람과 별개로
          유지하시는 편이 좋습니다.
        </Text>

        {/* 기록 요약 */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionLabel}>기록</Text>
        </View>
        <View style={styles.statRow}>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{summary.count}</Text>
            <Text style={styles.statLabel}>저장된 세션</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{formatDistance(summary.distanceKm)}</Text>
            <Text style={styles.statLabel}>총 이동 거리</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          here · 기기 자체가 계정입니다. 가입도 비밀번호도 없습니다.{'\n'}
          앱을 지우면 신원과 연결이 사라집니다.
        </Text>
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
  headerAction: { fontSize: 15, color: '#666', minWidth: 60, textAlign: 'right' },
  scroll: { padding: 20, paddingBottom: 40 },
  profileCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  avatar: { fontSize: 56, marginBottom: 10 },
  nameInput: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1E',
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingVertical: 6,
    width: '100%',
    marginBottom: 16,
  },
  emojiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  emojiPick: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  emojiPickActive: { borderColor: '#1A1A1E' },
  emojiPickText: { fontSize: 22 },
  saveButton: {
    backgroundColor: '#1A1A1E',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 30,
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionAction: { fontSize: 14, fontWeight: '600', color: '#E53935' },
  muted: { fontSize: 13, color: '#999', lineHeight: 20 },
  hint: { fontSize: 12, color: '#aaa', marginTop: 8, lineHeight: 18 },
  peerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 12,
  },
  peerRowLive: { backgroundColor: '#E8F5E9' },
  peerEmoji: { fontSize: 28 },
  peerName: { fontSize: 16, fontWeight: '600', color: '#222' },
  peerRelation: { fontSize: 13, fontWeight: '400', color: '#999' },
  peerStatus: { fontSize: 12.5, color: '#999', marginTop: 2 },
  peerStatusLive: { color: '#2E7D32', fontWeight: '600' },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2E7D32',
  },
  peerArrow: { fontSize: 20, color: '#bbb', minWidth: 10 },
  statRow: { flexDirection: 'row', gap: 10 },
  statCell: {
    flex: 1,
    backgroundColor: '#fafafa',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '700', color: '#1A1A1E' },
  statLabel: { fontSize: 12, color: '#999', marginTop: 4 },
  footer: {
    marginTop: 36,
    fontSize: 11.5,
    color: '#bbb',
    textAlign: 'center',
    lineHeight: 18,
  },
});
