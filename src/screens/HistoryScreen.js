import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { listSessions } from '../lib/history';
import { formatDistance, formatDuration } from '../lib/geo';
import Icon from '../components/Icon';

function formatDate(iso) {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${month}월 ${day}일 ${hh}:${mm}`;
}

export default function HistoryScreen({ onBack, onOpenSession }) {
  const [sessions, setSessions] = useState(null);

  useEffect(() => {
    listSessions().then(setSessions);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.headerBack}>‹ 뒤로</Text>
        </Pressable>
        <Text style={styles.headerTitle}>기록</Text>
        <View style={{ minWidth: 60 }} />
      </View>

      {sessions && sessions.length === 0 && (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Icon name="clock" size={40} color="#c8ccd0" /></View>
          <Text style={styles.emptyTitle}>아직 기록이 없습니다</Text>
          <Text style={styles.emptyDesc}>
            실시간 위치 추적을 종료하면{'\n'}동선과 통계가 여기에 저장됩니다.
          </Text>
        </View>
      )}

      <FlatList
        data={sessions || []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => onOpenSession(item)}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowDate}>{formatDate(item.startedAt)}</Text>
              <Text style={styles.rowMeta}>
                {formatDuration(item.stats?.durationMs || 0)} ·{' '}
                {formatDistance(item.stats?.distanceKm || 0)} ·{' '}
                위치 {item.points?.length || 0}개
              </Text>
            </View>
            <Text style={styles.rowArrow}>›</Text>
          </Pressable>
        )}
      />
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
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#222' },
  list: { padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  rowLeft: { flex: 1 },
  rowDate: { fontSize: 16, fontWeight: '600', color: '#222' },
  rowMeta: { fontSize: 13, color: '#777', marginTop: 3 },
  rowArrow: { fontSize: 22, color: '#bbb', marginLeft: 8 },
  empty: {
    alignItems: 'center',
    paddingTop: 100,
    paddingHorizontal: 40,
  },
  emptyIcon: { marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#444', marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: '#999', textAlign: 'center', lineHeight: 21 },
});
