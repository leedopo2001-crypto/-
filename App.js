import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { loadSettings, saveSettings } from './src/storage';
import { clearActive, loadActive } from './src/lib/activeSession';
import { endSession } from './src/api/supabase';
import { saveSession } from './src/lib/history';
import OnboardingScreen from './src/screens/OnboardingScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import HomeScreen from './src/screens/HomeScreen';
import TrackingScreen from './src/screens/TrackingScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import HistoryDetailScreen from './src/screens/HistoryDetailScreen';
import WatchScreen from './src/screens/WatchScreen';
import CheckInScreen from './src/screens/CheckInScreen';
import MyPageScreen from './src/screens/MyPageScreen';
import LinkScreen from './src/screens/LinkScreen';
import WatchdogScreen from './src/screens/WatchdogScreen';
import NightStartScreen from './src/screens/NightStartScreen';
import { formatRemaining, loadCheckIn, remainingMs } from './src/lib/checkin';
import { ensureIdentity, loadIdentity } from './src/lib/identity';

export default function App() {
  const [screen, setScreen] = useState('loading');
  const [settings, setSettings] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  // 앱이 강제 종료되어 끝맺지 못한 추적. 있으면 홈에 복구 배너가 뜬다.
  const [interrupted, setInterrupted] = useState(null);
  const [resumeFrom, setResumeFrom] = useState(null);
  const [checkIn, setCheckIn] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [watchPeer, setWatchPeer] = useState(null);
  const [nightConfig, setNightConfig] = useState(null);
  const [, setClock] = useState(0);

  useEffect(() => {
    (async () => {
      const loaded = await loadSettings();
      setSettings(loaded);
      if (loaded.onboarded) {
        setInterrupted(await loadActive());
        setCheckIn(await loadCheckIn());
        // 이미 신원이 있으면 바로 쓰고, 없으면 서버에 만든다.
        // 실패해도 null 로 두고 나머지 기능은 그대로 동작시킨다.
        setIdentity(
          (await loadIdentity()) ||
            (await ensureIdentity({ displayName: loaded.userName })),
        );
      }
      setScreen(loaded.onboarded ? 'home' : 'onboarding');
    })();
  }, []);

  // 홈의 체크인 남은 시간 표시를 갱신한다.
  useEffect(() => {
    if (screen !== 'home') return undefined;
    const timer = setInterval(() => setClock((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, [screen]);

  const checkInRemaining =
    checkIn && remainingMs(checkIn) > 0
      ? formatRemaining(remainingMs(checkIn))
      : null;

  const handleResume = () => {
    setResumeFrom(interrupted);
    setInterrupted(null);
    setScreen('tracking');
  };

  /**
   * 이어하지 않기로 한 경우. 그냥 지우면 공유 링크가 서버 정리 전까지
   * 계속 살아있으므로, 서버 세션을 확실히 닫고 기록도 남겨준다.
   */
  const handleDiscard = async () => {
    const session = interrupted;
    setInterrupted(null);
    if (!session) return;

    try {
      await endSession(session.shortCode, session.ownerToken);
    } catch {
      // 이미 닫혔거나 네트워크가 없는 경우. 로컬 정리는 계속 진행한다.
    }
    if (session.points?.length > 0) {
      try {
        await saveSession({
          shortCode: session.shortCode,
          url: session.url,
          userName: session.userName || '',
          startedAt: session.startedAt,
          endedAt: new Date().toISOString(),
          intervalMinutes: session.intervalMinutes,
          points: session.points,
        });
      } catch {}
    }
    await clearActive();
  };

  const handleStart = () => setScreen('settings-first');

  const handleSaveSettings = async (next) => {
    setSettings(next);
    await saveSettings(next);
    // 온보딩 직후라면 이 시점에 이름이 정해지므로 신원도 여기서 만든다.
    if (!identity) {
      setIdentity(await ensureIdentity({ displayName: next.userName }));
    }
    setScreen('home');
  };

  const goHome = () => setScreen('home');

  const handleOpenSession = (session) => {
    setSelectedSession(session);
    setScreen('history-detail');
  };

  if (screen === 'loading' || !settings) {
    return (
      <View style={styles.loading}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#E53935" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      {screen === 'onboarding' && <OnboardingScreen onStart={handleStart} />}
      {(screen === 'settings' || screen === 'settings-first') && (
        <SettingsScreen
          initialSettings={settings}
          onSave={handleSaveSettings}
          onCancel={goHome}
          isFirstRun={screen === 'settings-first'}
        />
      )}
      {screen === 'home' && (
        <HomeScreen
          settings={settings}
          onOpenSettings={() => setScreen('settings')}
          onStartTracking={() => {
            setResumeFrom(null);
            setNightConfig(null);
            setScreen('tracking');
          }}
          onOpenHistory={() => setScreen('history')}
          onOpenWatch={() => setScreen('watch')}
          onOpenCheckIn={() => setScreen('checkin')}
          onOpenNight={() => setScreen('night')}
          onOpenMyPage={() => setScreen('mypage')}
          checkInRemaining={checkInRemaining}
          interrupted={interrupted}
          onResume={handleResume}
          onDiscard={handleDiscard}
        />
      )}
      {screen === 'night' && (
        <NightStartScreen
          onBack={goHome}
          onStart={(config) => {
            setResumeFrom(null);
            setNightConfig(config);
            setScreen('tracking');
          }}
        />
      )}
      {screen === 'tracking' && (
        <TrackingScreen
          settings={settings}
          identity={identity}
          resume={resumeFrom}
          night={nightConfig}
          onStop={() => {
            setResumeFrom(null);
            setNightConfig(null);
            goHome();
          }}
        />
      )}
      {screen === 'history' && (
        <HistoryScreen onBack={goHome} onOpenSession={handleOpenSession} />
      )}
      {screen === 'history-detail' && selectedSession && (
        <HistoryDetailScreen
          session={selectedSession}
          onBack={() => setScreen('history')}
          onDeleted={() => setScreen('history')}
        />
      )}
      {screen === 'watch' && (
        <WatchScreen
          identity={identity}
          initialCode={watchPeer?.active_code}
          onBack={() => {
            setWatchPeer(null);
            goHome();
          }}
        />
      )}
      {screen === 'mypage' && (
        <MyPageScreen
          identity={identity}
          settings={settings}
          onBack={goHome}
          onOpenSettings={() => setScreen('settings')}
          onOpenLink={() => setScreen('link')}
          onOpenWatchdog={() => setScreen('watchdog')}
          onWatchPeer={(peer) => {
            setWatchPeer(peer);
            setScreen('watch');
          }}
          onIdentityChanged={setIdentity}
        />
      )}
      {screen === 'watchdog' && (
        <WatchdogScreen identity={identity} onBack={() => setScreen('mypage')} />
      )}
      {screen === 'link' && (
        <LinkScreen
          identity={identity}
          onBack={() => setScreen('mypage')}
          onLinked={() => setScreen('mypage')}
        />
      )}
      {screen === 'checkin' && (
        <CheckInScreen
          settings={settings}
          onBack={async () => {
            // 체크인 화면에서 시작/해제한 결과를 홈 표시에 반영한다.
            setCheckIn(await loadCheckIn());
            goHome();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loading: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
