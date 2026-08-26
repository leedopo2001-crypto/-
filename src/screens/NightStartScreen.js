import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  END_HOUR_PRESETS,
  NIGHT_INTERVAL_MINUTES,
  formatEndsAt,
  formatRemaining,
  nextOccurrence,
} from '../lib/nightMode';
import Icon from '../components/Icon';

/**
 * 밤 모드를 켜는 화면.
 *
 * 판단이 멀쩡할 때 한 번 누르고 잊어버리는 것이 이 기능의 전부다.
 * 그래서 고를 것을 최소로 두었다 — 언제 끝낼지 하나뿐이다.
 */
export default function NightStartScreen({ onBack, onStart }) {
  const [endHour, setEndHour] = useState(6);
  const endsAtMs = nextOccurrence(endHour);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.headerBack}>‹ 뒤로</Text>
        </Pressable>
        <Text style={styles.headerTitle}>밤 모드</Text>
        <View style={{ minWidth: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.lead}>
          지금 켜두면 정해진 시각까지 동선을 조용히 기록합니다.{'\n'}
          아침에 기록에서 어디를 다녀왔는지 확인할 수 있습니다.
        </Text>

        <Text style={styles.sectionLabel}>언제까지</Text>
        <View style={styles.row}>
          {END_HOUR_PRESETS.map((h) => (
            <Pressable
              key={h}
              onPress={() => setEndHour(h)}
              style={[styles.pill, endHour === h && styles.pillActive]}
            >
              <Text style={[styles.pillText, endHour === h && styles.pillTextActive]}>
                {h}시
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.summary}>
          <Text style={styles.summaryLine}>
            {formatEndsAt(endsAtMs)} 까지 · 약 {formatRemaining(endsAtMs - Date.now())}
          </Text>
          <Text style={styles.summarySub}>
            {NIGHT_INTERVAL_MINUTES}분마다 위치를 남깁니다
          </Text>
        </View>

        <Pressable style={styles.startButton} onPress={() => onStart({ endsAtMs })}>
          <Icon name="clock" size={18} color="#fff" />
          <Text style={styles.startText}>밤 모드 시작</Text>
        </Pressable>

        <View style={styles.notes}>
          <Note
            title="문자를 보내지 않습니다"
            desc="공유가 아니라 기록이 목적입니다. 필요하면 추적 화면에서 언제든 링크를 보낼 수 있습니다."
          />
          <Note
            title="10분 간격입니다"
            desc="밤새 돌아야 하므로 배터리를 아낍니다. 술집에 머문 시간과 이동 경로를 되짚기에는 충분합니다."
          />
          <Note
            title="사진이 함께 정리됩니다"
            desc="그 시간대에 찍은 사진의 촬영 시각과 위치를 동선에 얹어 보여줍니다. 사진은 기기 밖으로 나가지 않습니다."
          />
        </View>

        <Text style={styles.limitation}>
          Expo Go 에서는 앱이 살아 있어야 기록됩니다. 화면이 꺼지는 것은
          괜찮지만, 앱을 완전히 종료하면 멈춥니다. 그 경우에도 그때까지의
          기록은 남고, 다시 열면 이어서 할지 물어봅니다.
        </Text>
      </ScrollView>
    </View>
  );
}

function Note({ title, desc }) {
  return (
    <View style={styles.note}>
      <Text style={styles.noteTitle}>{title}</Text>
      <Text style={styles.noteDesc}>{desc}</Text>
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
  scroll: { padding: 20, paddingBottom: 40 },
  lead: { fontSize: 15, color: '#555', lineHeight: 22, marginBottom: 26 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  row: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  pill: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#eee',
    alignItems: 'center',
  },
  pillActive: { backgroundColor: '#1A1A1E', borderColor: '#1A1A1E' },
  pillText: { fontSize: 15, fontWeight: '600', color: '#555' },
  pillTextActive: { color: '#fff' },
  summary: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 22,
  },
  summaryLine: { fontSize: 16, fontWeight: '700', color: '#1A1A1E' },
  summarySub: { fontSize: 12.5, color: '#888', marginTop: 4 },
  startButton: {
    backgroundColor: '#1A1A1E',
    paddingVertical: 17,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  startText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  notes: { marginTop: 30, gap: 14 },
  note: {},
  noteTitle: { fontSize: 14, fontWeight: '700', color: '#222' },
  noteDesc: { fontSize: 13, color: '#888', marginTop: 3, lineHeight: 20 },
  limitation: {
    marginTop: 28,
    fontSize: 12,
    color: '#aaa',
    lineHeight: 19,
  },
});
