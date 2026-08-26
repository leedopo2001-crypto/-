import React, { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
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
import { detectStays, totalStayMs } from '../lib/stays';
import { shareGpx, shareSummary } from '../lib/exportRoute';

function formatDateTime(iso) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hh}:${mm}`;
}

function speedText(kmh) {
  return Number.isFinite(kmh) ? `${kmh.toFixed(1)} km/h` : '—';
}

function clockTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function HistoryDetailScreen({ session, onBack, onDeleted }) {
  const stats = session.stats || {};
  const [exportNote, setExportNote] = useState(null);

  const stays = useMemo(() => detectStays(session.points || []), [session.points]);

  const handleExportGpx = async () => {
    const result = await shareGpx(session);
    if (result.ok) {
      setExportNote(null);
      return;
    }
    const messages = {
      'web-unsupported': '웹에서는 파일 내보내기를 지원하지 않습니다. 폰에서 시도해주세요.',
      'no-points': '내보낼 위치 기록이 없습니다.',
      'sharing-unavailable': '이 기기에서는 공유 기능을 쓸 수 없습니다.',
    };
    setExportNote(messages[result.reason] || `내보내기에 실패했습니다: ${result.reason}`);
  };

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
        <PathPreview points={session.points} stays={stays} />

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

        {stays.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>
              머문 곳 {stays.length}곳 · 합계 {formatDuration(totalStayMs(stays))}
            </Text>
            {stays.map((stay) => (
              <View key={`${stay.startIndex}-${stay.endIndex}`} style={styles.stayRow}>
                <View style={styles.stayDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.stayTime}>
                    {clockTime(stay.startT)} – {clockTime(stay.endT)}
                  </Text>
                  <Text style={styles.stayMeta}>
                    {formatDuration(stay.durationMs)} 머무름 · 위치 {stay.pointCount}개
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    Linking.openURL(
                      `https://maps.google.com/?q=${stay.latitude},${stay.longitude}`,
                    )
                  }
                  hitSlop={8}
                >
                  <Text style={styles.stayLink}>지도</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}

        <Text style={styles.sectionLabel}>내보내기</Text>
        <View style={styles.exportRow}>
          <Pressable style={styles.exportButton} onPress={handleExportGpx}>
            <Text style={styles.exportText}>📄 GPX 파일</Text>
          </Pressable>
          <Pressable
            style={styles.exportButton}
            onPress={() => shareSummary(session)}
          >
            <Text style={styles.exportText}>💬 요약 보내기</Text>
          </Pressable>
        </View>
        {exportNote && <Text style={styles.exportNote}>{exportNote}</Text>}
        <Text style={styles.hint}>
          GPX 는 등산·러닝 앱과 구글 어스에서 그대로 열립니다. 배터리·흔들림은
          확장 필드로 함께 저장되며, 표준 뷰어는 이를 무시합니다.
        </Text>

        {session.url && (
          <Pressable style={styles.webButton} onPress={handleOpenWeb}>
            <Text style={styles.webButtonText}>🗺 웹 지도에서 보기</Text>
          </Pressable>
        )}
        <Text style={styles.hint}>
          웹 지도는 서버 데이터를 사용하므로, 서버에서 오래된 세션을 정리한
          뒤에는 열리지 않을 수 있습니다. 위 통계와 경로는 이 기기에 저장되어
          계속 남습니다.
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
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 26,
    marginBottom: 10,
  },
  stayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F0FA',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 12,
  },
  stayDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4527A0',
  },
  stayTime: { fontSize: 15, fontWeight: '600', color: '#311B92' },
  stayMeta: { fontSize: 12, color: '#7E57C2', marginTop: 2 },
  stayLink: { fontSize: 13, fontWeight: '600', color: '#4527A0' },
  exportRow: { flexDirection: 'row', gap: 10 },
  exportButton: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
  },
  exportText: { color: '#555', fontSize: 14, fontWeight: '600' },
  exportNote: {
    marginTop: 10,
    fontSize: 13,
    color: '#B71C1C',
    lineHeight: 19,
  },
  hint: {
    marginTop: 12,
    fontSize: 12,
    color: '#999',
    lineHeight: 18,
  },
});
