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

import { AudioPickerSheet } from "../components/AudioPickerSheet";
import { CardItem } from "../components/CardItem";
import { ChatPanel } from "../components/ChatPanel";
import { ChecklistPanel } from "../components/ChecklistPanel";
import { CustomReportPanel } from "../components/CustomReportPanel";
// FlashcardsPanel kept for future use — replaced by ChatPanel
// import { FlashcardsPanel } from "../components/FlashcardsPanel";
import { ImagePickerSheet } from "../components/ImagePickerSheet";
import { SwipeDownArrow } from "../components/SwipeDownArrow";
import { SwipeUpArrow } from "../components/SwipeUpArrow";
import { TextInputModal } from "../components/TextInputModal";
import { UploadDetailModal } from "../components/UploadDetailModal";
import { UploadStatusButton } from "../components/UploadStatusButton";
import { items } from "../constants/items";
import {
    CARD_HEIGHT,
    CARD_WIDTH,
    SNAP_THRESHOLD,
    SPACING,
    SPRING_CONFIG,
} from "../constants/layout";
import { COLORS } from "../constants/theme";
import { useUpload } from "../context/UploadContext";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SWIPE_THRESHOLD = 30;
const PAGE_SPRING = { damping: 22, stiffness: 180, mass: 1 };

// Page positions: 0 = chat, -SH = custom reports, -2*SH = home (default), -3*SH = checklist
const PAGE_CHAT = 0;
const PAGE_CUSTOM_REPORTS = -SCREEN_HEIGHT;
const PAGE_HOME = -SCREEN_HEIGHT * 2;
const PAGE_CHECKLIST = -SCREEN_HEIGHT * 3;

const lightHaptic = () =>
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
const mediumHaptic = () =>
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

export default function Index() {
  // ── Upload context ──
  const { uploadText, uploadAudio, uploadImages } = useUpload();

  // ── Modal state ──
  const [textModalVisible, setTextModalVisible] = useState(false);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [audioModalVisible, setAudioModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

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

  // ── Card tap handler ──
  const handleCardTap = useCallback(() => {
    const count = items.length;
    const snapped = ((Math.round(currentIndex.value) % count) + count) % count;
    const card = items[snapped];
    if (!card) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    switch (card.label) {
      case "Text":
        setTextModalVisible(true);
        break;
      case "Audio":
        setAudioModalVisible(true);
        break;
      case "Image":
        setImageModalVisible(true);
        break;
    }
  }, [currentIndex]);

  // ── Upload status press handler ──
  const handleUploadPress = useCallback(() => {
    setDetailModalVisible(true);
  }, []);

  // Chat & Custom Reports gestures moved into their respective panels.
  // pageOffset is passed as a prop so they can drive page transitions
  // from their header drag-handle areas without blocking scroll.

  // ── Home gesture: horizontal cards + vertical page swipe ──
  const homeTap = Gesture.Tap().onEnd(() => {
    runOnJS(handleCardTap)();
  });

  const homePan = Gesture.Pan()
    .onUpdate((e) => {
      dragX.value = e.translationX;
      // Vertical: up toward checklist, down toward custom reports
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

      // Swipe down → custom reports
      if (e.translationY > SWIPE_THRESHOLD) {
        pageOffset.value = withSpring(PAGE_CUSTOM_REPORTS, PAGE_SPRING);
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
        {/* ── Chat (top) ── */}
        <Animated.View style={styles.page}>
          <ChatPanel pageOffset={pageOffset} />
        </Animated.View>

        {/* ── Custom Reports ── */}
        <Animated.View style={styles.page}>
          <CustomReportPanel pageOffset={pageOffset} />
        </Animated.View>

        {/* ── Home (middle) ── */}
        <GestureDetector gesture={Gesture.Race(homePan, homeTap)}>
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

            <View style={styles.bottomContent} pointerEvents="box-none">
              <UploadStatusButton onPress={handleUploadPress} />
              <View style={{ height: 12 }} />
              <SwipeUpArrow />
            </View>
          </Animated.View>
        </GestureDetector>

        {/* ── Checklist (bottom) ── */}
        <Animated.View style={styles.page}>
          <ChecklistPanel pageOffset={pageOffset} />
        </Animated.View>
      </Animated.View>

      {/* ── Modals ── */}
      <TextInputModal
        visible={textModalVisible}
        onClose={() => setTextModalVisible(false)}
        onSubmit={(text) => uploadText(text)}
      />
      <ImagePickerSheet
        visible={imageModalVisible}
        onClose={() => setImageModalVisible(false)}
        onSubmit={(images) => uploadImages(images)}
      />
      <AudioPickerSheet
        visible={audioModalVisible}
        onClose={() => setAudioModalVisible(false)}
        onSubmit={(b64, ct) => uploadAudio(b64, ct)}
      />
      <UploadDetailModal
        visible={detailModalVisible}
        onClose={() => setDetailModalVisible(false)}
      />
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
    height: SCREEN_HEIGHT * 4,
  },
  page: {
    height: SCREEN_HEIGHT,
    backgroundColor: COLORS.bgBase,
    overflow: "hidden",
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
