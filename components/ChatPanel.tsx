import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useRef, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import {
    FlatList,
    Gesture,
    GestureDetector,
    TouchableOpacity,
} from "react-native-gesture-handler";
import Markdown from "react-native-markdown-display";
import Animated, {
    type SharedValue,
    runOnJS,
    withSpring,
} from "react-native-reanimated";
import { COLORS } from "../constants/theme";
import { type ChatResponse, sendChatMessage } from "../services/alfredApi";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SWIPE_THRESHOLD = 30;
const PAGE_SPRING = { damping: 22, stiffness: 180, mass: 1 };
const PAGE_CHAT = 0;
const PAGE_CUSTOM_REPORTS = -SCREEN_HEIGHT;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  topics?: string[];
}

const SUGGESTIONS = [
  "What topics have I learned about?",
  "Summarize my recent notes",
  "Explain the key concepts I've studied",
  "What do I know about business?",
];

let nextId = 1;

interface ChatPanelProps {
  pageOffset: SharedValue<number>;
}

export function ChatPanel({ pageOffset }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  const handleSend = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim();
      if (!msg || loading) return;

      const userMsg: Message = {
        id: String(nextId++),
        role: "user",
        content: msg,
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);
      scrollToEnd();

      try {
        const res: ChatResponse = await sendChatMessage(msg);
        const assistantMsg: Message = {
          id: String(nextId++),
          role: "assistant",
          content: res.answer,
          topics: res.topics,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err: unknown) {
        const errMsg =
          err instanceof Error ? err.message : "Something went wrong";
        const errorMsg: Message = {
          id: String(nextId++),
          role: "assistant",
          content: `Error: ${errMsg}`,
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setLoading(false);
        scrollToEnd();
      }
    },
    [input, loading, scrollToEnd],
  );

  const mediumHaptic = () =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

  // Swipe up on header → custom reports
  const headerPan = Gesture.Pan()
    .activeOffsetY(-5)
    .failOffsetX([-50, 50])
    .onUpdate((e) => {
      if (e.translationY < 0) {
        pageOffset.value = PAGE_CHAT + e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY < -SWIPE_THRESHOLD && Math.abs(e.translationX) < 100) {
        pageOffset.value = withSpring(PAGE_CUSTOM_REPORTS, PAGE_SPRING);
        runOnJS(mediumHaptic)();
      } else {
        pageOffset.value = withSpring(PAGE_CHAT, PAGE_SPRING);
      }
    });

  // Duplicate gesture for bottom handle (RNGH requires separate instances)
  const bottomPan = Gesture.Pan()
    .activeOffsetY(-5)
    .failOffsetX([-50, 50])
    .onUpdate((e) => {
      if (e.translationY < 0) {
        pageOffset.value = PAGE_CHAT + e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY < -SWIPE_THRESHOLD && Math.abs(e.translationX) < 100) {
        pageOffset.value = withSpring(PAGE_CUSTOM_REPORTS, PAGE_SPRING);
        runOnJS(mediumHaptic)();
      } else {
        pageOffset.value = withSpring(PAGE_CHAT, PAGE_SPRING);
      }
    });

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => (
      <View
        style={[
          styles.messageBubble,
          item.role === "user" ? styles.userBubble : styles.assistantBubble,
        ]}
      >
        <View style={styles.messageHeader}>
          <View
            style={[
              styles.avatar,
              item.role === "user" ? styles.userAvatar : styles.assistantAvatar,
            ]}
          >
            <Ionicons
              name={item.role === "user" ? "person" : "sparkles"}
              size={14}
              color={item.role === "user" ? COLORS.bgBase : COLORS.accent}
            />
          </View>
          <Text style={styles.roleLabel}>
            {item.role === "user" ? "You" : "Alfred"}
          </Text>
        </View>
        {item.role === "assistant" ? (
          <Markdown style={mdStyles}>{item.content}</Markdown>
        ) : (
          <Text style={styles.messageText}>{item.content}</Text>
        )}
        {item.topics && item.topics.length > 0 && (
          <View style={styles.topicRow}>
            {item.topics.map((t) => (
              <View key={t} style={styles.topicChip}>
                <Text style={styles.topicText}>{t}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    ),
    [],
  );

  const renderEmpty = useCallback(
    () => (
      <View style={styles.welcome}>
        <View style={styles.welcomeIcon}>
          <Ionicons name="sparkles" size={32} color={COLORS.accent} />
        </View>
        <Text style={styles.welcomeTitle}>Ask the Assistant</Text>
        <Text style={styles.welcomeSubtitle}>
          Chat with your knowledge base. Ask questions about anything you've
          learned.
        </Text>
        <View style={styles.suggestions}>
          {SUGGESTIONS.map((s) => (
            <TouchableOpacity
              key={s}
              style={styles.suggestionChip}
              onPress={() => handleSend(s)}
              activeOpacity={0.7}
            >
              <Text style={styles.suggestionText}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    ),
    [handleSend],
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Drag handle at top — swipe up to navigate */}
      <GestureDetector gesture={headerPan}>
        <Animated.View>
          <View style={styles.dragHandleArea}>
            <View style={styles.dragHandle} />
          </View>

          <View style={styles.header}>
            <Text style={styles.headerTitle}>Chat</Text>
          </View>
        </Animated.View>
      </GestureDetector>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.messageList,
          messages.length === 0 && styles.messageListEmpty,
        ]}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={scrollToEnd}
        nestedScrollEnabled
      />

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={COLORS.accent} size="small" />
          <Text style={styles.loadingText}>Alfred is thinking...</Text>
        </View>
      )}

      <View style={styles.inputArea}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Ask anything about your knowledge base..."
            placeholderTextColor={COLORS.textSecondary}
            multiline
            maxLength={2000}
            editable={!loading}
            onSubmitEditing={() => handleSend()}
            blurOnSubmit
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!input.trim() || loading) && styles.sendBtnDisabled,
            ]}
            onPress={() => handleSend()}
            disabled={!input.trim() || loading}
            activeOpacity={0.7}
          >
            <Ionicons
              name="send"
              size={18}
              color={
                !input.trim() || loading ? COLORS.textSecondary : COLORS.accent
              }
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom swipe handle — swipe up to go to Custom Reports */}
      <GestureDetector gesture={bottomPan}>
        <Animated.View style={styles.bottomSwipeArea}>
          <View style={styles.dragHandle} />
          <Text style={styles.swipeHint}>Swipe up for reports</Text>
        </Animated.View>
      </GestureDetector>
    </KeyboardAvoidingView>
  );
}

