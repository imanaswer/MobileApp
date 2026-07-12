import type { ReactNode } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { Button } from "./button";

/**
 * BottomSheet (ADR-UX1, mobile) — the modal surface. Backdrop scrim (dismiss on
 * tap), slides from the trigger source, radius 16 top corners.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-neutral-900/50" onPress={onClose}>
        <Pressable className="gap-4 rounded-t-xl bg-card p-6" onPress={(e) => e.stopPropagation()}>
          {title ? <Text className="font-sans text-title text-neutral-900">{title}</Text> : null}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Destructive confirm — repeats the object's NAME (ADR-UX1 §component-kit). */
export function ConfirmDialog({
  visible,
  title,
  objectName,
  message,
  confirmLabel = "Delete",
  busy,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  objectName?: string;
  message?: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onCancel} title={title}>
      <Text className="font-sans text-sm text-neutral-600">
        {message ?? "This action can’t be undone."}
        {objectName ? (
          <Text className="font-sans font-semibold text-neutral-900"> {objectName}</Text>
        ) : null}
      </Text>
      <View className="flex-row justify-end gap-2">
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
        <Button label={confirmLabel} variant="destructive" loading={busy} onPress={onConfirm} />
      </View>
    </BottomSheet>
  );
}
