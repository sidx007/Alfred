import { Dimensions } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export { SCREEN_WIDTH };
export const CARD_WIDTH = 280;
export const CARD_HEIGHT = 400;
export const CARD_RADIUS = 12;
export const SPACING = SCREEN_WIDTH * 0.72;
export const SNAP_THRESHOLD = 45;

export const SPRING_CONFIG = {
  damping: 18,
  stiffness: 160,
  mass: 0.9,
};
