// .env 의 EXPO_PUBLIC_* 값을 eas.json 의 각 빌드 프로필에 채워 넣는다.
//
//   npm run eas:env
//
// 왜 필요한가
//   .env 는 .gitignore 에 있어서 EAS 빌드 서버로 올라가지 않는다. 이걸 모르고
//   빌드하면 앱은 켜지는데 서버 기능이 전부 죽은 채로 나오고, 원인을 찾는 데
//   시간이 든다. 손으로 옮기면 키 하나 잘못 붙여넣기 쉬워서 스크립트로 둔다.
//
//   anon 키는 원래 공개되는 값이라 eas.json 에 커밋해도 안전하다.
//   (웹 뷰어의 config.js 와 같은 논리 — 보안은 RLS 와 RPC 가 맡는다)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.env');
const EAS_PATH = path.join(ROOT, 'eas.json');

const KEYS = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_WEB_VIEWER_URL',
];

function fail(message, hint) {
  console.error(`\n  ✗ ${message}`);
  if (hint) console.error(`    ${hint}`);
  console.error('');
  process.exit(1);
}

if (!fs.existsSync(ENV_PATH)) {
  fail(
    '.env 파일이 없습니다.',
    'SETUP.md 3단계를 따라 .env 를 먼저 만들어주세요. (copy .env.example .env)',
  );
}
if (!fs.existsSync(EAS_PATH)) {
  fail('eas.json 이 없습니다.', 'git pull 로 최신 코드를 받아주세요.');
}

/** 아주 단순한 .env 파서. KEY=VALUE 만 읽고 따옴표는 벗긴다. */
function parseEnv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = parseEnv(fs.readFileSync(ENV_PATH, 'utf8'));

const missing = KEYS.filter((k) => !env[k]);
if (missing.length) {
  fail(
    `.env 에 값이 비어 있습니다: ${missing.join(', ')}`,
    'SETUP.md 를 보고 Supabase URL / anon 키 / Vercel 주소를 채워주세요.',
  );
}

// 아직 예시 값이 남아 있으면 잡아준다 — 이걸로 빌드하면 앱이 서버에 못 붙는다.
const placeholder = KEYS.find(
  (k) => env[k].includes('your-project-ref') || env[k].includes('여기에'),
);
if (placeholder) {
  fail(
    `${placeholder} 가 아직 예시 값입니다.`,
    '.env 를 열어 실제 값으로 바꿔주세요.',
  );
}

const eas = JSON.parse(fs.readFileSync(EAS_PATH, 'utf8'));
const profiles = Object.keys(eas.build || {});
if (profiles.length === 0) fail('eas.json 에 build 프로필이 없습니다.');

for (const name of profiles) {
  eas.build[name].env = { ...(eas.build[name].env || {}) };
  for (const key of KEYS) eas.build[name].env[key] = env[key];
}

fs.writeFileSync(EAS_PATH, JSON.stringify(eas, null, 2) + '\n');

const mask = (v) => (v.length > 18 ? `${v.slice(0, 12)}…${v.slice(-4)}` : v);

console.log('\n  eas.json 을 .env 값으로 채웠습니다.\n');
for (const key of KEYS) {
  console.log(`    ${key.replace('EXPO_PUBLIC_', '').padEnd(18)} ${mask(env[key])}`);
}
console.log(`\n  적용된 프로필: ${profiles.join(', ')}`);
console.log('\n  이제 빌드할 수 있습니다:');
console.log('    npx eas-cli build --profile development --platform android\n');
