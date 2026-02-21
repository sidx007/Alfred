import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    Dimensions,
    FlatList,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    View,
} from "react-native";
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

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SWIPE_DOWN_THRESHOLD = 80;

const CHECKLIST_ITEMS = [
  { id: "1", task: "Read a technical article", completed: false },
  { id: "2", task: "Watch a coding tutorial", completed: true },
  { id: "3", task: "Practice a new framework", completed: false },
  { id: "4", task: "Contribute to open source", completed: false },
  { id: "5", task: "Solve a LeetCode problem", completed: true },
  { id: "6", task: "Review a PR", completed: false },
  { id: "7", task: "Write a blog post", completed: false },
];

export default function Checklist() {
  const router = useRouter();
  const [items, setItems] = useState(CHECKLIST_ITEMS);

  const goBack = () => router.back();

  // Single shared value drives the entire screen position
  // Starts off-screen (bottom) and springs into view on mount
  const screenY = useSharedValue(SCREEN_HEIGHT);

  useEffect(() => {
    screenY.value = withSpring(0, { damping: 24, stiffness: 200 });
  }, []);

  const swipeDownGesture = Gesture.Pan()
    .activeOffsetY([15, 9999])
    .onUpdate((event) => {
      screenY.value = Math.max(event.translationY, 0);
    })
    .onEnd((event) => {
      if (
        event.translationY > SWIPE_DOWN_THRESHOLD &&
        Math.abs(event.translationX) < 60
      ) {
        // Animate off-screen, THEN navigate (so the user sees the full animation)
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

  // Card-stack style: as screen slides, it scales down, rounds corners, fades
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
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item,
      ),
    );
  };

  const renderItem = ({ item }: { item: (typeof CHECKLIST_ITEMS)[0] }) => (
    <Pressable
      style={[styles.itemRow, item.completed && styles.itemRowCompleted]}
      onPress={() => toggleItem(item.id)}
    >
      <View style={[styles.checkbox, item.completed && styles.checkboxChecked]}>
        {item.completed && (
          <Ionicons name="checkmark" size={16} color={COLORS.bgBase} />
        )}
      </View>
      <Text
        style={[styles.itemText, item.completed && styles.itemTextCompleted]}
      >
        {item.task}
      </Text>
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
          <Text style={styles.headerTitle}>Daily Checklist</Text>
        </View>

        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
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
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
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
