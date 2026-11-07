import { CIRCLE, formatPhone, moveId, toE164, type CircleContact } from "@cage/shared";
import { layout, space } from "@cage/ui-tokens";
import { useForm } from "@tanstack/react-form";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "../i18n";
import { addContacts, fetchCircle, removeContact, reorderCircle } from "../services/circle.service";
import { contactsAccess, readPhoneContacts, requestContactsAccess } from "../services/phone-contacts.service";
import { color, radius, text } from "../theme";
import { BackBar, Caption, GhostButton, Icon, IconButton, Note, PrimaryButton, Screen, StepNav, Title } from "../ui";
import { circleReducer, initialCircleState, needsNudge, roomLeft, type CircleProblem } from "./circle.reducer";
import { initialPickerState, pickerReducer, pickerSections, type PhoneContact } from "./contact-picker";

/**
 * The safety circle: screen 09 in onboarding (step 3 of 5) and screen 05
 * from the app. Contacts come from the phone book (09a, 09b) or are typed
 * in. The order on screen is the alert order.
 */
export function CircleScreen({
  mode,
  onBack,
  onDone,
}: {
  mode: "onboarding" | "settings";
  onBack?: () => void;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(circleReducer, initialCircleState);
  const { status, contacts, sheet, busy, problem } = state;

  const load = useCallback(async () => {
    dispatch({ type: "loading" });
    const circle = await fetchCircle();
    dispatch(circle === "error" ? { type: "loadFailed" } : { type: "loaded", circle });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** "Từ danh bạ": straight to the picker once allowed, else explain first (09a). */
  async function fromContacts() {
    const access = await contactsAccess();

    dispatch({ type: "open", sheet: access === "granted" ? "picker" : "permission" });
  }

  async function allowContacts() {
    const access = await requestContactsAccess();

    dispatch(access === "granted" ? { type: "open", sheet: "picker" } : { type: "noContacts", problem: "denied" });
  }

  async function save(people: { name: string; phone: string }[]) {
    dispatch({ type: "saving" });
    const result = await addContacts(people);
    dispatch(Array.isArray(result) ? { type: "saved", circle: result } : { type: "saveFailed", problem: result });
  }

  const unreadable = useCallback(() => dispatch({ type: "noContacts", problem: "contacts" }), []);

  async function move(contact: CircleContact, direction: "up" | "down") {
    const ids = moveId(
      contacts.map((c) => c.id),
      contact.id,
      direction,
    );

    dispatch({ type: "saving" });
    const result = await reorderCircle(ids);
    dispatch(result === "error" ? { type: "saveFailed", problem: "error" } : { type: "saved", circle: result });
  }

  function confirmRemove(contact: CircleContact) {
    const name = contact.name;

    Alert.alert(t("circle.removeTitle", { name }), t("circle.removeBody", { name }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => {
          void (async () => {
            dispatch({ type: "saving" });

            const result = await removeContact(contact.id);
            dispatch(
              result === "ok"
                ? { type: "saved", circle: contacts.filter((c) => c.id !== contact.id) }
                : { type: "saveFailed", problem: "error" },
            );
          })();
        },
      },
    ]);
  }

  const onboarding = mode === "onboarding";

  return (
    <Screen
      footer={
        onboarding ? (
          <PrimaryButton label={t("common.continue")} onPress={() => onDone?.()} disabled={contacts.length === 0 || busy} />
        ) : undefined
      }
    >
      {onboarding ? <StepNav step={3} onBack={onBack} /> : onBack ? <BackBar onBack={onBack} /> : null}
      <ScrollView contentContainerStyle={{ paddingBottom: space[6] }} showsVerticalScrollIndicator={false}>
        <Title>{t(onboarding ? "circle.onboarding.title" : "circle.name")}</Title>
        <Caption>{t("circle.body")}</Caption>
        <View style={styles.card}>
          {status === "loading" ? (
            <View style={styles.row}>
              <ActivityIndicator color={color.fgPrimary} />
            </View>
          ) : status === "failed" ? (
            <View style={[styles.row, { flexDirection: "column", alignItems: "stretch" }]}>
              <Text style={[text("caption"), { color: color.fgSecondary }]}>{t("circle.errors.load")}</Text>
              <GhostButton label={t("common.retry")} onPress={() => void load()} />
            </View>
          ) : (
            contacts.map((c, i) => (
              <ContactRow
                key={c.id}
                contact={c}
                first={i === 0}
                last={i === contacts.length - 1}
                disabled={busy}
                onMove={(direction) => void move(c, direction)}
                onRemove={() => confirmRemove(c)}
              />
            ))
          )}
          {status === "ready" ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy || roomLeft(state) === 0}
              onPress={() => void fromContacts()}
              style={({ pressed }) => [
                styles.row,
                contacts.length > 0 && styles.rowDivider,
                (pressed || roomLeft(state) === 0) && { opacity: 0.5 },
              ]}
            >
              <View style={[styles.avatar, { borderStyle: "dashed", borderColor: color.borderStrong }]}>
                <Icon name="person_add" tint={color.fgPrimary} />
              </View>
              <Text style={[text("body"), { fontWeight: "500" }]}>{t("circle.add")}</Text>
            </Pressable>
          ) : null}
        </View>
        {contacts.length > 1 ? <Text style={[text("caption"), styles.order]}>{t("circle.order")}</Text> : null}
        {needsNudge(state) ? <Text style={[text("caption"), styles.order]}>{t("circle.nudge")}</Text> : null}
        {problem && sheet === "none" ? <ProblemNote problem={problem} /> : null}
      </ScrollView>

      <PermissionSheet
        visible={sheet === "permission"}
        onAllow={() => void allowContacts()}
        onManual={() => dispatch({ type: "open", sheet: "manual" })}
        onClose={() => dispatch({ type: "open", sheet: "none" })}
      />
      {sheet === "picker" ? (
        <PickerModal
          inCircle={contacts.map((c) => c.phone)}
          room={roomLeft(state)}
          busy={busy}
          problem={problem}
          onUnreadable={unreadable}
          onAdd={(people) => void save(people)}
          onManual={() => dispatch({ type: "open", sheet: "manual" })}
          onClose={() => dispatch({ type: "open", sheet: "none" })}
        />
      ) : null}
      {sheet === "manual" ? (
        <ManualEntryModal
          busy={busy}
          problem={problem}
          onAdd={(person) => void save([person])}
          onClose={() => dispatch({ type: "open", sheet: "none" })}
        />
      ) : null}
    </Screen>
  );
}