const mdStyles = StyleSheet.create({
  body: {
    color: COLORS.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: "PlusJakartaSans-Regular",
  },
  heading1: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontFamily: "PlusJakartaSans-ExtraBold",
    marginTop: 16,
    marginBottom: 6,
  },
  heading2: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontFamily: "PlusJakartaSans-Bold",
    marginTop: 12,
    marginBottom: 4,
  },
  heading3: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontFamily: "PlusJakartaSans-Bold",
    marginTop: 10,
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
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  fence: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginVertical: 6,
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
    paddingLeft: 10,
    paddingVertical: 4,
    marginVertical: 6,
  },
  link: {
    color: COLORS.accent,
    textDecorationLine: "underline",
  },
  paragraph: {
    marginVertical: 3,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 50,
  },
  dragHandleArea: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  header: {
    alignItems: "center",
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "PlusJakartaSans-ExtraBold",
    color: COLORS.textPrimary,
  },
  messageList: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  messageListEmpty: {
    flexGrow: 1,
    justifyContent: "center",
  },
  messageBubble: {
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
  },
  userBubble: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderColor: "rgba(239, 68, 68, 0.2)",
    marginLeft: 32,
  },
  assistantBubble: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderColor: "rgba(255, 255, 255, 0.05)",
    marginRight: 32,
  },
  messageHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  userAvatar: {
    backgroundColor: COLORS.accent,
  },
  assistantAvatar: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
  },
  roleLabel: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans-Bold",
    color: COLORS.textSecondary,
  },
  messageText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.textPrimary,
    lineHeight: 22,
  },
  topicRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 10,
    gap: 6,
  },
  topicChip: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  topicText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans-Medium",
    color: COLORS.accent,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.textSecondary,
  },
  inputArea: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.textPrimary,
    maxHeight: 100,
    paddingTop: 4,
    paddingBottom: 4,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  // Welcome / empty state
  welcome: {
    alignItems: "center",
    paddingHorizontal: 32,
  },
  welcomeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 22,
    fontFamily: "PlusJakartaSans-Bold",
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  suggestions: {
    width: "100%",
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  suggestionText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans-Medium",
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  bottomSwipeArea: {
    alignItems: "center",
    paddingVertical: 10,
    paddingBottom: 16,
  },
  swipeHint: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans-Regular",
    color: "rgba(255, 255, 255, 0.25)",
    marginTop: 6,
  },
});
