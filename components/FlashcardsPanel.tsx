import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { TouchableOpacity } from "react-native-gesture-handler";
import { COLORS } from "../constants/theme";
import { type Flashcard, fetchFlashcards } from "../services/alfredApi";

const FALLBACK_FLASHCARDS: Flashcard[] = [
  {
    id: "1",
    question: "What does TCP stand for?",
    answer: "Transmission Control Protocol",
  },
  {
    id: "2",
    question: "What is the time complexity of binary search?",
    answer: "O(log n)",
  },
  {
    id: "3",
    question: "What does REST stand for?",
    answer: "Representational State Transfer",
  },
  {
    id: "4",
    question: "What is a closure in JavaScript?",
    answer:
      "A function that retains access to its outer scope's variables even after the outer function has returned.",
  },
  {
    id: "5",
    question: "What layer does HTTP operate on?",
    answer: "Application layer (Layer 7 of the OSI model)",
  },
];

export function FlashcardsPanel() {
  const [deck, setDeck] = useState<Flashcard[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFlashcards()
      .then((cards) => {
        setDeck(cards.length > 0 ? cards : FALLBACK_FLASHCARDS);
      })
      .catch(() => setDeck(FALLBACK_FLASHCARDS))
      .finally(() => setLoading(false));
  }, []);

  const card = deck[0];
  const remaining = deck.length;

  const showAnswer = () => setRevealed(true);

  const gradeCard = (grade: "again" | "good" | "easy") => {
    setRevealed(false);
    setDeck((prev) => {
      if (prev.length <= 1) {
        return [...prev];
      }
      const [current, ...rest] = prev;
      if (grade === "again") {
        const insertAt = Math.max(rest.length - 1, 0);
        const newDeck = [...rest];
        newDeck.splice(insertAt, 0, current);
        return newDeck;
      }
      return rest;
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  if (!card) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Flashcards</Text>
        <Text style={styles.counter}>{remaining} remaining</Text>
      </View>

      {/* Card fixed in center */}
      <View style={styles.cardArea} pointerEvents="box-none">
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={revealed ? undefined : showAnswer}
          style={styles.flashcard}
        >
          {!revealed ? (
            <>
              <Text style={styles.cardText}>{card.question}</Text>
              <Text style={styles.hint}>Tap to reveal answer</Text>
            </>
          ) : (
            <>
              <Text style={styles.questionSmall}>{card.question}</Text>
              <View style={styles.divider} />
              <Text style={styles.answerText}>{card.answer}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Anki-style grade buttons — pinned to bottom */}
      {revealed && (
        <View style={styles.gradeRow}>
          <View style={styles.gradeBtnWrap}>
            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.gradeBtn, styles.gradeBtnAgain]}
              onPress={() => gradeCard("again")}
            >
              <Text style={styles.gradeTime}>{"<1m"}</Text>
              <Text style={[styles.gradeLabel, styles.gradeLabelAgain]}>
                Again
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.gradeBtnWrap}>
            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.gradeBtn, styles.gradeBtnGood]}
              onPress={() => gradeCard("good")}
            >
              <Text style={styles.gradeTime}>{"<10m"}</Text>
              <Text style={[styles.gradeLabel, styles.gradeLabelGood]}>
                Good
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.gradeBtnWrap}>
            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.gradeBtn, styles.gradeBtnEasy]}
              onPress={() => gradeCard("easy")}
            >
              <Text style={styles.gradeTime}>{"4d"}</Text>
              <Text style={[styles.gradeLabel, styles.gradeLabelEasy]}>
                Easy
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Drag handle at bottom */}
      <View style={styles.dragHandleArea}>
        <View style={styles.dragHandle} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 0,
  },
  header: {
    alignItems: "center",
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "PlusJakartaSans-ExtraBold",
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  counter: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans-Medium",
    color: COLORS.textSecondary,
  },
  cardArea: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  flashcard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingVertical: 40,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 260,
  },
  cardText: {
    fontSize: 22,
    fontFamily: "PlusJakartaSans-Medium",
    color: COLORS.textPrimary,
    textAlign: "center",
    lineHeight: 32,
  },
  hint: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.textSecondary,
    marginTop: 24,
  },
  questionSmall: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 16,
  },
  divider: {
    width: 48,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginBottom: 16,
  },
  answerText: {
    fontSize: 20,
    fontFamily: "PlusJakartaSans-Bold",
    color: COLORS.textPrimary,
    textAlign: "center",
    lineHeight: 30,
  },
  gradeRow: {
    position: "absolute",
    bottom: 64,
    left: 24,
    right: 24,
    flexDirection: "row",
    gap: 12,
  },
  gradeBtnWrap: {
    flex: 1,
  },
  gradeBtn: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  gradeBtnAgain: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderColor: "rgba(239, 68, 68, 0.25)",
  },
  gradeBtnGood: {
    backgroundColor: "rgba(34, 197, 94, 0.08)",
    borderColor: "rgba(34, 197, 94, 0.25)",
  },
  gradeBtnEasy: {
    backgroundColor: "rgba(59, 130, 246, 0.08)",
    borderColor: "rgba(59, 130, 246, 0.25)",
  },
  gradeTime: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans-Regular",
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  gradeLabel: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans-Bold",
  },
  gradeLabelAgain: {
    color: "#ef4444",
  },
  gradeLabelGood: {
    color: "#22c55e",
  },
  gradeLabelEasy: {
    color: "#3b82f6",
  },
  dragHandleArea: {
    position: "absolute",
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
});
