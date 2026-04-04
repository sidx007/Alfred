import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    Modal,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { COLORS } from "../constants/theme";

interface Props {
  visible: boolean;
  topic: string;
  report: string;
  onClose: () => void;
}

const mdStyles = StyleSheet.create({
  body: {
    color: COLORS.textPrimary,
    fontSize: 15,
    lineHeight: 24,
    fontFamily: "PlusJakartaSans-Regular",
  },
  heading1: {
    color: COLORS.textPrimary,
    fontSize: 24,
    fontFamily: "PlusJakartaSans-ExtraBold",
    marginTop: 20,
    marginBottom: 8,
  },
  heading2: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontFamily: "PlusJakartaSans-Bold",
    marginTop: 16,
    marginBottom: 6,
  },
  heading3: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontFamily: "PlusJakartaSans-Bold",
    marginTop: 14,
    marginBottom: 4,
  },
  strong: {
    color: COLORS.textPrimary,
    fontFamily: "PlusJakartaSans-Bold",
  },
  em: {
    color: COLORS.textSecondary,
    fontStyle: "italic",
  },
  bullet_list: {
    marginVertical: 4,
  },
  ordered_list: {
    marginVertical: 4,
  },
  list_item: {
    flexDirection: "row",
    marginVertical: 2,
  },
  bullet_list_icon: {
    color: COLORS.accent,
    fontSize: 15,
    marginRight: 8,
  },
  code_inline: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    color: COLORS.accent,
    fontFamily: "monospace",
    fontSize: 13,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fence: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
  },
  code_block: {
    color: COLORS.textPrimary,
    fontFamily: "monospace",
    fontSize: 13,
  },
  blockquote: {
    backgroundColor: "rgba(239, 68, 68, 0.06)",
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    paddingLeft: 12,
    paddingVertical: 6,
    marginVertical: 8,
  },
  hr: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    height: 1,
    marginVertical: 16,
  },
  link: {
    color: COLORS.accent,
    textDecorationLine: "underline",
  },
  paragraph: {
    marginVertical: 4,
  },
});

export function ReportReaderModal({ visible, topic, report, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />

        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
          </Pressable>
          <View style={styles.titleArea}>
            <Ionicons name="document-text" size={18} color={COLORS.accent} />
            <Text style={styles.title} numberOfLines={1}>
              {topic}
            </Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={COLORS.textSecondary} />
          </Pressable>
        </View>

        {/* Report body */}
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {report ? (
            <Markdown style={mdStyles}>{report}</Markdown>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons
                name="alert-circle-outline"
                size={40}
                color={COLORS.textSecondary}
              />
              <Text style={styles.emptyText}>
                No report content available for this task.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgBase,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleArea: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans-Bold",
    color: COLORS.textPrimary,
    flex: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.textSecondary,
    textAlign: "center",
  },
});
