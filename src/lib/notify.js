// 자동 체크인용 로컬 알림.
//
// 로컬 알림만 쓴다 (원격 푸시 아님). Expo Go 는 SDK 53 부터 원격 푸시를
// 지원하지 않지만, 예약된 로컬 알림은 그대로 동작한다.
//
// 한계: 알림은 "앱을 열어달라"고 말할 수만 있다. 앱이 닫힌 상태에서 문자를
// 대신 보내주지는 못한다. 진짜 백그라운드 동작은 EAS 빌드가 필요하다.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

let configured = false;

function configure() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function ensureNotificationPermission() {
  if (Platform.OS === 'web') return false;
  try {
    configure();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const asked = await Notifications.requestPermissionsAsync();
    return Boolean(asked.granted);
  } catch {
    return false;
  }
}

/**
 * 마감 5분 전 예고와 마감 시점 알림을 예약한다.
 * 예약된 알림의 id 목록을 돌려주므로, 체크인을 해제할 때 같이 취소하면 된다.
 */
export async function scheduleCheckInReminders({ deadlineMs, label }) {
  if (Platform.OS === 'web') return [];

  try {
    configure();
    const ids = [];
    const warnAt = deadlineMs - 5 * 60_000;
    const name = label ? `[${label}] ` : '';

    if (warnAt > Date.now() + 30_000) {
      ids.push(
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `${name}체크인 5분 전`,
            body: '앱을 열어 "무사히 도착"을 눌러주세요.',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(warnAt),
          },
        }),
      );
    }

    if (deadlineMs > Date.now() + 5_000) {
      ids.push(
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `${name}체크인 시간이 지났습니다`,
            body: '앱을 열어주세요. 응답이 없으면 긴급 연락처에 알립니다.',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(deadlineMs),
          },
        }),
      );
    }
    return ids;
  } catch {
    return [];
  }
}

export async function cancelReminders(ids) {
  if (!ids?.length) return;
  try {
    await Promise.all(
      ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)),
    );
  } catch {}
}
