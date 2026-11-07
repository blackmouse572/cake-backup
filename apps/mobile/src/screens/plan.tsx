import { formatDistance, type Locale } from "@cage/i18n";
import { RouteMode, type Place } from "@cage/shared";
import { layout, space } from "@cage/ui-tokens";
import { useEffect, useReducer } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "../i18n";
import { RouteMap } from "../route-map";
import { allowLocation, currentPosition, placeDetails, planRoute, suggestPlaces } from "../services/places.service";
import { color, radius, text } from "../theme";
import { Icon, IconButton, IconLine, Note, PrimaryButton, Screen, Title } from "../ui";
import type { PlanProblem } from "./journey.reducer";
import { ARRIVAL_CHOICES, initialPlan, planReducer, travelMs } from "./plan.reducer";

/** Wait for a pause in typing before searching: every search is a paid call. */
const SEARCH_DEBOUNCE_MS = 350;

const SECONDS_PER_MINUTE = 60;

/**
 * Screen 01: where to. The traveller searches a place, picks a suggestion,
 * sees the route and travel time on the map, and starts. When no route can
 * be found they pick a travel time instead, so a trip can always start.
 */
export function PlanView({
  busy,
  problem,
  locale,
  onStart,
  onSettings,
}: {
  busy: boolean;
  problem: PlanProblem | null;
  locale: Locale;
  onStart: (destination: Place, travelMs: number) => void;
  onSettings: () => void;
}) {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(planReducer, initialPlan);
  const { here, query, search, picked, mode, route } = state;
  const travel = travelMs(state);

  // Where the phone is: the start of the route, and a hint for the search.
  useEffect(() => {
    void allowLocation().then(async (granted) => dispatch({ type: "here", here: granted ? await currentPosition() : null }));
  }, []);

  // Suggestions once typing pauses.
  useEffect(() => {
    if (search !== "searching") return;

    const timer = setTimeout(() => {
      void suggestPlaces(query.trim(), here).then((result) => dispatch({ type: "suggestions", query, result }));
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search, query, here]);

  // The route once both ends are known, and again when the mode changes.
  useEffect(() => {
    if (route.status !== "loading" || !here || !picked) return;

    void planRoute(here, picked, mode).then((result) => dispatch({ type: "route", to: picked.id, mode, result }));
  }, [route.status, here, picked, mode]);

  const pick = (id: string) => void placeDetails(id).then((result) => dispatch({ type: "picked", result }));
  const problems = { need_location: "plan.needLocation", error: "plan.error" } as const;

  return (
    <Screen
      top={
        <View>
          <RouteMap here={here} to={picked} polyline={route.status === "ready" ? route.route.polyline : null} />
          {/* A text button until the icon font has a gear. */}
          <Pressable accessibilityRole="button" onPress={onSettings} hitSlop={8} style={styles.settings}>
            <Text style={text("body")}>{t("settings.title")}</Text>
          </Pressable>
        </View>
      }
      footer={
        <PrimaryButton
          label={t("journey.start")}
          busy={busy}
          disabled={!picked || travel === null}
          onPress={() => picked && travel !== null && onStart(picked, travel)}
        />
      }
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: space[5], paddingBottom: space[4] }}>
        <Title>{t("plan.title")}</Title>
        <View style={styles.fields}>
          <View style={styles.field}>
            <View style={styles.hereDot} />
            <Text style={[text("body"), { flex: 1 }]} numberOfLines={1}>
              {t("plan.from")}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.field}>
            <Icon name="location_on" tint={color.fgPrimary} />
            <TextInput
              accessibilityLabel={t("plan.destination")}
              value={query}
              onChangeText={(q) => dispatch({ type: "typed", query: q })}
              placeholder={t("plan.destinationHint")}
              placeholderTextColor={color.fgTertiary}
              style={styles.inputText}
              autoCorrect={false}
              returnKeyType="search"
            />
            {query ? <IconButton icon="close" label={t("plan.clear")} onPress={() => dispatch({ type: "clear" })} /> : null}
          </View>
        </View>

        {state.suggestions.map((s) => (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            onPress={() => pick(s.id)}
            style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: color.surfaceHover }]}
          >
            <Icon name="location_on" />
            <View style={{ flex: 1 }}>
              <Text style={text("body")} numberOfLines={1}>
                {s.name}
              </Text>
              <Text style={[text("caption"), { color: color.fgSecondary }]} numberOfLines={1}>
                {s.address}
              </Text>
            </View>
          </Pressable>
        ))}
        {search === "done" && state.suggestions.length === 0 ? <Note tone="info">{t("plan.noResults")}</Note> : null}
        {search === "error" ? <Note tone="danger">{t("plan.searchError")}</Note> : null}

        {picked ? (
          <View style={styles.mode} accessibilityRole="radiogroup" accessibilityLabel={t("plan.by")}>
            <View style={styles.chips}>
              {RouteMode.options.map((m) => (
                <Pressable
                  key={m}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: m === mode }}
                  onPress={() => dispatch({ type: "mode", mode: m })}
                  style={[styles.chip, m === mode && styles.chipOn]}
                >
                  <Text style={[text("body"), m === mode && { color: color.onFg }]}>{t(`plan.mode.${m}`)}</Text>
                </Pressable>
              ))}
            </View>
            {route.status === "ready" ? (
              <View style={{ alignItems: "flex-end" }}>
                <Text style={text("title")}>
                  {t("common.minutes", { count: Math.max(1, Math.round(route.route.durationS / SECONDS_PER_MINUTE)) })}
                </Text>
                <Text style={[text("caption"), { color: color.fgSecondary }]}>{formatDistance(route.route.distanceM, locale)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {picked && travel !== null && route.status !== "ready" ? (
          <>
            {route.status === "error" ? <Note tone="info">{t("plan.routeError")}</Note> : null}
            <View style={[styles.chips, { marginTop: space[4] }]} accessibilityRole="radiogroup" accessibilityLabel={t("plan.arriveIn")}>
              <Icon name="schedule" tint={color.fgSecondary} />
              {ARRIVAL_CHOICES.map((m) => (
                <Pressable
                  key={m}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: m === state.minutes }}
                  onPress={() => dispatch({ type: "minutes", minutes: m })}
                  style={[styles.chip, m === state.minutes && styles.chipOn]}
                >
                  <Text style={[text("body"), m === state.minutes && { color: color.onFg }]}>{t("common.minutes", { count: m })}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <View style={{ marginTop: space[5] }}>
          <IconLine icon="notifications">{t("plan.checkNote")}</IconLine>
        </View>
        {problem ? <Note tone="danger">{t(problems[problem])}</Note> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  settings: {
    position: "absolute",
    top: space[3],
    right: space[4],
    paddingHorizontal: space[3],
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
  },
  fields: {
    marginTop: space[4],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
  },
  field: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: layout.buttonHeight.lg, paddingHorizontal: space[4] },
  divider: { borderTopWidth: 1, borderStyle: "dashed", borderColor: color.divider, marginHorizontal: space[4] },
  hereDot: { width: 14, height: 14, marginHorizontal: 3, borderRadius: 7, backgroundColor: color.blue },
  inputText: { flex: 1, height: layout.buttonHeight.lg, fontSize: 16, color: color.fgPrimary },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[2],
    borderRadius: radius.sm,
  },
  mode: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space[4] },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  chip: { paddingHorizontal: space[3], paddingVertical: 6, borderRadius: radius.sm, backgroundColor: color.chip },
  chipOn: { backgroundColor: color.surfaceInverse },
});
