import type { ReactNode } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";

/**
 * Form fields (ADR-UX1, mobile). Label above, required asterisk, helper/inline
 * error, ≥44pt height, correct keyboardType. `Field` gives every control the
 * same rhythm; FormRow/FormSection standardize form spacing.
 */
export function Field({
  label,
  required,
  helper,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-1">
      <Text className="font-sans text-sm font-medium text-neutral-800">
        {label}
        {required ? <Text className="font-sans text-danger-600"> *</Text> : null}
      </Text>
      {children}
      {error ? (
        <Text className="font-sans text-caption text-danger-600">{error}</Text>
      ) : helper ? (
        <Text className="font-sans text-caption text-neutral-500">{helper}</Text>
      ) : null}
    </View>
  );
}

export interface TextFieldProps extends TextInputProps {
  label: string;
  required?: boolean;
  helper?: string;
  error?: string;
}

export function TextField({ label, required, helper, error, ...props }: TextFieldProps) {
  return (
    <Field label={label} required={required} helper={helper} error={error}>
      <TextInput
        placeholderTextColor="#A8A29E"
        className={`min-h-11 rounded-md border bg-white px-3 text-body text-neutral-800 ${
          error ? "border-danger-500" : "border-neutral-300"
        }`}
        {...props}
      />
    </Field>
  );
}

export function FormRow({ children }: { children: ReactNode }) {
  return <View className="gap-4">{children}</View>;
}

export function FormSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View className="gap-4">
      {title ? <Text className="font-sans text-title text-neutral-800">{title}</Text> : null}
      {children}
    </View>
  );
}
