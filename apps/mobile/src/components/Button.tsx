/** Simple text button with an optional icon, in three styles. */

import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius } from '../ui/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface Props {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: 'primary' | 'secondary' | 'ghost';
  readonly icon?: IconName;
  readonly disabled?: boolean;
  readonly compact?: boolean;
  /** Icon above a small label (for toolbars). */
  readonly stacked?: boolean;
  /** Name read by screen readers, required for icon-only buttons. */
  readonly accessibilityLabel?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  compact,
  stacked,
  accessibilityLabel,
}: Props) {
  const color = variant === 'primary' ? colors.primaryText : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        compact && styles.compact,
        stacked && styles.stacked,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {icon && <Ionicons name={icon} size={compact ? 18 : 20} color={color} />}
      {label !== '' && (
        <Text
          style={[
            styles.label,
            { color },
            compact && styles.compactLabel,
            stacked && styles.stackedLabel,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.medium,
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  ghost: { backgroundColor: 'transparent' },
  compact: { paddingHorizontal: 10, paddingVertical: 10 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
  label: { fontSize: 16, fontWeight: '600' },
  compactLabel: { fontSize: 14 },
  stacked: { flexDirection: 'column', gap: 2, paddingHorizontal: 2, paddingVertical: 8 },
  stackedLabel: { fontSize: 12 },
});
