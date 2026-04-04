import React from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import Animated, {
    Extrapolation,
    interpolate,
    useAnimatedStyle,
} from "react-native-reanimated";
import { items } from "../constants/items";
import {
    CARD_HEIGHT,
    CARD_RADIUS,
    CARD_WIDTH,
    SPACING,
} from "../constants/layout";
import { COLORS } from "../constants/theme";

const SCREEN_HEIGHT = Dimensions.get("window").height;

interface CardItemProps {
  item: (typeof items)[number];
  index: number;
  currentIndex: Animated.SharedValue<number>;
  dragX: Animated.SharedValue<number>;
  pageOffset: Animated.SharedValue<number>;
  centerX: number;
  centerY: number;
}

export function CardItem({
  item,
  index,
  currentIndex,
  dragX,
  pageOffset,
  centerX,
  centerY,
}: CardItemProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const count = items.length;
    const visualIndex = ((currentIndex.value % count) + count) % count;

    let offset = index - visualIndex;
    if (offset > count / 2) offset -= count;
    if (offset < -count / 2) offset += count;

    // Horizontal carousel offset
    const moveX = offset * SPACING + dragX.value * 0.6;
    const baseY = interpolate(
      Math.abs(offset),
      [0, 1, 2],
      [0, 24, 40],
      Extrapolation.CLAMP,
    );

    // Page transition: cards scale down and fade when leaving home
    // pageOffset rests at -SCREEN_HEIGHT*2 when home is visible (4-page layout)
    const distFromHome = Math.abs(pageOffset.value + SCREEN_HEIGHT * 2);
    const swipeProgress = interpolate(
      distFromHome,
      [0, SCREEN_HEIGHT * 0.4],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const swipeScale = interpolate(
      swipeProgress,
      [0, 1],
      [1, 0.75],
      Extrapolation.CLAMP,
    );
    const swipeOpacity = interpolate(
      swipeProgress,
      [0, 1],
      [1, 0],
      Extrapolation.CLAMP,
    );

    const moveY = baseY;

    const scale =
      interpolate(
        Math.abs(offset),
        [0, 1, 2],
        [1, 0.85, 0.7],
        Extrapolation.CLAMP,
      ) * swipeScale;
    const opacity =
      interpolate(
        Math.abs(offset),
        [0, 1, 2],
        [1, 0.6, 0.2],
        Extrapolation.CLAMP,
      ) * swipeOpacity;
    const rotateY = interpolate(
      offset,
      [-1, 0, 1],
      [8, 0, -8],
      Extrapolation.CLAMP,
    );
    const zIndex = 10 - Math.round(Math.abs(offset));
    const cardElevation = interpolate(
      Math.abs(offset),
      [0, 1, 2],
      [24, 8, 2],
      Extrapolation.CLAMP,
    );

    return {
      transform: [
        { translateX: moveX },
        { translateY: moveY },
        { scale },
        { perspective: 800 },
        { rotateY: `${rotateY}deg` },
      ],
      opacity,
      zIndex,
      elevation: cardElevation,
    };
  });

  return (
    <Animated.View
      style={[
        styles.cardWrapper,
        { left: centerX, top: centerY },
        animatedStyle,
      ]}
      pointerEvents="none"
    >
      <View style={styles.card}>
        <View
          style={[styles.cardAccentTint, { backgroundColor: item.accentTint }]}
        />
        <View style={styles.cardIcon}>
          <item.icon />
        </View>
        <Text style={styles.cardLabel}>{item.label}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    position: "absolute",
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: CARD_RADIUS,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 8,
  },
  cardAccentTint: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: CARD_RADIUS,
  },
  cardIcon: {
    marginBottom: 24,
    alignItems: "center",
    justifyContent: "center",
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  cardLabel: {
    fontSize: 30,
    fontFamily: "PlusJakartaSans-ExtraBold",
    color: COLORS.textPrimary,
    letterSpacing: 1,
    marginBottom: 8,
  },
});
