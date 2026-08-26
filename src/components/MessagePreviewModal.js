import React, { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { formatPhoneDisplay } from '../storage';
import { openSmsLink } from '../sms';

/**
 * 웹에서는 expo-sms 로 문자 앱을 열 수 없다. 대신 실제로 나갈 문구와
 * 수신자를 그대로 보여주고, 복사하거나 sms: 링크를 시도할 수 있게 한다.
 */
export default function MessagePreviewModal({
  visible,
  message,
  contacts,
  onClose,
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenSms = () => {
    openSmsLink(contacts.map((c) => c.phone), message);
  };

  const handleClose = () => {
    setCopied(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>웹에서는 문자를 직접 보낼 수 없습니다</Text>
          <Text style={styles.subtitle}>
            아래 내용을 복사해서 보내거나, 휴대폰에서 앱을 실행해주세요.
          </Text>

          <Text style={styles.sectionLabel}>받는 사람</Text>
          <View style={styles.recipients}>
            {contacts.map((c) => (
              <View key={c.id || c.phone} style={styles.chip}>
                <Text style={styles.chipText}>
                  {c.name} · {formatPhoneDisplay(c.phone)}
                </Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionLabel}>메시지</Text>
          <ScrollView style={styles.messageBox}>
            <Text selectable style={styles.messageText}>
              {message}
            </Text>
          </ScrollView>

          <Pressable style={styles.primaryButton} onPress={handleCopy}>
            <Text style={styles.primaryButtonText}>
              {copied ? '복사되었습니다' : '메시지 복사'}
            </Text>
          </Pressable>

          {Platform.OS === 'web' && (
            <Pressable style={styles.secondaryButton} onPress={handleOpenSms}>
              <Text style={styles.secondaryButtonText}>
                기본 문자 앱으로 열어보기
              </Text>
            </Pressable>
          )}

          <Pressable style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeButtonText}>닫기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 24,
    width: '100%',
    maxWidth: 460,
  },
  title: { fontSize: 18, fontWeight: 'bold', color: '#222', marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#777', marginBottom: 20, lineHeight: 19 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  recipients: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 18 },
  chip: {
    backgroundColor: '#F1F1F1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipText: { fontSize: 13, color: '#444' },
  messageBox: {
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 14,
    maxHeight: 140,
    marginBottom: 20,
  },
  messageText: { fontSize: 15, color: '#222', lineHeight: 22 },
  primaryButton: {
    backgroundColor: '#E53935',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  secondaryButton: {
    backgroundColor: '#F5F5F5',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryButtonText: { color: '#555', fontSize: 14, fontWeight: '600' },
  closeButton: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  closeButtonText: { color: '#999', fontSize: 14 },
});
