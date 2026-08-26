import React from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import PathPreview from '../components/PathPreview';
import { deleteSession } from '../lib/history';
import { formatDistance, formatDuration } from '../lib/geo';
import { shakeLabel } from '../lib/shake';

function formatDateTime(iso) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hh}:${mm}`;
}

function speedText(kmh) {
  return Number.isFinite(kmh) ? `${kmh.toFixed(1)} km/h` : '—';
}

export default function HistoryDetailScreen({ session, onBack, onDeleted }) {
  const stats = session.stats || {};

  const handleDelete = () => {
    Alert.alert('기록 삭제', '이 기록을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          await deleteSession(session.id);
          onDeleted();
        },
      },
    ]);
  };

  const handleOpenWeb = () => {
    if (session.url) Linking.openURL(session.url);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.headerBack}>‹ 기록</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{formatDateTime(session.startedAt)}</Text>
        <Pressable onPress={handleDelete} hitSlop={12}>
          <Text style={styles.headerDelete}>삭제</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <PathPreview points={session.points} />

        <View style={styles.grid}>
          <Cell label="이동 거리" value={formatDistance(stats.distanceKm || 0)} />
          <Cell label="소요 시간" value={formatDuration(stats.durationMs || 0)} />
          <Cell label="평균 속도" value={speedText(stats.avgSpeedKmh)} />
          <Cell label="최고 속도" value={speedText(stats.maxSpeedKmh)} />
          <Cell
            label="평균 흔들림"
            value={
              Number.isFinite(stats.avgShake)
                ? `${stats.avgShake} (${shakeLabel(stats.avgShake)})`
                : '—'
            }
          />
          <Cell
            label="최대 흔들림"
            value={
              Number.isFinite(stats.maxShake)
                ? `${stats.maxShake} (${shakeLabel(stats.maxShake)})`
                : '—'
            }
          />
          <Cell label="기록 위치" value={`${session.points?.length || 0}개`} />
          <Cell label="기록 간격" value={`${session.intervalMinutes || '?'}분`} />
        </View>

        {session.url && (
          <Pressable style={styles.webButton} onPress={handleOpenWeb}>
            <Text style={styles.webButtonText}>🗺 웹 지도에서 경로 재생</Text>
          </Pressable>
        )}
        <Text style={styles.hint}>
          웹 지도는 서버 데이터를 사용하므로, 서버에서 오래된 세션을 정리한
          뒤에는 열리지 않을 수 있습니다. 위 통계와 경로 모양은 이 기기에
          저장되어 계속 남습니다.
        </Text>
      </ScrollView>
    </View>
  );
}

function Cell({ label, value }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue}>{value}</Text>
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
  headerBack: { fontSize: 17, color: '#E53935', minWidth: 60 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#222' },
  headerDelete: { fontSize: 15, color: '#E53935', minWidth: 60, textAlign: 'right' },
  scroll: { padding: 20 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
    gap: 10,
  },
  cell: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: '#fafafa',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  cellLabel: { fontSize: 11, color: '#999', marginBottom: 4 },
  cellValue: { fontSize: 16, fontWeight: '600', color: '#222' },
  webButton: {
    marginTop: 20,
    backgroundColor: '#E3F2FD',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  webButtonText: { color: '#1565C0', fontWeight: '600', fontSize: 15 },
  hint: {
    marginTop: 12,
    fontSize: 12,
    color: '#999',
    lineHeight: 18,
  },
});
