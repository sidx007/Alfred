import React, { useState } from "react";
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { COLORS } from "../constants/theme";

interface TextInputModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
}

export function TextInputModal({
  visible,
  onClose,
  onSubmit,
}: TextInputModalProps) {
  const [text, setText] = useState("");

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText("");
    onClose();
  };

  const handleClose = () => {
    setText("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          <Text style={styles.title}>Add Text</Text>
          <Text style={styles.subtitle}>Type or paste any text to process</Text>

          <TextInput
            style={styles.input}
            placeholder="Start typing…"
            placeholderTextColor={COLORS.textSecondary}
            multiline
            autoFocus
            value={text}
            onChangeText={setText}
            textAlignVertical="top"
          />

          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={handleClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
              onPress={handleSubmit}
              disabled={!text.trim()}
            >
              <Text style={styles.sendText}>Send</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  sheet: {
    backgroundColor: COLORS.surfaceSolid,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    maxHeight: "80%",
  },
  handleRow: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  title: {
    fontSize: 22,
    fontFamily: "PlusJakartaSans-Bold",
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
  input: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    color: COLORS.textPrimary,
    fontFamily: "PlusJakartaSans-Regular",
    fontSize: 15,
    padding: 16,
    minHeight: 160,
    maxHeight: 300,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 16,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  cancelText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans-Medium",
    color: COLORS.textSecondary,
  },
  sendBtn: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans-Bold",
    color: "#ffffff",
  },
});
