import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { TouchableOpacity } from "react-native-gesture-handler";
import { COLORS } from "../constants/theme";
import {
    type DailyReportTask,
    fetchDailyReportTasks,
} from "../services/alfredApi";

export function ChecklistPanel() {
  const [tasks, setTasks] = useState<DailyReportTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDailyReportTasks()
      .then((fetched) => setTasks(fetched))
      .catch((err) => {
        console.error("[ChecklistPanel] fetch error:", err);
        setError(err.message || "Failed to load tasks");
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleItem = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    );
  };

  return (
    <View style={styles.container}>
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
      ) : error ? (
        <View style={styles.loadingArea}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : tasks.length === 0 ? (
        <View style={styles.loadingArea}>
          <Text style={styles.emptyText}>No daily reports yet.</Text>
        </View>
      ) : (
        <View style={styles.listContent}>
          {tasks.map((task) => (
            <TouchableOpacity
              key={task.id}
              activeOpacity={0.7}
              style={[
                styles.itemRow,
                task.completed && styles.itemRowCompleted,
              ]}
              onPress={() => toggleItem(task.id)}
            >
              <View
                style={[
                  styles.checkbox,
                  task.completed && styles.checkboxChecked,
                ]}
              >
                {task.completed && (
                  <Ionicons name="checkmark" size={16} color={COLORS.bgBase} />
                )}
              </View>
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
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
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
  listContent: {
    paddingHorizontal: 24,
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
