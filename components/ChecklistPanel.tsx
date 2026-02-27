import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { TouchableOpacity } from "react-native-gesture-handler";
import { COLORS } from "../constants/theme";
import { type ChecklistItem, fetchChecklist } from "../services/alfredApi";

const FALLBACK_CHECKLIST: ChecklistItem[] = [
  { id: "1", task: "Read a technical article", completed: false },
  { id: "2", task: "Watch a coding tutorial", completed: true },
  { id: "3", task: "Practice a new framework", completed: false },
  { id: "4", task: "Contribute to open source", completed: false },
  { id: "5", task: "Solve a LeetCode problem", completed: true },
  { id: "6", task: "Review a PR", completed: false },
  { id: "7", task: "Write a blog post", completed: false },
];

export function ChecklistPanel() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChecklist()
      .then((fetched) => {
        setItems(fetched.length > 0 ? fetched : FALLBACK_CHECKLIST);
      })
      .catch(() => setItems(FALLBACK_CHECKLIST))
      .finally(() => setLoading(false));
  }, []);

  const toggleItem = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item,
      ),
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.dragHandleArea}>
        <View style={styles.dragHandle} />
      </View>

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Daily Checklist</Text>
      </View>

      {loading ? (
        <View style={styles.loadingArea}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      ) : (
        <View style={styles.listContent}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.7}
              style={[styles.itemRow, item.completed && styles.itemRowCompleted]}
              onPress={() => toggleItem(item.id)}
            >
              <View
                style={[
                  styles.checkbox,
                  item.completed && styles.checkboxChecked,
                ]}
              >
                {item.completed && (
                  <Ionicons name="checkmark" size={16} color={COLORS.bgBase} />
                )}
              </View>
              <Text
                style={[
                  styles.itemText,
                  item.completed && styles.itemTextCompleted,
                ]}
              >
                {item.task}
              </Text>
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
    alignItems: "center",
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
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  itemText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans-Medium",
    color: COLORS.textPrimary,
    flex: 1,
  },
  itemTextCompleted: {
    textDecorationLine: "line-through",
    color: COLORS.textSecondary,
  },
});
