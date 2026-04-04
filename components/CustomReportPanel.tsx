import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    StyleSheet,
    Text,
    View,
} from "react-native";
import {
    Gesture,
    GestureDetector,
    ScrollView,
    TouchableOpacity,
} from "react-native-gesture-handler";
import Markdown from "react-native-markdown-display";
import Animated, {
    type SharedValue,
    runOnJS,
    withSpring,
} from "react-native-reanimated";
import { COLORS } from "../constants/theme";
import { fetchTopics, generateCustomReport } from "../services/alfredApi";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SWIPE_THRESHOLD = 30;
const PAGE_SPRING = { damping: 22, stiffness: 180, mass: 1 };
const PAGE_CHAT = 0;
const PAGE_CUSTOM_REPORTS = -SCREEN_HEIGHT;
const PAGE_HOME = -SCREEN_HEIGHT * 2;

/** Simple in-memory cache for generated reports keyed by sorted topic list. */
const reportCache = new Map<
  string,
  { report: string; memoryPoints: number; knowledgePoints: number }
>();

function cacheKey(topics: string[]): string {
  return [...topics].sort().join("||");
}

interface CustomReportPanelProps {
  pageOffset: SharedValue<number>;
}

export function CustomReportPanel({ pageOffset }: CustomReportPanelProps) {
  const [topics, setTopics] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    memoryPoints: number;
    knowledgePoints: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTopics()
      .then(setTopics)
      .catch((err) => setError(err.message || "Failed to load topics"))
      .finally(() => setLoadingTopics(false));
  }, []);

  const toggleTopic = (topic: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(topics));
  const clearAll = () => setSelected(new Set());

  const handleGenerate = async () => {
    if (selected.size === 0 || generating) return;

    const selectedArr = Array.from(selected);
    const key = cacheKey(selectedArr);

    // Check cache first
    const cached = reportCache.get(key);
    if (cached) {
      setReport(cached.report);
      setStats({
        memoryPoints: cached.memoryPoints,
        knowledgePoints: cached.knowledgePoints,
      });
      return;
    }

    setGenerating(true);
    setReport(null);
    setStats(null);
    setError(null);

    try {
      const result = await generateCustomReport(selectedArr);
      setReport(result.report);
      setStats(result.stats);
      // Store in cache
      reportCache.set(key, {
        report: result.report,
        memoryPoints: result.stats.memoryPoints,
        knowledgePoints: result.stats.knowledgePoints,
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Report generation failed";
      setError(msg);
    } finally {
      setGenerating(false);
    }
  };

  const goBack = () => {
    setReport(null);
    setStats(null);
    setError(null);
  };

  const mediumHaptic = () =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

  // Swipe up → home, swipe down → chat
  const headerPan = Gesture.Pan()
    .activeOffsetY([-5, 5])
    .failOffsetX([-50, 50])
    .onUpdate((e) => {
      pageOffset.value = PAGE_CUSTOM_REPORTS + e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY < -SWIPE_THRESHOLD && Math.abs(e.translationX) < 100) {
        pageOffset.value = withSpring(PAGE_HOME, PAGE_SPRING);
        runOnJS(mediumHaptic)();
      } else if (
        e.translationY > SWIPE_THRESHOLD &&
        Math.abs(e.translationX) < 100
      ) {
        pageOffset.value = withSpring(PAGE_CHAT, PAGE_SPRING);
        runOnJS(mediumHaptic)();
      } else {
        pageOffset.value = withSpring(PAGE_CUSTOM_REPORTS, PAGE_SPRING);
      }
    });

  // Duplicate gesture for bottom handle (RNGH requires separate instances)
  const bottomPan = Gesture.Pan()
    .activeOffsetY([-5, 5])
    .failOffsetX([-50, 50])
    .onUpdate((e) => {
      pageOffset.value = PAGE_CUSTOM_REPORTS + e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY < -SWIPE_THRESHOLD && Math.abs(e.translationX) < 100) {
        pageOffset.value = withSpring(PAGE_HOME, PAGE_SPRING);
        runOnJS(mediumHaptic)();
      } else if (
        e.translationY > SWIPE_THRESHOLD &&
        Math.abs(e.translationX) < 100
      ) {
        pageOffset.value = withSpring(PAGE_CHAT, PAGE_SPRING);
        runOnJS(mediumHaptic)();
      } else {
        pageOffset.value = withSpring(PAGE_CUSTOM_REPORTS, PAGE_SPRING);
      }
    });

  return (
    <View style={styles.container}>
      <GestureDetector gesture={headerPan}>
        <Animated.View>
          <View style={styles.dragHandleArea}>
            <View style={styles.dragHandle} />
          </View>

          <View style={styles.header}>
            <Text style={styles.headerTitle}>Custom Reports</Text>
            <Text style={styles.headerSubtitle}>
              Select topics and generate a comprehensive report
            </Text>
          </View>
        </Animated.View>
      </GestureDetector>

      {/* ── Report view ── */}
      {report ? (
        <View style={styles.reportContainer}>
          <View style={styles.reportHeader}>
            <TouchableOpacity
              onPress={goBack}
              style={styles.backBtn}
              activeOpacity={0.7}
            >
              <Ionicons
                name="arrow-back"
                size={20}
                color={COLORS.textPrimary}
              />
              <Text style={styles.backText}>Back to topics</Text>
            </TouchableOpacity>
            {stats && (
              <Text style={styles.statsText}>
                {stats.memoryPoints} memory · {stats.knowledgePoints} KB
              </Text>
            )}
          </View>
          <ScrollView
            style={styles.reportScroll}
            contentContainerStyle={styles.reportContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            <Markdown style={mdStyles}>{report}</Markdown>
          </ScrollView>
        </View>
      ) : (
        /* ── Topic selector ── */
        <View style={styles.selectorContainer}>
          {loadingTopics ? (
            <View style={styles.loadingArea}>
              <ActivityIndicator color={COLORS.accent} size="large" />
              <Text style={styles.loadingText}>Loading topics...</Text>
            </View>
          ) : error && topics.length === 0 ? (
            <View style={styles.loadingArea}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : topics.length === 0 ? (
            <View style={styles.loadingArea}>
              <Text style={styles.emptyText}>
                No topics found. Start adding content to your knowledge base.
              </Text>
            </View>
          ) : (
            <>
              <ScrollView
                style={styles.topicScroll}
                contentContainerStyle={styles.topicGrid}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                {topics.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.topicChip,
                      selected.has(t) && styles.topicChipSelected,
                    ]}
                    onPress={() => toggleTopic(t)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.topicText,
                        selected.has(t) && styles.topicTextSelected,
                      ]}
                    >
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.actions}>
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={selectAll}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionBtnText}>Select All</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={clearAll}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionBtnText}>Clear</Text>
                  </TouchableOpacity>
                </View>

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <TouchableOpacity
                  style={[
                    styles.generateBtn,
                    (selected.size === 0 || generating) &&
                      styles.generateBtnDisabled,
                  ]}
                  onPress={handleGenerate}
                  disabled={selected.size === 0 || generating}
                  activeOpacity={0.7}
                >
                  {generating ? (
                    <ActivityIndicator color={COLORS.bgBase} size="small" />
                  ) : (
                    <Text style={styles.generateBtnText}>
                      {selected.size > 0
                        ? `Generate Report (${selected.size} topic${selected.size !== 1 ? "s" : ""})`
                        : "Generate Report"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}

      {/* Bottom swipe handle */}
      <GestureDetector gesture={bottomPan}>
        <Animated.View style={styles.bottomSwipeArea}>
          <View style={styles.dragHandle} />
          <Text style={styles.swipeHint}>Swipe to navigate</Text>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 50,
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
  bottomSwipeArea: {
    alignItems: "center",
    paddingVertical: 10,
    paddingBottom: 16,
  },
  swipeHint: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans-Regular",
    color: "rgba(255, 255, 255, 0.25)",
    marginTop: 6,
  },
  header: {
    alignItems: "center",
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "PlusJakartaSans-ExtraBold",
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  loadingArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.textSecondary,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.accent,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  // Topic selector
  selectorContainer: {
    flex: 1,
  },
  topicScroll: {
    flex: 1,
  },
  topicGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    gap: 8,
    paddingBottom: 16,
  },
  topicChip: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  topicChipSelected: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderColor: COLORS.accent,
  },
  topicText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans-Medium",
    color: COLORS.textSecondary,
  },
  topicTextSelected: {
    color: COLORS.accent,
  },
  actions: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 12,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  actionBtnText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans-Medium",
    color: COLORS.textSecondary,
  },
  generateBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  generateBtnDisabled: {
    opacity: 0.4,
  },
  generateBtnText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans-Bold",
    color: COLORS.bgBase,
  },
  // Report view
  reportContainer: {
    flex: 1,
  },
  reportHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  backText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans-Medium",
    color: COLORS.textPrimary,
  },
  statsText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.accent,
    opacity: 0.8,
  },
  reportScroll: {
    flex: 1,
  },
  reportContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  reportText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.textPrimary,
    lineHeight: 24,
  },
});

