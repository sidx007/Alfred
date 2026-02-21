import React from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { COLORS } from "../constants/theme";

const ICON_SIZE = 64;
const ICON_STROKE = COLORS.textPrimary;
const ICON_STROKE_WIDTH = 1.5;

export function TextIcon() {
    return (
        <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
            <Path
                d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"
                stroke={ICON_STROKE}
                strokeWidth={ICON_STROKE_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <Path d="M2 6h4" stroke={ICON_STROKE} strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M2 10h4" stroke={ICON_STROKE} strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M2 14h4" stroke={ICON_STROKE} strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M2 18h4" stroke={ICON_STROKE} strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" />
            <Path
                d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"
                stroke={ICON_STROKE}
                strokeWidth={ICON_STROKE_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

export function AudioIcon() {
    return (
        <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
            <Path
                d="M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2"
                stroke={ICON_STROKE}
                strokeWidth={ICON_STROKE_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

export function ImageIcon() {
    return (
        <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
            <Rect
                width={18}
                height={18}
                x={3}
                y={3}
                rx={2}
                ry={2}
                stroke={ICON_STROKE}
                strokeWidth={ICON_STROKE_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <Circle
                cx={9}
                cy={9}
                r={2}
                stroke={ICON_STROKE}
                strokeWidth={ICON_STROKE_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <Path
                d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"
                stroke={ICON_STROKE}
                strokeWidth={ICON_STROKE_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}
