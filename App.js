import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { loadSettings, saveSettings } from './src/storage';
import OnboardingScreen from './src/screens/OnboardingScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import HomeScreen from './src/screens/HomeScreen';

export default function App() {
  const [screen, setScreen] = useState('loading');
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    (async () => {
      const loaded = await loadSettings();
      setSettings(loaded);
      if (!loaded.onboarded) {
        setScreen('onboarding');
      } else {
        setScreen('home');
      }
    })();
  }, []);

  const handleStart = () => setScreen('settings-first');

  const handleSaveSettings = async (next) => {
    setSettings(next);
    await saveSettings(next);
    setScreen('home');
  };

  const handleCancelSettings = () => setScreen('home');

  const handleOpenSettings = () => setScreen('settings');

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
          onCancel={handleCancelSettings}
          isFirstRun={screen === 'settings-first'}
        />
      )}
      {screen === 'home' && (
        <HomeScreen
          settings={settings}
          onOpenSettings={handleOpenSettings}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loading: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
