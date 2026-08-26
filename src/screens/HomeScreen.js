import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import Svg, { Circle } from 'react-native-svg';

import { renderTemplate } from '../storage';
import { SMS_SENT, SMS_UNAVAILABLE, SMS_WEB_FALLBACK, sendSms } from '../sms';
import MessagePreviewModal from '../components/MessagePreviewModal';
import Icon from '../components/Icon';

const HOLD_DURATION_MS = 2000;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BUTTON_SIZE = Math.min(SCREEN_WIDTH, SCREEN_HEIGHT) * 0.45;
const STROKE_WIDTH = 10;
const RADIUS = (BUTTON_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function HomeScreen({
  settings,
  onOpenSettings,
  onStartTracking,
  onOpenHistory,
  onOpenWatch,
  onOpenCheckIn,
  onOpenNight,
  onOpenMyPage,
  checkInRemaining,
  interrupted,
  onResume,
  onDiscard,
}) {
  const [locationGranted, setLocationGranted] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [previewMessage, setPreviewMessage] = useState(null);

  const progress = useRef(new Animated.Value(0)).current;
  const animationRef = useRef(null);
  const completedRef = useRef(false);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationGranted(false);
        setPermissionMessage('위치 권한이 거부되었습니다. GPS 없이 전송됩니다.');
      } else {
        setLocationGranted(true);
      }
    })();
  }, []);

  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRCUMFERENCE, 0],
  });

  const getLocationText = async () => {
    try {
      if (!locationGranted) return '위치 없음';
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const { latitude, longitude } = loc.coords;
      return `https://maps.google.com/?q=${latitude},${longitude}`;
    } catch {
      return '위치 없음';
    }
  };

  const showToastMessage = () => {
    setShowToast(true);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setShowToast(false));
  };

  const sendSOS = async () => {
    if (isSending) return;
    if (!settings.contacts || settings.contacts.length === 0) {
      Alert.alert('연락처 없음', '먼저 설정에서 긴급 연락처를 추가해주세요.');
      return;
    }
    setIsSending(true);
    try {
      const locationText = await getLocationText();
      const message = renderTemplate(settings.messageTemplate, {
        이름: settings.userName || 'here',
        위치: locationText,
      });

      const phones = settings.contacts.map((c) => c.phone);
      const { result } = await sendSms(phones, message);

      if (result === SMS_WEB_FALLBACK) {
        setPreviewMessage(message);
      } else if (result === SMS_UNAVAILABLE) {
        Alert.alert('전송 실패', '이 기기에서는 SMS를 보낼 수 없습니다.');
      } else if (result === SMS_SENT) {
        showToastMessage();
      }
    } catch {
      Alert.alert('전송 실패', '문자 전송 중 오류가 발생했습니다.');
    } finally {
      setIsSending(false);
      progress.setValue(0);
    }
  };

  const handlePressIn = () => {
    if (isSending) return;
    completedRef.current = false;
    progress.setValue(0);
    animationRef.current = Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    animationRef.current.start(({ finished }) => {
      if (finished && !completedRef.current) {
        completedRef.current = true;
        sendSOS();
      }
    });
  };

  const handlePressOut = () => {
    if (completedRef.current) return;
    if (animationRef.current) animationRef.current.stop();
    Animated.timing(progress, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const handleTracking = () => {
    if (!settings.contacts || settings.contacts.length === 0) {
      Alert.alert('연락처 없음', '먼저 설정에서 긴급 연락처를 추가해주세요.');
      return;
    }
    Alert.alert(
      '실시간 추적 시작',
      `${settings.trackingIntervalMinutes || 5}분마다 위치를 전송합니다.\n수신자에게 링크 한 번만 보내면 됩니다. 시작할까요?`,
      [
        { text: '취소', style: 'cancel' },
        { text: '시작', style: 'destructive', onPress: onStartTracking },
      ],
    );
  };

  const contactCount = settings.contacts?.length || 0;
  const canSend = !isSending && contactCount > 0;

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.appName}>here</Text>
        <Pressable onPress={onOpenMyPage} hitSlop={12} style={styles.gear}>
          <Icon name="person" size={24} color="#666" />
        </Pressable>
      </View>

      {interrupted && (
        <View style={styles.interruptedBox}>
          <Text style={styles.interruptedTitle}>진행 중이던 추적이 있습니다</Text>
          <Text style={styles.interruptedDesc}>
            앱이 종료되어 중단됐습니다. 공유 링크는 아직 살아 있습니다.
          </Text>
          <View style={styles.interruptedRow}>
            <Pressable style={styles.interruptedPrimary} onPress={onResume}>
              <Text style={styles.interruptedPrimaryText}>이어서 추적</Text>
            </Pressable>
            <Pressable style={styles.interruptedGhost} onPress={onDiscard}>
              <Text style={styles.interruptedGhostText}>종료하기</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.center}>
        <View style={styles.buttonWrapper}>
          <Svg
            width={BUTTON_SIZE}
            height={BUTTON_SIZE}
            style={StyleSheet.absoluteFill}
          >
            <Circle
              cx={BUTTON_SIZE / 2}
              cy={BUTTON_SIZE / 2}
              r={RADIUS}
              stroke="#FFD6D6"
              strokeWidth={STROKE_WIDTH}
              fill="transparent"
            />
            <AnimatedCircle
              cx={BUTTON_SIZE / 2}
              cy={BUTTON_SIZE / 2}
              r={RADIUS}
              stroke="#8B0000"
              strokeWidth={STROKE_WIDTH}
              fill="transparent"
              strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              rotation="-90"
              originX={BUTTON_SIZE / 2}
              originY={BUTTON_SIZE / 2}
            />
          </Svg>

          <Pressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={!canSend}
            style={({ pressed }) => [
              styles.sosButton,
              pressed && styles.sosButtonPressed,
              !canSend && styles.sosButtonDisabled,
            ]}
          >
            <Text style={styles.sosText}>SOS</Text>
          </Pressable>
        </View>

        <Text style={styles.helperText}>
          {isSending
            ? '전송 중...'
            : contactCount === 0
            ? '설정에서 연락처를 추가해주세요'
            : '2초간 누르면 현재 위치가 전송됩니다'}
        </Text>

        {contactCount > 0 && (
          <Text style={styles.contactCount}>{contactCount}명에게 전송됩니다</Text>
        )}

        <View style={styles.divider} />

        <Pressable
          style={[
            styles.trackingButton,
            contactCount === 0 && styles.trackingButtonDisabled,
          ]}
          onPress={handleTracking}
          disabled={contactCount === 0}
        >
          <View style={styles.trackingIcon}><Icon name="pin" size={22} color="#E65100" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.trackingTitle}>실시간 위치 추적</Text>
            <Text style={styles.trackingSubtitle}>
              {settings.trackingIntervalMinutes || 5}분마다 새 위치가 전송됩니다
            </Text>
          </View>
          <Text style={styles.trackingArrow}>›</Text>
        </Pressable>

        <Pressable
          style={[styles.trackingButton, styles.checkInButton]}
          onPress={onOpenCheckIn}
        >
          <View style={styles.trackingIcon}><Icon name="timer" size={22} color="#4527A0" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.checkInTitle}>자동 체크인</Text>
            <Text style={styles.checkInSubtitle}>
              {checkInRemaining
                ? `${checkInRemaining} 남음 · 누르면 해제할 수 있습니다`
                : '시간 안에 응답 없으면 자동으로 알립니다'}
            </Text>
          </View>
          <Text style={styles.checkInArrow}>›</Text>
        </Pressable>

        <Pressable
          style={[styles.trackingButton, styles.nightButton]}
          onPress={onOpenNight}
        >
          <View style={styles.trackingIcon}>
            <Icon name="clock" size={22} color="#E8EAED" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.nightTitle}>밤 모드</Text>
            <Text style={styles.nightSubtitle}>
              마시기 전에 켜두면 아침에 동선이 남습니다
            </Text>
          </View>
          <Text style={styles.nightArrow}>›</Text>
        </Pressable>

        <View style={styles.secondaryRow}>
          <Pressable style={styles.secondaryButton} onPress={onOpenHistory}>
            <Icon name="clock" size={17} color="#555" />
            <Text style={styles.secondaryText}>기록</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onOpenWatch}>
            <Icon name="eye" size={17} color="#555" />
            <Text style={styles.secondaryText}>지켜보기</Text>
          </Pressable>
        </View>

        {permissionMessage ? (
          <Text style={styles.permissionText}>{permissionMessage}</Text>
        ) : null}
      </View>

      {showToast && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>전송 완료</Text>
        </Animated.View>
      )}

      <MessagePreviewModal
        visible={previewMessage !== null}
        message={previewMessage || ''}
        contacts={settings.contacts || []}
        onClose={() => setPreviewMessage(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  appName: { fontSize: 20, fontWeight: '600', color: '#333', letterSpacing: 2 },
  gear: { padding: 4 },
  gearIcon: { fontSize: 26, color: '#666' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  buttonWrapper: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosButton: {
    width: BUTTON_SIZE - STROKE_WIDTH * 2 - 8,
    height: BUTTON_SIZE - STROKE_WIDTH * 2 - 8,
    borderRadius: (BUTTON_SIZE - STROKE_WIDTH * 2 - 8) / 2,
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  sosButtonPressed: { backgroundColor: '#B71C1C' },
  sosButtonDisabled: { backgroundColor: '#9E9E9E' },
  sosText: {
    color: '#ffffff',
    fontSize: BUTTON_SIZE * 0.22,
    fontWeight: 'bold',
    letterSpacing: 4,
  },
  helperText: {
    marginTop: 24,
    fontSize: 15,
    color: '#555',
    textAlign: 'center',
  },
  contactCount: { marginTop: 6, fontSize: 13, color: '#999' },
  divider: {
    width: '80%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#ddd',
    marginVertical: 20,
  },
  trackingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    width: '100%',
  },
  trackingButtonDisabled: { opacity: 0.5 },
  trackingIcon: { marginRight: 12 },
  trackingTitle: { fontSize: 15, fontWeight: '600', color: '#E65100' },
  trackingSubtitle: { fontSize: 12, color: '#8D6E63', marginTop: 2 },
  trackingArrow: { fontSize: 24, color: '#E65100' },
  checkInButton: { backgroundColor: '#EDE7F6', marginTop: 10 },
  checkInTitle: { fontSize: 15, fontWeight: '600', color: '#4527A0' },
  checkInSubtitle: { fontSize: 12, color: '#7E57C2', marginTop: 2 },
  checkInArrow: { fontSize: 24, color: '#4527A0' },
  nightButton: { backgroundColor: '#1A1A1E', marginTop: 10 },
  nightTitle: { fontSize: 15, fontWeight: '600', color: '#fff' },
  nightSubtitle: { fontSize: 12, color: '#9AA0A6', marginTop: 2 },
  nightArrow: { fontSize: 24, color: '#9AA0A6' },
  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginTop: 10,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  
  secondaryText: { fontSize: 14, fontWeight: '600', color: '#555' },
  interruptedBox: {
    marginHorizontal: 20,
    marginTop: 4,
    backgroundColor: '#FFF3E0',
    borderRadius: 14,
    padding: 16,
  },
  interruptedTitle: { fontSize: 15, fontWeight: '700', color: '#E65100' },
  interruptedDesc: {
    fontSize: 13,
    color: '#8D6E63',
    marginTop: 4,
    lineHeight: 19,
  },
  interruptedRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  interruptedPrimary: {
    flex: 1,
    backgroundColor: '#E65100',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  interruptedPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  interruptedGhost: {
    flex: 1,
    backgroundColor: '#FFE0B2',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  interruptedGhostText: { color: '#E65100', fontWeight: '600', fontSize: 14 },
  permissionText: {
    marginTop: 16,
    fontSize: 13,
    color: '#B71C1C',
    textAlign: 'center',
  },
  toast: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
    backgroundColor: '#2E7D32',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  toastText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
