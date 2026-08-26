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

export default function App() {
  const [screen, setScreen] = useState('loading');
  const [settings, setSettings] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  // 앱이 강제 종료되어 끝맺지 못한 추적. 있으면 홈에 복구 배너가 뜬다.
  const [interrupted, setInterrupted] = useState(null);
  const [resumeFrom, setResumeFrom] = useState(null);

  useEffect(() => {
    (async () => {
      const loaded = await loadSettings();
      setSettings(loaded);
      if (loaded.onboarded) {
        setInterrupted(await loadActive());
      }
      setScreen(loaded.onboarded ? 'home' : 'onboarding');
    })();
  }, []);

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
            setScreen('tracking');
          }}
          onOpenHistory={() => setScreen('history')}
          onOpenWatch={() => setScreen('watch')}
          interrupted={interrupted}
          onResume={handleResume}
          onDiscard={handleDiscard}
        />
      )}
      {screen === 'tracking' && (
        <TrackingScreen
          settings={settings}
          resume={resumeFrom}
          onStop={() => {
            setResumeFrom(null);
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
      {screen === 'watch' && <WatchScreen onBack={goHome} />}
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
