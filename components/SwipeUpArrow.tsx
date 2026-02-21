import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { COLORS } from "../constants/theme";

export function SwipeUpArrow() {
    return (
        <View style={styles.arrowContainer}>
            <Svg width={80} height={24} viewBox="0 0 80 24" fill="none">
                <Path
                    d="M10 18L40 6L70 18"
                    stroke={COLORS.accent}
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </Svg>
        </View>
    );
}

const styles = StyleSheet.create({
    arrowContainer: {
        alignItems: "center",
        justifyContent: "center",
        opacity: 0.6,
    },
});
