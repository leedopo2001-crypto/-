import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { formatPhoneDisplay, normalizePhone } from '../storage';

export default function SettingsScreen({
  initialSettings,
  onSave,
  onCancel,
  isFirstRun,
}) {
  const [userName, setUserName] = useState(initialSettings.userName || '');
  const [contacts, setContacts] = useState(initialSettings.contacts || []);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const addContact = () => {
    const name = newName.trim();
    const phone = normalizePhone(newPhone);
    if (!name) {
      Alert.alert('입력 오류', '이름을 입력해주세요.');
      return;
    }
    if (!phone || phone.replace(/\D/g, '').length < 9) {
      Alert.alert('입력 오류', '올바른 전화번호를 입력해주세요.');
      return;
    }
    if (contacts.some((c) => c.phone === phone)) {
      Alert.alert('중복', '이미 추가된 번호입니다.');
      return;
    }
    setContacts([
      ...contacts,
      { id: String(Date.now()), name, phone },
    ]);
    setNewName('');
    setNewPhone('');
  };

  const removeContact = (id) => {
    const target = contacts.find((c) => c.id === id);
    Alert.alert(
      '연락처 삭제',
      `"${target?.name}" 을(를) 삭제할까요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => setContacts(contacts.filter((c) => c.id !== id)),
        },
      ],
    );
  };

  const handleSave = () => {
    if (contacts.length === 0) {
      Alert.alert('연락처 필요', '긴급 연락처를 최소 1명 추가해주세요.');
      return;
    }
    onSave({
      userName: userName.trim(),
      contacts,
      onboarded: true,
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        {!isFirstRun && (
          <Pressable onPress={onCancel} hitSlop={12}>
            <Text style={styles.headerBack}>‹ 취소</Text>
          </Pressable>
        )}
        <Text style={styles.headerTitle}>
          {isFirstRun ? '초기 설정' : '설정'}
        </Text>
        <Pressable onPress={handleSave} hitSlop={12}>
          <Text style={styles.headerSave}>저장</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionLabel}>내 이름 (선택)</Text>
        <TextInput
          style={styles.input}
          value={userName}
          onChangeText={setUserName}
          placeholder="예: 홍길동"
          placeholderTextColor="#aaa"
          maxLength={20}
        />
        <Text style={styles.hint}>
          메시지에 "[홍길동] 긴급상황!" 처럼 표시됩니다.
        </Text>

        <View style={styles.separator} />

        <Text style={styles.sectionLabel}>
          긴급 연락처 ({contacts.length}명)
        </Text>

        {contacts.length === 0 ? (
          <Text style={styles.emptyText}>
            긴급 시 문자를 받을 연락처를 추가해주세요.
          </Text>
        ) : (
          contacts.map((c) => (
            <View key={c.id} style={styles.contactRow}>
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>{c.name}</Text>
                <Text style={styles.contactPhone}>
                  {formatPhoneDisplay(c.phone)}
                </Text>
              </View>
              <Pressable
                onPress={() => removeContact(c.id)}
                style={styles.removeButton}
                hitSlop={8}
              >
                <Text style={styles.removeButtonText}>삭제</Text>
              </Pressable>
            </View>
          ))
        )}

        <View style={styles.addBox}>
          <Text style={styles.addTitle}>연락처 추가</Text>
          <TextInput
            style={styles.input}
            value={newName}
            onChangeText={setNewName}
            placeholder="이름"
            placeholderTextColor="#aaa"
            maxLength={20}
          />
          <TextInput
            style={styles.input}
            value={newPhone}
            onChangeText={setNewPhone}
            placeholder="전화번호 (예: 010-1234-5678)"
            placeholderTextColor="#aaa"
            keyboardType="phone-pad"
            maxLength={20}
          />
          <Pressable style={styles.addButton} onPress={addContact}>
            <Text style={styles.addButtonText}>+ 추가</Text>
          </Pressable>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 12,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  headerBack: {
    fontSize: 17,
    color: '#E53935',
    minWidth: 60,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#222',
  },
  headerSave: {
    fontSize: 17,
    fontWeight: '600',
    color: '#E53935',
    minWidth: 60,
    textAlign: 'right',
  },
  scrollContent: {
    padding: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#222',
    backgroundColor: '#fafafa',
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  separator: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 24,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    paddingVertical: 12,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#fafafa',
    borderRadius: 10,
    marginBottom: 8,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
  },
  contactPhone: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  removeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#fee',
  },
  removeButtonText: {
    color: '#E53935',
    fontSize: 14,
    fontWeight: '600',
  },
  addBox: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
  },
  addTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#444',
    marginBottom: 10,
  },
  addButton: {
    backgroundColor: '#E53935',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