function ProblemNote({ problem }: { problem: CircleProblem }) {
  const { t } = useTranslation();

  switch (problem) {
    case "load":
      return <Note tone="danger">{t("circle.errors.load")}</Note>;
    case "denied":
      return <Note tone="info">{t("circle.permission.denied")}</Note>;
    case "contacts":
      return <Note tone="info">{t("circle.picker.loadError")}</Note>;
    case "circle_full":
      return <Note tone="danger">{t("circle.errors.circle_full", { max: CIRCLE.max })}</Note>;
    default:
      return <Note tone="danger">{t(`circle.errors.${problem}`)}</Note>;
  }
}

function Avatar({ name }: { name: string }) {
  return (
    <View style={styles.avatar}>
      <Text style={[text("body"), { fontWeight: "500" }]}>{[...name.trim()][0]?.toUpperCase() ?? "·"}</Text>
    </View>
  );
}

/** A contact on 09 / 05 with move up, move down and remove. */
function ContactRow({
  contact,
  first,
  last,
  disabled,
  onMove,
  onRemove,
}: {
  contact: CircleContact;
  first: boolean;
  last: boolean;
  disabled: boolean;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const name = contact.name;

  return (
    <View style={[styles.row, !first && styles.rowDivider]}>
      <Avatar name={name} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[text("body"), { fontWeight: "500", fontSize: 17 }]}>
          {name}
        </Text>
        <Text numberOfLines={1} style={[text("caption"), { color: color.fgSecondary }]}>
          {formatPhone(contact.phone)}
        </Text>
      </View>
      {first && last ? null : (
        <>
          <IconButton icon="arrow_upward" label={t("circle.moveUp", { name })} onPress={() => onMove("up")} disabled={disabled || first} />
          <IconButton
            icon="arrow_downward"
            label={t("circle.moveDown", { name })}
            onPress={() => onMove("down")}
            disabled={disabled || last}
          />
        </>
      )}
      <IconButton icon="close" label={t("circle.remove", { name })} onPress={onRemove} disabled={disabled} />
    </View>
  );
}

