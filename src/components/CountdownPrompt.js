import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * 무응답이면 자동으로 진행되는 확인창.
 *
 * 안전 기능에서 흔한 실수는 "정말 보낼까요?"로 끝나는 것이다. 답할 수 없는
 * 상황이 바로 위험한 상황이므로, 여기서는 침묵을 승인으로 해석한다.
 */
export default function CountdownPrompt({
  visible,
  title,
  description,
  seconds = 60,
  confirmLabel = '괜찮아요',
  onSafe,
  onTimeout,
}) {
  const [remaining, setRemaining] = useState(seconds);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!visible) return undefined;

    firedRef.current = false;
    setRemaining(seconds);

    const timer = setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          clearInterval(timer);
          if (!firedRef.current) {
            firedRef.current = true;
            onTimeout();
          }
          return 0;
        }
        return value - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [visible, seconds]);

  if (!visible) return null;

  const ratio = seconds > 0 ? remaining / seconds : 0;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onSafe}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.count}>{remaining}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.desc}>{description}</Text>

          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${ratio * 100}%` }]} />
          </View>

          <Pressable
            style={styles.safeButton}
            onPress={() => {
              firedRef.current = true;
              onSafe();
            }}
          >
            <Text style={styles.safeText}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  count: {
    fontSize: 56,
    fontWeight: 'bold',
    color: '#E53935',
    marginBottom: 8,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: '#222',
    marginBottom: 8,
    textAlign: 'center',
  },
  desc: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
  },
  barTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFE0E0',
    overflow: 'hidden',
    marginBottom: 22,
  },
  barFill: { height: '100%', backgroundColor: '#E53935' },
  safeButton: {
    backgroundColor: '#2E7D32',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  safeText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
