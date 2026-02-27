import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { COLORS } from "../constants/theme";

interface SelectedImage {
  uri: string;
  base64: string;
}

interface ImagePickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (imagesBase64: string[]) => void;
}

export function ImagePickerSheet({
  visible,
  onClose,
  onSubmit,
}: ImagePickerSheetProps) {
  const [selected, setSelected] = useState<SelectedImage[]>([]);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setSelected([]);
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const pickFromGallery = async () => {
    console.log("[ImagePicker] Requesting media library permission…");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    console.log("[ImagePicker] Permission result:", permission.status);
    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        "Please allow access to your photo library.",
      );
      return;
    }

    console.log("[ImagePicker] Launching image library…");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.7,
      base64: true,
    });
    console.log(
      "[ImagePicker] Library result — canceled:",
      result.canceled,
      "assets:",
      result.assets?.length ?? 0,
    );

    if (!result.canceled && result.assets.length > 0) {
      const imgs = result.assets
        .filter((a) => !!a.base64)
        .map((a) => ({ uri: a.uri, base64: a.base64! }));
      console.log(
        `[ImagePicker] Got ${imgs.length} images with base64, sizes: [${imgs.map((i) => i.base64.length).join(", ")}]`,
      );
      setSelected((prev) => [...prev, ...imgs]);
    }
  };

  const takePhoto = async () => {
    console.log("[ImagePicker] Requesting camera permission…");
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    console.log("[ImagePicker] Camera permission:", permission.status);
    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow camera access.");
      return;
    }

    console.log("[ImagePicker] Launching camera…");
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      base64: true,
    });
    console.log(
      "[ImagePicker] Camera result — canceled:",
      result.canceled,
      "assets:",
      result.assets?.length ?? 0,
    );

    if (
      !result.canceled &&
      result.assets.length > 0 &&
      result.assets[0].base64
    ) {
      const a = result.assets[0];
      console.log("[ImagePicker] Photo base64 length:", a.base64!.length);
      setSelected((prev) => [...prev, { uri: a.uri, base64: a.base64! }]);
    }
  };

  const removeImage = (index: number) => {
    setSelected((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (selected.length === 0) return;
    setLoading(true);
    console.log(
      `[ImagePicker] Submit: ${selected.length} image(s), base64 sizes: [${selected.map((i) => i.base64.length).join(", ")}]`,
    );

    const base64List = selected.map((i) => i.base64);
    onSubmit(base64List);
    reset();
    onClose();
  };

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

          <Text style={styles.title}>Upload Images</Text>
          <Text style={styles.subtitle}>
            Select from gallery or take a photo
          </Text>

          {/* Action buttons */}
          <View style={styles.pickRow}>
            <Pressable style={styles.pickBtn} onPress={pickFromGallery}>
              <Text style={styles.pickBtnText}>Gallery</Text>
            </Pressable>
            <Pressable style={styles.pickBtn} onPress={takePhoto}>
              <Text style={styles.pickBtnText}>Camera</Text>
            </Pressable>
          </View>

          {/* Preview */}
          {selected.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.previewScroll}
              contentContainerStyle={styles.previewContent}
            >
              {selected.map((img, i) => (
                <View key={`${img.uri}-${i}`} style={styles.previewCard}>
                  <Image source={{ uri: img.uri }} style={styles.previewImg} />
                  <Pressable
                    style={styles.removeBtn}
                    onPress={() => removeImage(i)}
                  >
                    <Text style={styles.removeBtnText}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}

          {selected.length > 0 && (
            <Text style={styles.countText}>
              {selected.length} image{selected.length !== 1 ? "s" : ""} selected
            </Text>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={handleClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[
                styles.sendBtn,
                (selected.length === 0 || loading) && styles.sendBtnDisabled,
              ]}
              onPress={handleSubmit}
              disabled={selected.length === 0 || loading}
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
  previewScroll: {
    maxHeight: 120,
    marginBottom: 8,
  },
  previewContent: {
    gap: 10,
  },
  previewCard: {
    width: 100,
    height: 100,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  previewImg: {
    width: 100,
    height: 100,
    borderRadius: 12,
  },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  countText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.textSecondary,
    marginBottom: 12,
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
