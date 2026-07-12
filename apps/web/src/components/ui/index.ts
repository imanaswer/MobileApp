/**
 * The web component kit (ADR-UX1 Step 2). One import surface; the legacy
 * `academic/ui.tsx` re-exports this so existing screens keep working while
 * Step 4 migrates them onto these components.
 */
export { Button, type ButtonProps } from "./button";
export {
  Field,
  Input,
  DateField,
  Select,
  SearchInput,
  FormRow,
  FormSection,
  type InputProps,
  type SelectProps,
} from "./fields";
export {
  StatusChip,
  Badge,
  Banner,
  EmptyState,
  ErrorState,
  Skeleton,
  SkeletonText,
  statusTone,
  titleCase,
  type Tone,
} from "./feedback";
export { Card, StatCard } from "./card";
export { Dialog, ConfirmDialog } from "./overlay";
export { ToastProvider, useToast } from "./toast";
export { DataTable, TableToolbar, type Column, type SortState } from "./data-table";
export { PageHeader, Tabs, Avatar, type Tab } from "./layout";
