import { Linking, Platform } from 'react-native';
import * as SMS from 'expo-sms';

export const SMS_SENT = 'sent';
export const SMS_CANCELLED = 'cancelled';
export const SMS_UNAVAILABLE = 'unavailable';
export const SMS_WEB_FALLBACK = 'web-fallback';

/**
 * 기기별로 문자 발송을 시도한다.
 * - 네이티브: expo-sms 로 OS 문자 앱을 연다.
 * - 웹: expo-sms 가 동작하지 않으므로 호출부가 미리보기를 띄우도록 신호만 돌려준다.
 */
export async function sendSms(phones, message) {
  if (Platform.OS === 'web') {
    return { result: SMS_WEB_FALLBACK };
  }

  const available = await SMS.isAvailableAsync();
  if (!available) {
    return { result: SMS_UNAVAILABLE };
  }

  const { result } = await SMS.sendSMSAsync(phones, message);
  // iOS 는 'sent' | 'cancelled', Android 는 'unknown' 을 돌려준다.
  return { result: result === 'cancelled' ? SMS_CANCELLED : SMS_SENT };
}

/** 웹 브라우저에서 기본 문자 앱을 열어보는 최선의 시도 (데스크톱에서는 대개 무시된다). */
export function buildSmsLink(phones, message) {
  const recipients = phones.join(',');
  const separator = Platform.OS === 'ios' ? '&' : '?';
  return `sms:${recipients}${separator}body=${encodeURIComponent(message)}`;
}

export async function openSmsLink(phones, message) {
  const url = buildSmsLink(phones, message);
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
