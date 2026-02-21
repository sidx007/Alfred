import * as Haptics from "expo-haptics";
import React, { useCallback, useState } from "react";
import { Dimensions, StatusBar, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { CardItem } from "../components/CardItem";
import { ChecklistPanel } from "../components/ChecklistPanel";
import { FlashcardsPanel } from "../components/FlashcardsPanel";
import { SwipeDownArrow } from "../components/SwipeDownArrow";
import { SwipeUpArrow } from "../components/SwipeUpArrow";
import { items } from "../constants/items";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  SNAP_THRESHOLD,
  SPACING,
  SPRING_CONFIG,
} from "../constants/layout";
import { COLORS } from "../constants/theme";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SWIPE_THRESHOLD = 60;
const PAGE_SPRING = { damping: 22, stiffness: 180, mass: 1 };

// Page positions: 0 = flashcards, -SH = home (default), -2*SH = checklist
const PAGE_PROFILE = 0;
const PAGE_HOME = -SCREEN_HEIGHT;
const PAGE_CHECKLIST = -SCREEN_HEIGHT * 2;

const lightHaptic = () =>
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
const mediumHaptic = () =>
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

export default function Index() {
  // ── Vertical page position — starts on home ──
  const pageOffset = useSharedValue(PAGE_HOME);

  // ── Card carousel ──
  const currentIndex = useSharedValue(0);
  const dragX = useSharedValue(0);

  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const onContainerLayout = useCallback((e: any) => {
    const { width, height } = e.nativeEvent.layout;
    setLayout({ width, height });
  }, []);

  const centerX = (layout.width - CARD_WIDTH) / 2;
  const centerY = (layout.height - CARD_HEIGHT) / 2;

  // ── Profile gesture: swipe up → home ──
  const profilePan = Gesture.Pan()
    .activeOffsetY([-9999, -15])
    .activeOffsetX([-15, 15])
    .onUpdate((e) => {
      if (e.translationY < 0) {
        pageOffset.value = PAGE_PROFILE + e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY < -SWIPE_THRESHOLD && Math.abs(e.translationX) < 60) {
        pageOffset.value = withSpring(PAGE_HOME, PAGE_SPRING);
        runOnJS(mediumHaptic)();
      } else {
        pageOffset.value = withSpring(PAGE_PROFILE, PAGE_SPRING);
      }
    });

  // ── Home gesture: horizontal cards + vertical page swipe ──
  const homePan = Gesture.Pan()
    .onUpdate((e) => {
      dragX.value = e.translationX;
      // Vertical: up toward checklist, down toward profile
      if (e.translationY < 0) {
        pageOffset.value = PAGE_HOME + e.translationY;
      } else if (e.translationY > 0) {
        pageOffset.value = PAGE_HOME + e.translationY;
      }
    })
    .onEnd((e) => {
      // Swipe up → checklist
      if (e.translationY < -SWIPE_THRESHOLD) {
        pageOffset.value = withSpring(PAGE_CHECKLIST, PAGE_SPRING);
        dragX.value = 0;
        currentIndex.value = withSpring(
          Math.round(currentIndex.value),
          SPRING_CONFIG,
        );
        runOnJS(mediumHaptic)();
        return;
      }

      // Swipe down → profile
      if (e.translationY > SWIPE_THRESHOLD) {
        pageOffset.value = withSpring(PAGE_PROFILE, PAGE_SPRING);
        dragX.value = 0;
        currentIndex.value = withSpring(
          Math.round(currentIndex.value),
          SPRING_CONFIG,
        );
        runOnJS(mediumHaptic)();
        return;
      }

      // Stay on home
      pageOffset.value = withSpring(PAGE_HOME, PAGE_SPRING);

      // Handle horizontal card snap
      const direction =
        e.translationX < -SNAP_THRESHOLD
          ? 1
          : e.translationX > SNAP_THRESHOLD
            ? -1
            : 0;
      const dragInIndexUnits = (dragX.value * 0.6) / SPACING;
      const adjustedIndex = currentIndex.value - dragInIndexUnits;
      const target = Math.round(currentIndex.value) + direction;

      dragX.value = 0;
      currentIndex.value = adjustedIndex;
      currentIndex.value = withSpring(target, SPRING_CONFIG);
      if (direction !== 0) runOnJS(lightHaptic)();
    });

  // ── Checklist gesture: swipe down → home ──
  const checklistPan = Gesture.Pan()
    .activeOffsetY([15, 9999])
    .activeOffsetX([-15, 15])
    .onUpdate((e) => {
      if (e.translationY > 0) {
        pageOffset.value = PAGE_CHECKLIST + e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > SWIPE_THRESHOLD && Math.abs(e.translationX) < 60) {
        pageOffset.value = withSpring(PAGE_HOME, PAGE_SPRING);
        runOnJS(mediumHaptic)();
      } else {
        pageOffset.value = withSpring(PAGE_CHECKLIST, PAGE_SPRING);
      }
    });

  // ── Animated styles ──
  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pageOffset.value }],
  }));

  const homeAnimStyle = useAnimatedStyle(() => {
    // Fade slightly when moving away from home
    const distFromHome = Math.abs(pageOffset.value - PAGE_HOME);
    const progress = interpolate(
      distFromHome,
      [0, SCREEN_HEIGHT],
      [0, 1],
      "clamp",
    );
    return {
      opacity: 1 - progress * 0.3,
    };
  });

  return (
    <View style={styles.outer}>
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      />

      <Animated.View style={[styles.pagesContainer, containerStyle]}>
        {/* ── Profile (top) ── */}
        <GestureDetector gesture={profilePan}>
          <Animated.View style={styles.page}>
            <FlashcardsPanel />
          </Animated.View>
        </GestureDetector>

        {/* ── Home (middle) ── */}
        <GestureDetector gesture={homePan}>
          <Animated.View
            style={[styles.page, homeAnimStyle]}
            onLayout={onContainerLayout}
          >
            <View style={styles.touchArea}>
              {layout.height > 0 &&
                items.map((item, index) => (
                  <CardItem
                    key={item.label}
                    item={item}
                    index={index}
                    currentIndex={currentIndex}
                    dragX={dragX}
                    pageOffset={pageOffset}
                    centerX={centerX}
                    centerY={centerY}
                  />
                ))}
            </View>

            <View style={styles.topContent} pointerEvents="none">
              <SwipeDownArrow />
              <View style={styles.titleBlock}>
                <Text style={styles.title}>Alfred</Text>
                <Text style={styles.subtitle}>Capture your daily insights</Text>
              </View>
            </View>

            <View style={styles.bottomContent} pointerEvents="none">
              <SwipeUpArrow />
            </View>
          </Animated.View>
        </GestureDetector>

        {/* ── Checklist (bottom) ── */}
        <GestureDetector gesture={checklistPan}>
          <Animated.View style={styles.page}>
            <ChecklistPanel />
          </Animated.View>
        </GestureDetector>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: COLORS.bgBase,
    overflow: "hidden",
  },
  pagesContainer: {
    height: SCREEN_HEIGHT * 3,
  },
  page: {
    height: SCREEN_HEIGHT,
    backgroundColor: COLORS.bgBase,
  },
  touchArea: {
    flex: 1,
  },
  topContent: {
    position: "absolute",
    top: 56,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  titleBlock: {
    alignItems: "center",
    marginTop: 8,
  },
  title: {
    fontSize: 48,
    fontFamily: "PlusJakartaSans-ExtraBold",
    color: COLORS.accent,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
  },
  bottomContent: {
    position: "absolute",
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: "center",
  },
});
