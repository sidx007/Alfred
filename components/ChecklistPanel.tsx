import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    StyleSheet,
    Text,
    View,
} from "react-native";
import {
    Gesture,
    GestureDetector,
    ScrollView,
    TouchableOpacity,
} from "react-native-gesture-handler";
import Animated, {
    type SharedValue,
    runOnJS,
    withSpring,
} from "react-native-reanimated";
import { COLORS } from "../constants/theme";
import {
    type DailyReportTask,
    fetchDailyReportTasks,
} from "../services/alfredApi";
import { ReportReaderModal } from "./ReportReaderModal";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SWIPE_THRESHOLD = 30;
const PAGE_SPRING = { damping: 22, stiffness: 180, mass: 1 };
const PAGE_HOME = -SCREEN_HEIGHT * 2;
const PAGE_CHECKLIST = -SCREEN_HEIGHT * 3;

/** In-memory cache so fetched tasks survive re-renders within the session. */
let _cachedTasks: DailyReportTask[] | null = null;

interface ChecklistPanelProps {
  pageOffset: SharedValue<number>;
}

export function ChecklistPanel({ pageOffset }: ChecklistPanelProps) {
  const [tasks, setTasks] = useState<DailyReportTask[]>(_cachedTasks ?? []);
  const [loading, setLoading] = useState(_cachedTasks === null);
  const [error, setError] = useState<string | null>(null);

  // Report reader state
  const [readerVisible, setReaderVisible] = useState(false);
  const [readerTopic, setReaderTopic] = useState("");
  const [readerReport, setReaderReport] = useState("");

  useEffect(() => {
    if (_cachedTasks !== null) return; // already cached
    fetchDailyReportTasks()
      .then((fetched) => {
        _cachedTasks = fetched;
        setTasks(fetched);
      })
      .catch((err) => {
        console.error("[ChecklistPanel] fetch error:", err);
        setError(err.message || "Failed to load tasks");
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleItem = (id: string) => {
    setTasks((prev) => {
      const next = prev.map((t) =>
        t.id === id ? { ...t, completed: !t.completed } : t,
      );
      _cachedTasks = next; // keep cache in sync
      return next;
    });
  };

  const openReport = (task: DailyReportTask) => {
    setReaderTopic(task.topic);
    setReaderReport(task.report);
    setReaderVisible(true);
  };

  const mediumHaptic = () =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

  // Swipe-down on the header → back to home page
  const headerPan = Gesture.Pan()
    .activeOffsetY(5)
    .failOffsetX([-50, 50])
    .onUpdate((e) => {
      if (e.translationY > 0) {
        pageOffset.value = PAGE_CHECKLIST + e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > SWIPE_THRESHOLD && Math.abs(e.translationX) < 100) {
        pageOffset.value = withSpring(PAGE_HOME, PAGE_SPRING);
        runOnJS(mediumHaptic)();
      } else {
        pageOffset.value = withSpring(PAGE_CHECKLIST, PAGE_SPRING);
      }
    });

  return (
    <View style={styles.container}>
      <GestureDetector gesture={headerPan}>
        <Animated.View>
          <View style={styles.dragHandleArea}>
            <View style={styles.dragHandle} />
          </View>

          <View style={styles.header}>
            <Text style={styles.headerTitle}>Daily Tasks</Text>
          </View>
        </Animated.View>
      </GestureDetector>

      {loading ? (
        <View style={styles.loadingArea}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      ) : error ? (
        <View style={styles.loadingArea}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : tasks.length === 0 ? (
        <View style={styles.loadingArea}>
          <Text style={styles.emptyText}>No daily reports yet.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {tasks.map((task) => (
            <View
              key={task.id}
              style={[
                styles.itemRow,
                task.completed && styles.itemRowCompleted,
              ]}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.checkboxArea}
                onPress={() => toggleItem(task.id)}
              >
                <View
                  style={[
                    styles.checkbox,
                    task.completed && styles.checkboxChecked,
                  ]}
                >
                  {task.completed && (
                    <Ionicons
                      name="checkmark"
                      size={16}
                      color={COLORS.bgBase}
                    />
                  )}
                </View>
              </TouchableOpacity>
              <View style={styles.itemContent}>
                <Text
                  style={[
                    styles.itemText,
                    task.completed && styles.itemTextCompleted,
                  ]}
                >
                  {task.topic}
                </Text>
                {task.report ? (
                  <Text style={styles.reportPreview} numberOfLines={2}>
                    {task.report}
                  </Text>
                ) : null}
                <View style={styles.metaRow}>
                  {task.date ? (
                    <Text style={styles.metaText}>{task.date}</Text>
                  ) : null}
                  {(task.memoryChunks > 0 || task.kbChunks > 0) && (
                    <Text style={styles.metaText}>
                      {task.memoryChunks > 0
                        ? `${task.memoryChunks} memory`
                        : ""}
                      {task.memoryChunks > 0 && task.kbChunks > 0 ? " · " : ""}
                      {task.kbChunks > 0 ? `${task.kbChunks} KB` : ""}
                    </Text>
                  )}
                </View>

                {/* Read button */}
                {task.report ? (
                  <TouchableOpacity
                    style={styles.readBtn}
                    onPress={() => openReport(task)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="book-outline"
                      size={14}
                      color={COLORS.accent}
                    />
                    <Text style={styles.readBtnText}>Read Report</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Report reader modal */}
      <ReportReaderModal
        visible={readerVisible}
        topic={readerTopic}
        report={readerReport}
        onClose={() => setReaderVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 50,
  },
  loadingArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  dragHandleArea: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 12,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
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
  scrollArea: {
    flex: 1,
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
  checkboxArea: {
    paddingRight: 16,
    paddingTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.accent,
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
  readBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: 10,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  readBtnText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans-Medium",
    color: COLORS.accent,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.textSecondary,
  },
  errorText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.accent,
    textAlign: "center",
    paddingHorizontal: 32,
  },
});
