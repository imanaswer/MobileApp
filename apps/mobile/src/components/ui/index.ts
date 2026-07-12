/**
 * The mobile component kit (ADR-UX1 Step 2b). NativeWind + @expo/vector-icons
 * (Feather ≈ Lucide), consuming the same tokens as web. Screens migrate onto
 * these in Step 4.
 */
export { Button } from "./button";
export { Field, TextField, FormRow, FormSection, type TextFieldProps } from "./fields";
export {
  StatusChip,
  Badge,
  Banner,
  EmptyState,
  ErrorState,
  Skeleton,
  statusTone,
  titleCase,
  type Tone,
} from "./feedback";
export { Card, StatCard } from "./card";
export { Avatar, ListRow } from "./list-row";
export { BottomSheet, ConfirmDialog } from "./sheet";
export { ToastProvider, useToast } from "./toast";
export { ScreenScaffold, SegmentedControl } from "./scaffold";
