import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const WEB_VIEWER_URL =
  process.env.EXPO_PUBLIC_WEB_VIEWER_URL || 'https://here-sos.vercel.app';

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes('your-project-ref'),
);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 2 } },
    })
  : null;

const SHORT_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function generateShortCode(length = 6) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += SHORT_CODE_ALPHABET[Math.floor(Math.random() * SHORT_CODE_ALPHABET.length)];
  }
  return out;
}

export function buildTrackingUrl(shortCode) {
  return `${WEB_VIEWER_URL.replace(/\/$/, '')}/t/${shortCode}`;
}

export async function createSession({ userName }) {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase가 아직 설정되지 않았습니다. .env 파일을 확인해주세요.',
    );
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const shortCode = generateShortCode();
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        short_code: shortCode,
        user_name: userName || null,
        active: true,
      })
      .select()
      .single();

    if (!error) {
      return { shortCode: data.short_code, url: buildTrackingUrl(data.short_code) };
    }
    if (error.code !== '23505') {
      throw error;
    }
  }
  throw new Error('세션 생성에 실패했습니다. 다시 시도해주세요.');
}

export async function pushLocation({ shortCode, latitude, longitude, accuracy }) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('locations').insert({
    session_code: shortCode,
    latitude,
    longitude,
    accuracy: accuracy ?? null,
  });
  if (error) throw error;
}

export async function endSession(shortCode) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from('sessions')
    .update({ active: false, ended_at: new Date().toISOString() })
    .eq('short_code', shortCode);
  if (error) throw error;
}
