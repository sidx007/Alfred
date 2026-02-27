import React, { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS } from "react-native-reanimated";
import { COLORS } from "../constants/theme";
import { useUpload } from "../context/UploadContext";

interface UploadStatusButtonProps {
  onPress?: () => void;
}

export function UploadStatusButton({ onPress }: UploadStatusButtonProps) {
  const { jobs, overallStatus } = useUpload();

  const tap = useMemo(
    () =>
      Gesture.Tap().onEnd(() => {
        if (onPress) runOnJS(onPress)();
      }),
    [onPress],
  );

  if (overallStatus === "idle") return null;

  const activeJob = jobs.find(
    (j) =>
      j.status === "running" ||
      j.status === "retrying" ||
      j.status === "queued",
  );
  const failedCount = jobs.filter((j) => j.status === "failed").length;
  const completedCount = jobs.filter((j) => j.status === "completed").length;
  const totalCount = jobs.length;

  let label = "";
  let sublabel = "";
  let pillStyle = styles.pillUploading;

  switch (overallStatus) {
    case "uploading":
      label = "Uploading";
      sublabel = activeJob?.progress ?? "Processing…";
      pillStyle = styles.pillUploading;
      break;
    case "completed":
      label = "Uploaded";
      sublabel = `${completedCount} item${completedCount !== 1 ? "s" : ""} processed`;
      pillStyle = styles.pillCompleted;
      break;
    case "error":
      label = "Upload failed";
      sublabel = `${failedCount} failed · Tap to retry`;
      pillStyle = styles.pillError;
      break;
  }

  return (
    <GestureDetector gesture={tap}>
      <Animated.View style={[styles.pill, pillStyle]}>
        <View style={styles.pillContent}>
          {overallStatus === "uploading" && (
            <ActivityIndicator
              size="small"
              color={COLORS.textPrimary}
              style={styles.spinner}
            />
          )}
          {overallStatus === "completed" && (
            <Text style={styles.checkmark}>✓</Text>
          )}
          {overallStatus === "error" && <Text style={styles.errorIcon}>!</Text>}
          <View style={styles.textCol}>
            <Text style={styles.pillLabel}>{label}</Text>
            <Text style={styles.pillSublabel} numberOfLines={1}>
              {sublabel}
            </Text>
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 140,
  },
  pillUploading: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  pillCompleted: {
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderColor: "rgba(34, 197, 94, 0.3)",
  },
  pillError: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderColor: "rgba(239, 68, 68, 0.4)",
  },
  pillContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  spinner: {
    marginRight: 2,
  },
  checkmark: {
    fontSize: 16,
    fontWeight: "700",
    color: "#22c55e",
  },
  errorIcon: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.accent,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(239, 68, 68, 0.3)",
    textAlign: "center",
    lineHeight: 20,
  },
  textCol: {
    flex: 1,
  },
  pillLabel: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans-Bold",
    color: COLORS.textPrimary,
  },
  pillSublabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.textSecondary,
    marginTop: 1,
  },
});
