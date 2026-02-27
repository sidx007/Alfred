import React from "react";
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { COLORS } from "../constants/theme";
import { useUpload } from "../context/UploadContext";
import type { JobStatus, UploadJob } from "../services/uploadQueue";

interface UploadDetailModalProps {
  visible: boolean;
  onClose: () => void;
}

const TYPE_ICONS: Record<string, string> = {
  text: "T",
  audio: "♪",
  image: "▣",
};

const STATUS_COLORS: Record<JobStatus, string> = {
  queued: COLORS.textSecondary,
  running: "#3b82f6",
  completed: "#22c55e",
  failed: "#ef4444",
  retrying: "#f59e0b",
};

const STATUS_LABELS: Record<JobStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  retrying: "Retrying",
};

function JobCard({
  job,
  onRetry,
  onDismiss,
}: {
  job: UploadJob;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const statusColor = STATUS_COLORS[job.status];
  const icon = TYPE_ICONS[job.type] ?? "?";

  return (
    <View style={styles.jobCard}>
      {/* Header row */}
      <View style={styles.jobHeader}>
        <View style={[styles.typeIcon, { borderColor: statusColor }]}>
          <Text style={[styles.typeIconText, { color: statusColor }]}>
            {icon}
          </Text>
        </View>
        <View style={styles.jobTitleCol}>
          <Text style={styles.jobLabel}>{job.label}</Text>
          <Text style={[styles.jobStatus, { color: statusColor }]}>
            {STATUS_LABELS[job.status]}
            {job.attempts > 0 &&
              ` · Attempt ${job.attempts}/${job.maxAttempts}`}
          </Text>
        </View>
        {(job.status === "running" || job.status === "retrying") && (
          <ActivityIndicator size="small" color={statusColor} />
        )}
        {job.status === "completed" && (
          <Text style={styles.completedCheck}>✓</Text>
        )}
      </View>

      {/* Progress steps */}
      {job.completedSteps.length > 0 && (
        <View style={styles.stepsContainer}>
          {job.completedSteps.map((step, i) => {
            const isLast = i === job.completedSteps.length - 1;
            const isActive =
              isLast && (job.status === "running" || job.status === "retrying");
            return (
              <View key={`${job.id}-step-${i}`} style={styles.stepRow}>
                <View
                  style={[
                    styles.stepDot,
                    {
                      backgroundColor: isActive
                        ? statusColor
                        : "rgba(255,255,255,0.25)",
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.stepText,
                    isActive && { color: COLORS.textPrimary },
                  ]}
                  numberOfLines={1}
                >
                  {step}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Error */}
      {job.error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText} numberOfLines={3}>
            {job.error}
          </Text>
        </View>
      )}

      {/* Action buttons */}
      {(job.status === "failed" || job.status === "completed") && (
        <View style={styles.jobActions}>
          {job.status === "failed" && (
            <Pressable style={styles.retryBtn} onPress={onRetry}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          )}
          <Pressable style={styles.dismissBtn} onPress={onDismiss}>
            <Text style={styles.dismissBtnText}>Dismiss</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function UploadDetailModal({
  visible,
  onClose,
}: UploadDetailModalProps) {
  const { jobs, retry, dismiss, clearDone } = useUpload();

  const hasFinished = jobs.some(
    (j) => j.status === "completed" || j.status === "failed",
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          <View style={styles.titleRow}>
            <Text style={styles.title}>Upload Status</Text>
            {hasFinished && (
              <Pressable onPress={clearDone}>
                <Text style={styles.clearText}>Clear done</Text>
              </Pressable>
            )}
          </View>

          {jobs.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No uploads</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  onRetry={() => retry(job.id)}
                  onDismiss={() => dismiss(job.id)}
                />
              ))}
            </ScrollView>
          )}

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  sheet: {
    backgroundColor: COLORS.surfaceSolid,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 36,
    maxHeight: "80%",
  },
  handleRow: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontFamily: "PlusJakartaSans-Bold",
    color: COLORS.textPrimary,
  },
  clearText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans-Medium",
    color: COLORS.textSecondary,
  },
  listScroll: {
    flexGrow: 0,
  },
  listContent: {
    gap: 12,
    paddingBottom: 8,
  },
  empty: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.textSecondary,
  },

  // ── Job card ──
  jobCard: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 14,
  },
  jobHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  typeIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  typeIconText: {
    fontSize: 14,
    fontWeight: "800",
  },
  jobTitleCol: {
    flex: 1,
  },
  jobLabel: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans-SemiBold",
    color: COLORS.textPrimary,
  },
  jobStatus: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans-Regular",
    marginTop: 1,
  },
  completedCheck: {
    fontSize: 18,
    fontWeight: "700",
    color: "#22c55e",
  },

  // ── Steps ──
  stepsContainer: {
    marginTop: 10,
    paddingLeft: 6,
    gap: 4,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  stepText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.textSecondary,
    flex: 1,
  },

  // ── Error ──
  errorBox: {
    marginTop: 8,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 8,
    padding: 8,
  },
  errorText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans-Regular",
    color: "#ef4444",
  },

  // ── Actions ──
  jobActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    justifyContent: "flex-end",
  },
  retryBtn: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "rgba(59, 130, 246, 0.15)",
  },
  retryBtnText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans-SemiBold",
    color: "#3b82f6",
  },
  dismissBtn: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  dismissBtnText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans-Medium",
    color: COLORS.textSecondary,
  },

  // ── Bottom close ──
  closeBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  closeBtnText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans-SemiBold",
    color: COLORS.textPrimary,
  },
});