const mdStyles = StyleSheet.create({
  body: {
    color: COLORS.textPrimary,
    fontSize: 15,
    lineHeight: 24,
    fontFamily: "PlusJakartaSans-Regular",
  },
  heading1: {
    color: COLORS.textPrimary,
    fontSize: 24,
    fontFamily: "PlusJakartaSans-ExtraBold",
    marginTop: 20,
    marginBottom: 8,
  },
  heading2: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontFamily: "PlusJakartaSans-Bold",
    marginTop: 16,
    marginBottom: 6,
  },
  heading3: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontFamily: "PlusJakartaSans-Bold",
    marginTop: 14,
    marginBottom: 4,
  },
  strong: {
    color: COLORS.textPrimary,
    fontFamily: "PlusJakartaSans-Bold",
  },
  em: {
    color: COLORS.textSecondary,
    fontStyle: "italic",
  },
  bullet_list_icon: {
    color: COLORS.accent,
    fontSize: 15,
    marginRight: 8,
  },
  code_inline: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    color: COLORS.accent,
    fontFamily: "monospace",
    fontSize: 13,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fence: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
  },
  code_block: {
    color: COLORS.textPrimary,
    fontFamily: "monospace",
    fontSize: 13,
  },
  blockquote: {
    backgroundColor: "rgba(239, 68, 68, 0.06)",
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    paddingLeft: 12,
    paddingVertical: 6,
    marginVertical: 8,
  },
  hr: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    height: 1,
    marginVertical: 16,
  },
  link: {
    color: COLORS.accent,
    textDecorationLine: "underline",
  },
  paragraph: {
    marginVertical: 4,
  },
});
