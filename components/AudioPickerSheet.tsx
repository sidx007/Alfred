import { Audio } from "expo-av";
import * as DocumentPicker from "expo-document-picker";
import { EncodingType, readAsStringAsync } from "expo-file-system/legacy";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { COLORS } from "../constants/theme";

interface AudioPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (audioBase64: string, contentType: string) => void;
}

export function AudioPickerSheet({
  visible,
  onClose,
  onSubmit,
}: AudioPickerSheetProps) {
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    name: string;
    mimeType: string;
  } | null>(null);

  const reset = () => {
    setLoading(false);
    setRecording(null);
    setIsRecording(false);
    setRecordedUri(null);
    setSelectedFile(null);
  };

  const handleClose = () => {
    if (recording) {
      recording.stopAndUnloadAsync().catch(() => {});
    }
    reset();
    onClose();
  };

  // ── Pick audio file ─────────────────────────────────────────────
  const pickAudioFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        setSelectedFile({
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType ?? "audio/m4a",
        });
        setRecordedUri(null);
      }
    } catch {
      Alert.alert("Error", "Failed to pick audio file.");
    }
  };

  // ── Record audio ────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission needed", "Please allow microphone access.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      setRecording(newRecording);
      setIsRecording(true);
      setSelectedFile(null);
    } catch {
      Alert.alert("Error", "Failed to start recording.");
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecordedUri(uri);
      setIsRecording(false);
      setRecording(null);
    } catch {
      Alert.alert("Error", "Failed to stop recording.");
      setIsRecording(false);
      setRecording(null);
    }
  };

  // ── Submit ──────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const uri = selectedFile?.uri ?? recordedUri;
    if (!uri) return;

    setLoading(true);
    try {
      const b64 = await readAsStringAsync(uri, {
        encoding: EncodingType.Base64,
      });

      const contentType = selectedFile?.mimeType ?? "audio/m4a";
      onSubmit(b64, contentType);
      reset();
      onClose();
    } catch {
      Alert.alert("Error", "Failed to read audio file.");
      setLoading(false);
    }
  };

  const hasFile = !!(selectedFile || recordedUri);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          <Text style={styles.title}>Upload Audio</Text>
          <Text style={styles.subtitle}>Record or select an audio file</Text>

          {/* Action buttons */}
          <View style={styles.pickRow}>
            <Pressable style={styles.pickBtn} onPress={pickAudioFile}>
              <Text style={styles.pickBtnText}>Pick File</Text>
            </Pressable>
            <Pressable
              style={[styles.pickBtn, isRecording && styles.recordingBtn]}
              onPress={isRecording ? stopRecording : startRecording}
            >
              <Text
                style={[
                  styles.pickBtnText,
                  isRecording && styles.recordingBtnText,
                ]}
              >
                {isRecording ? "■  Stop" : "●  Record"}
              </Text>
            </Pressable>
          </View>

          {/* Status */}
          {isRecording && (
            <View style={styles.statusRow}>
              <View style={styles.recordingDot} />
              <Text style={styles.statusText}>Recording…</Text>
            </View>
          )}

          {selectedFile && (
            <View style={styles.fileCard}>
              <Text style={styles.fileName} numberOfLines={1}>
                {selectedFile.name}
              </Text>
              <Text style={styles.fileMeta}>{selectedFile.mimeType}</Text>
            </View>
          )}

          {recordedUri && !selectedFile && (
            <View style={styles.fileCard}>
              <Text style={styles.fileName}>Recorded audio</Text>
              <Text style={styles.fileMeta}>Ready to upload</Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={handleClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[
                styles.sendBtn,
                (!hasFile || loading) && styles.sendBtnDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!hasFile || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.sendText}>Upload</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
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
  pickRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  pickBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    alignItems: "center",
  },
  pickBtnText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans-Medium",
    color: COLORS.textPrimary,
  },
  recordingBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderColor: "rgba(239, 68, 68, 0.4)",
  },
  recordingBtnText: {
    color: COLORS.accent,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accent,
  },
  statusText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans-Medium",
    color: COLORS.accent,
  },
  fileCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 16,
  },
  fileName: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans-Medium",
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  fileMeta: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.textSecondary,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 8,
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
    minWidth: 90,
    alignItems: "center",
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
