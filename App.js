import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { loadSettings, saveSettings } from './src/storage';
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

  useEffect(() => {
    (async () => {
      const loaded = await loadSettings();
      setSettings(loaded);
      setScreen(loaded.onboarded ? 'home' : 'onboarding');
    })();
  }, []);

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
          onStartTracking={() => setScreen('tracking')}
          onOpenHistory={() => setScreen('history')}
          onOpenWatch={() => setScreen('watch')}
        />
      )}
      {screen === 'tracking' && (
        <TrackingScreen settings={settings} onStop={goHome} />
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
