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
import * as SMS from 'expo-sms';
import Svg, { Circle } from 'react-native-svg';

const HOLD_DURATION_MS = 2000;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BUTTON_SIZE = Math.min(SCREEN_WIDTH, SCREEN_HEIGHT) * 0.5;
const STROKE_WIDTH = 10;
const RADIUS = (BUTTON_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function HomeScreen({ settings, onOpenSettings }) {
  const [locationGranted, setLocationGranted] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showToast, setShowToast] = useState(false);

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

  const buildMessage = (locationText) => {
    const name = settings.userName ? `[${settings.userName}] ` : '[here] ';
    return `🆘 ${name}긴급상황! 현재 위치: ${locationText}`;
  };

  const showToastMessage = () => {
    setShowToast(true);
    Animated.sequence([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(1800),
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
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
      const message = buildMessage(locationText);

      const smsAvailable = await SMS.isAvailableAsync();
      if (!smsAvailable) {
        Alert.alert('전송 실패', '이 기기에서는 SMS를 보낼 수 없습니다.');
        return;
      }

      const phones = settings.contacts.map((c) => c.phone);
      const { result } = await SMS.sendSMSAsync(phones, message);
      if (result === 'sent' || result === 'unknown') {
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
    if (animationRef.current) {
      animationRef.current.stop();
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const contactCount = settings.contacts?.length || 0;

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.appName}>here</Text>
        <Pressable onPress={onOpenSettings} hitSlop={12} style={styles.gear}>
          <Text style={styles.gearIcon}>⚙</Text>
        </Pressable>
      </View>

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
            disabled={isSending || contactCount === 0}
            style={({ pressed }) => [
              styles.sosButton,
              pressed && styles.sosButtonPressed,
              (isSending || contactCount === 0) && styles.sosButtonDisabled,
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
            : '2초간 누르면 위치가 전송됩니다'}
        </Text>

        {contactCount > 0 && (
          <Text style={styles.contactCount}>
            {contactCount}명에게 전송됩니다
          </Text>
        )}

        {permissionMessage ? (
          <Text style={styles.permissionText}>{permissionMessage}</Text>
        ) : null}
      </View>

      {showToast && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>전송 완료</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  appName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    letterSpacing: 2,
  },
  gear: {
    padding: 4,
  },
  gearIcon: {
    fontSize: 26,
    color: '#666',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
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
  sosButtonPressed: {
    backgroundColor: '#B71C1C',
  },
  sosButtonDisabled: {
    backgroundColor: '#9E9E9E',
  },
  sosText: {
    color: '#ffffff',
    fontSize: BUTTON_SIZE * 0.22,
    fontWeight: 'bold',
    letterSpacing: 4,
  },
  helperText: {
    marginTop: 32,
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
  },
  contactCount: {
    marginTop: 8,
    fontSize: 13,
    color: '#999',
  },
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
  toastText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
