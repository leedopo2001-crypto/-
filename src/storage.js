import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_SETTINGS = '@here:settings:v1';

const defaultSettings = {
  onboarded: false,
  userName: '',
  contacts: [],
};

export async function loadSettings() {
  try {
    const raw = await AsyncStorage.getItem(KEY_SETTINGS);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw);
    return { ...defaultSettings, ...parsed };
  } catch {
    return defaultSettings;
  }
}

export async function saveSettings(settings) {
  await AsyncStorage.setItem(KEY_SETTINGS, JSON.stringify(settings));
}

export function normalizePhone(raw) {
  const digits = (raw || '').replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('010') || digits.startsWith('011') || digits.startsWith('016') || digits.startsWith('017') || digits.startsWith('018') || digits.startsWith('019')) {
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