/** Screen 09a: why Cage asks for contacts, before the system prompt. */
function PermissionSheet({
  visible,
  onAllow,
  onManual,
  onClose,
}: {
  visible: boolean;
  onAllow: () => void;
  onManual: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} accessibilityLabel={t("common.close")} onPress={onClose} />
      <SafeAreaView edges={["bottom"]} style={styles.sheet}>
        <View style={styles.grab} />
        <Text accessibilityRole="header" style={[text("screenTitle"), { marginTop: space[4] }]}>
          {t("circle.permission.title")}
        </Text>
        <Caption>{t("circle.permission.body")}</Caption>
        <View style={{ gap: 6, marginTop: space[6] }}>
          <PrimaryButton label={t("circle.permission.allow")} onPress={onAllow} />
          <GhostButton label={t("circle.permission.manual")} onPress={onManual} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/** Screen 09b: tick people from the phone book. Only the ticked ones leave the phone. */
function PickerModal({
  inCircle,
  room,
  busy,
  problem,
  onUnreadable,
  onAdd,
  onManual,
  onClose,
}: {
  inCircle: string[];
  room: number;
  busy: boolean;
  problem: CircleProblem | null;
  onUnreadable: () => void;
  onAdd: (people: { name: string; phone: string }[]) => void;
  onManual: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [book, setBook] = useState<PhoneContact[] | null>(null);
  const [state, dispatch] = useReducer(pickerReducer, initialPickerState);
  const taken = useMemo(() => new Set(inCircle), [inCircle]);

  useEffect(() => {
    void readPhoneContacts().then((contacts) => (contacts ? setBook(contacts) : onUnreadable()));
  }, [onUnreadable]);

  const byKey = useMemo(() => new Map((book ?? []).map((c) => [c.key, c])), [book]);
  const picked = state.picked.flatMap((k) => byKey.get(k) ?? []);
  const sections = useMemo(() => pickerSections(book ?? [], state.query), [book, state.query]);
  const full = picked.length >= room;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modal} edges={["top", "bottom"]}>
        <View style={styles.modalHead}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} hitSlop={12}>
            <Icon name="close" size={24} tint={color.fgPrimary} />
          </Pressable>
          <Text accessibilityRole="header" numberOfLines={1} style={[text("brandHeader"), { flex: 1 }]}>
            {t("circle.picker.title")}
          </Text>
          <IconButton icon="dialpad" label={t("circle.permission.manual")} onPress={onManual} />
        </View>
        <TextInput
          accessibilityLabel={t("circle.picker.search")}
          value={state.query}
          onChangeText={(query) => dispatch({ type: "query", query })}
          placeholder={t("circle.picker.search")}
          placeholderTextColor={color.fgTertiary}
          autoCorrect={false}
          style={styles.search}
        />
        {picked.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.chips}>
            {picked.map((c) => (
              <Pressable
                key={c.key}
                accessibilityRole="button"
                accessibilityLabel={t("circle.picker.deselect", { name: c.name })}
                onPress={() => dispatch({ type: "toggle", key: c.key, room })}
                style={styles.chip}
              >
                <Text numberOfLines={1} style={[text("caption"), { color: color.onFg, fontSize: 14, maxWidth: 140 }]}>
                  {c.name}
                </Text>
                <Text style={{ color: color.onFg }}>×</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        {book === null ? (
          <ActivityIndicator style={{ marginTop: space[6] }} color={color.fgPrimary} />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(c) => c.key}
            keyboardShouldPersistTaps="handled"
            stickySectionHeadersEnabled={false}
            contentContainerStyle={{ paddingHorizontal: layout.pageGutter, paddingBottom: space[6] }}
            renderSectionHeader={({ section }) => (
              <Text style={styles.sectionLabel}>
                {t(section.key === "favourites" ? "circle.picker.favourites" : "circle.picker.all")}
              </Text>
            )}
            renderItem={({ item, index }) => {
              const already = taken.has(item.phone);
              const on = already || state.picked.includes(item.key);

              return (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled: already }}
                  disabled={already}
                  onPress={() => dispatch({ type: "toggle", key: item.key, room })}
                  style={[styles.pickRow, index > 0 && styles.rowDivider]}
                >
                  <Avatar name={item.name} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[text("body"), { fontWeight: "500", fontSize: 17 }]}>
                      {item.name}
                    </Text>
                    <Text numberOfLines={1} style={[text("caption"), { color: color.fgSecondary }]}>
                      {already ? t("circle.picker.inCircle") : formatPhone(item.phone)}
                    </Text>
                  </View>
                  <View style={[styles.box, on && styles.boxOn, already && { opacity: 0.4 }]}>
                    {on ? <Text style={{ color: color.onFg, fontSize: 14 }}>✓</Text> : null}
                  </View>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={[text("caption"), { color: color.fgSecondary, marginTop: space[5] }]}>
                {state.query.trim() ? t("circle.picker.noMatch", { query: state.query.trim() }) : t("circle.picker.empty")}
              </Text>
            }
          />
        )}
        <View style={styles.modalFoot}>
          {full && picked.length > 0 ? <Note tone="info">{t("circle.picker.full", { max: CIRCLE.max })}</Note> : null}
          {problem ? <ProblemNote problem={problem} /> : null}
          <PrimaryButton
            label={t("circle.picker.add", { count: picked.length })}
            disabled={picked.length === 0}
            busy={busy}
            onPress={() => onAdd(picked.map((c) => ({ name: c.name, phone: c.phone })))}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

interface ManualForm {
  name: string;
  phone: string;
}

/** Typing a name and number, when contacts are refused or the person isn't in them. */
function ManualEntryModal({
  busy,
  problem,
  onAdd,
  onClose,
}: {
  busy: boolean;
  problem: CircleProblem | null;
  onAdd: (person: { name: string; phone: string }) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const defaultValues: ManualForm = { name: "", phone: "" };

  const form = useForm({
    defaultValues,
    onSubmit: ({ value }) => {
      const phone = toE164(value.phone);

      if (phone) onAdd({ name: value.name.trim(), phone });
    },
  });

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modal} edges={["top", "bottom"]}>
        <View style={[styles.modalHead, { marginBottom: 0 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} hitSlop={12}>
            <Icon name="close" size={24} tint={color.fgPrimary} />
          </Pressable>
        </View>
        <View style={{ flex: 1, paddingHorizontal: space[5] }}>
          <Title>{t("circle.manual.title")}</Title>
          <form.Field name="name">
            {(field) => (
              <TextInput
                accessibilityLabel={t("circle.manual.name")}
                value={field.state.value}
                onChangeText={field.handleChange}
                placeholder={t("circle.manual.namePlaceholder")}
                placeholderTextColor={color.fgTertiary}
                maxLength={CIRCLE.nameMax}
                autoFocus
                style={[styles.field, { marginTop: space[6] }]}
              />
            )}
          </form.Field>
          <form.Field name="phone">
            {(field) => (
              <TextInput
                accessibilityLabel={t("circle.manual.phone")}
                value={field.state.value}
                onChangeText={field.handleChange}
                placeholder="0912 345 678"
                placeholderTextColor={color.fgTertiary}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                style={[styles.field, { marginTop: space[3] }]}
              />
            )}
          </form.Field>
          {problem ? <ProblemNote problem={problem} /> : null}
        </View>
        <View style={styles.modalFoot}>
          <form.Subscribe selector={(s) => s.values.name.trim().length > 0 && toE164(s.values.phone) !== null}>
            {(valid) => (
              <PrimaryButton label={t("circle.manual.add")} disabled={!valid} busy={busy} onPress={() => void form.handleSubmit()} />
            )}
          </form.Subscribe>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: space[5],
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: space[4],
  },
  row: { flexDirection: "row", alignItems: "center", gap: space[2], paddingVertical: 11, minHeight: 64 },
  rowDivider: { borderTopWidth: 1, borderStyle: "dashed", borderTopColor: color.divider },
  order: { color: color.fgSecondary, paddingHorizontal: space[1], paddingTop: space[3] },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: space[1],
  },
  scrim: { flex: 1, backgroundColor: "rgba(17,17,17,0.4)" },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space[5],
    paddingTop: space[3],
    paddingBottom: space[2],
  },
  grab: { alignSelf: "center", width: 36, height: 5, borderRadius: 3, backgroundColor: color.track },
  modal: { flex: 1, backgroundColor: color.bgPrimary },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[4],
    height: 56,
    paddingHorizontal: space[5],
    marginBottom: space[2],
  },
  modalFoot: { paddingHorizontal: space[5], paddingBottom: space[2], paddingTop: space[2], gap: space[2] },
  search: {
    marginHorizontal: layout.pageGutter,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingHorizontal: space[4],
    fontSize: 16,
    color: color.fgPrimary,
  },
  chips: { gap: space[2], paddingHorizontal: layout.pageGutter, paddingTop: space[3] },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 32,
    paddingHorizontal: space[3],
    borderRadius: radius.pill,
    backgroundColor: color.surfaceInverse,
  },
  sectionLabel: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "500",
    letterSpacing: 0.78,
    textTransform: "uppercase",
    color: color.fgTertiary,
    marginTop: space[5],
    marginBottom: space[2],
    paddingHorizontal: space[2],
  },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: 11,
    paddingHorizontal: space[4],
    backgroundColor: color.surface,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: color.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: color.blue, borderColor: color.blue },
  field: {
    height: layout.buttonHeight.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingHorizontal: space[4],
    fontSize: 17,
    color: color.fgPrimary,
  },
});
