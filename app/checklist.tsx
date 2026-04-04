import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { FlatList } from "react-native-gesture-handler";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    Easing,
    interpolate,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import { COLORS } from "../constants/theme";
import {
    type DailyReportTask,
    fetchDailyReportTasks,
} from "../services/alfredApi";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SWIPE_DOWN_THRESHOLD = 80;

export default function Checklist() {
  const router = useRouter();
  const [tasks, setTasks] = useState<DailyReportTask[]>([]);
  const [loading, setLoading] = useState(true);

  const goBack = () => router.back();

  // Single shared value drives the entire screen position
  // Starts off-screen (bottom) and springs into view on mount
  const screenY = useSharedValue(SCREEN_HEIGHT);

  useEffect(() => {
    screenY.value = withSpring(0, { damping: 24, stiffness: 200 });

    fetchDailyReportTasks()
      .then((fetched) => setTasks(fetched))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, []);

  const swipeDownGesture = Gesture.Pan()
    .activeOffsetY(15)
    .onUpdate((event) => {
      screenY.value = Math.max(event.translationY, 0);
    })
    .onEnd((event) => {
      if (
        event.translationY > SWIPE_DOWN_THRESHOLD &&
        Math.abs(event.translationX) < 60
      ) {
        screenY.value = withTiming(
          SCREEN_HEIGHT,
          { duration: 350, easing: Easing.in(Easing.cubic) },
          (finished) => {
            if (finished) runOnJS(goBack)();
          },
        );
      } else {
        screenY.value = withSpring(0, { damping: 25, stiffness: 300 });
      }
    });

  const screenAnimStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      screenY.value,
      [0, SCREEN_HEIGHT],
      [0, 1],
      "clamp",
    );
    return {
      transform: [
        { translateY: screenY.value },
        { scale: 1 - progress * 0.08 },
      ],
      borderTopLeftRadius: progress * 28,
      borderTopRightRadius: progress * 28,
      opacity: 1 - progress * 0.4,
    };
  });

  const toggleItem = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    );
  };

  const renderItem = ({ item }: { item: DailyReportTask }) => (
    <Pressable
      style={[styles.itemRow, item.completed && styles.itemRowCompleted]}
      onPress={() => toggleItem(item.id)}
    >
      <View style={[styles.checkbox, item.completed && styles.checkboxChecked]}>
        {item.completed && (
          <Ionicons name="checkmark" size={16} color={COLORS.bgBase} />
        )}
      </View>
      <View style={styles.itemContent}>
        <Text
          style={[styles.itemText, item.completed && styles.itemTextCompleted]}
        >
          {item.topic}
        </Text>
        {item.report ? (
          <Text style={styles.reportPreview} numberOfLines={2}>
            {item.report}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          {item.date ? <Text style={styles.metaText}>{item.date}</Text> : null}
          {(item.memoryChunks > 0 || item.kbChunks > 0) && (
            <Text style={styles.metaText}>
              {item.memoryChunks > 0 ? `${item.memoryChunks} memory` : ""}
              {item.memoryChunks > 0 && item.kbChunks > 0 ? " · " : ""}
              {item.kbChunks > 0 ? `${item.kbChunks} KB` : ""}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );

  return (
    <GestureDetector gesture={swipeDownGesture}>
      <Animated.View style={[styles.container, screenAnimStyle]}>
        <StatusBar barStyle="light-content" />

        <View style={styles.dragHandleArea}>
          <View style={styles.dragHandle} />
        </View>

        <View style={styles.header}>
          <Text style={styles.headerTitle}>Daily Tasks</Text>
        </View>

        {loading ? (
          <View style={styles.loadingArea}>
            <ActivityIndicator color={COLORS.accent} size="large" />
          </View>
        ) : tasks.length === 0 ? (
          <View style={styles.loadingArea}>
            <Text style={styles.emptyText}>No daily reports yet.</Text>
          </View>
        ) : (
          <FlatList
            data={tasks}
            renderItem={renderItem}
            keyExtractor={(t) => t.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          />
        )}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgBase,
    paddingTop: 50,
    overflow: "hidden",
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
    marginBottom: 32,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "PlusJakartaSans-ExtraBold",
    color: COLORS.textPrimary,
  },
  loadingArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.textSecondary,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    padding: 20,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  itemRowCompleted: {
    opacity: 0.6,
    backgroundColor: "rgba(255, 255, 255, 0.01)",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.accent,
    marginRight: 16,
    marginTop: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  itemContent: {
    flex: 1,
  },
  itemText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans-Medium",
    color: COLORS.textPrimary,
  },
  itemTextCompleted: {
    textDecorationLine: "line-through",
    color: COLORS.textSecondary,
  },
  reportPreview: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.textSecondary,
    marginTop: 6,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: "row",
    marginTop: 8,
    gap: 12,
  },
  metaText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.accent,
    opacity: 0.8,
  },
});
