// 여러 화면에서 같은 방식으로 긴급 문자를 보내기 위한 공용 경로.
// (SOS 버튼, 자동 체크인 만료, 이상 감지 무응답)

import * as Location from 'expo-location';

import { renderTemplate } from '../storage';
import { sendSms } from '../sms';

/** 현재 위치를 구글맵 링크로. 실패하면 '위치 없음'. */
export async function currentLocationText() {
  try {
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    const { latitude, longitude } = loc.coords;
    return `https://maps.google.com/?q=${latitude},${longitude}`;
  } catch {
    return '위치 없음';
  }
}

/**
 * 긴급 문자를 보낸다.
 *
 * prefix 는 왜 이 문자가 나갔는지 앞에 붙인다. 받는 사람 입장에서
 * "본인이 누른 SOS"와 "앱이 자동으로 보낸 것"은 대응이 다르다.
 */
export async function sendEmergencySms({ settings, prefix = '', locationText }) {
  const contacts = settings.contacts || [];
  if (contacts.length === 0) {
    return { result: 'no-contacts', message: '' };
  }

  const where = locationText ?? (await currentLocationText());
  const body = renderTemplate(settings.messageTemplate, {
    이름: settings.userName || 'here',
    위치: where,
  });
  const message = prefix ? `${prefix}\n${body}` : body;

  const { result } = await sendSms(
    contacts.map((c) => c.phone),
    message,
  );
  return { result, message };
}

export const PREFIX_CHECKIN =
  '[자동 체크인] 시간이 지났는데 응답이 없어 자동으로 보냅니다.';
export const PREFIX_STILLNESS =
  '[움직임 없음] 확인했으나 응답이 없어 자동으로 보냅니다.';
