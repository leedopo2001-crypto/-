import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_SETTINGS = '@here:settings:v2';

export const DEFAULT_MESSAGE_TEMPLATE =
  '🆘 [{이름}] 긴급상황! 현재 위치: {위치}';

export const DEFAULT_TRACKING_MESSAGE_TEMPLATE =
  '🆘 [{이름}] 긴급상황! 실시간 위치 확인: {링크}';

export const INTERVAL_OPTIONS = [1, 5, 10, 15];

const defaultSettings = {
  onboarded: false,
  userName: '',
  contacts: [],
  messageTemplate: DEFAULT_MESSAGE_TEMPLATE,
  trackingMessageTemplate: DEFAULT_TRACKING_MESSAGE_TEMPLATE,
  trackingIntervalMinutes: 5,
};

export async function loadSettings() {
  try {
    const raw = await AsyncStorage.getItem(KEY_SETTINGS);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw);
    return { ...defaultSettings, ...parsed };
  } catch {
    return { ...defaultSettings };
  }
}

export async function saveSettings(settings) {
  await AsyncStorage.setItem(KEY_SETTINGS, JSON.stringify(settings));
}

export function normalizePhone(raw) {
  const digits = (raw || '').replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) return digits;
  if (/^01[016789]/.test(digits)) {
    return '+82' + digits.substring(1);
  }
  return digits;
}

export function formatPhoneDisplay(phone) {
  if (!phone) return '';
  if (phone.startsWith('+82')) {
    const rest = phone.substring(3);
    if (rest.length === 10) {
      return `0${rest.substring(0, 2)}-${rest.substring(2, 6)}-${rest.substring(6)}`;
    }
    if (rest.length === 9) {
      return `0${rest.substring(0, 1)}-${rest.substring(1, 5)}-${rest.substring(5)}`;
    }
  }
  return phone;
}

export function renderTemplate(template, values) {
  if (!template) return '';
  return template
    .replace(/\{이름\}/g, values.이름 || 'here')
    .replace(/\{위치\}/g, values.위치 || '위치 없음')
    .replace(/\{링크\}/g, values.링크 || '');
}
