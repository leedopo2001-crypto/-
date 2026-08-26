import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from '../components/Icon';

export default function OnboardingScreen({ onStart }) {
  return (
    <View style={styles.container}>
      <View style={styles.logoWrap}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoText}>h</Text>
        </View>
      </View>

      <Text style={styles.title}>here</Text>
      <Text style={styles.subtitle}>긴급 상황 시 위치를 공유하는 앱</Text>

      <View style={styles.features}>
        <FeatureRow
          icon="pin"
          title="GPS 위치 자동 첨부"
          desc="구글맵 링크로 현재 위치를 전달합니다"
        />
        <FeatureRow
          icon="chat"
          title="긴급 연락처에 문자 전송"
          desc="저장한 연락처에 한 번에 보냅니다"
        />
        <FeatureRow
          icon="lock"
          title="실수 방지"
          desc="2초 길게 누르기로 오작동을 막습니다"
        />
      </View>

      <Pressable style={styles.button} onPress={onStart}>
        <Text style={styles.buttonText}>시작하기</Text>
      </Pressable>
    </View>
  );
}

function FeatureRow({ icon, title, desc }) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureIcon}>
        <Icon name={icon} size={22} color="#1A1A1E" />
      </View>
      <View style={styles.featureText}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDesc}>{desc}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 32,
    justifyContent: 'center',
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoCircle: {
    width: 108,
    height: 108,
    borderRadius: 28,
    backgroundColor: '#1A1A1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#fff',
    fontSize: 60,
    fontWeight: '600',
    lineHeight: 70,
  },
  title: {
    textAlign: 'center',
    fontSize: 36,
    fontWeight: 'bold',
    color: '#222',
    letterSpacing: 2,
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 16,
    color: '#666',
    marginBottom: 40,
  },
  features: {
    marginBottom: 48,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F3F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 13,
    color: '#777',
  },
  button: {
    backgroundColor: '#E53935',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
