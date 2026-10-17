import { memo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { DashaPeriod, Graha } from '@astro/shared';
import { Text } from '@/components/ui';
import { t } from '@/i18n/en';
import { MIN_TOUCH, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { useAntardashas } from '@/features/chart/hooks';
import { ReadingError } from '@/features/chart/reading-error';
import { formatInstant, isCurrent, periodYears } from './dates';

const PeriodRow = memo(function PeriodRow({
  period,
  current,
  level,
}: {
  period: DashaPeriod;
  current: boolean;
  level: 'mahadasha' | 'antardasha';
}) {
  const { colors } = useTheme();
  const range = `${formatInstant(period.start)} – ${formatInstant(period.end)}`;
  return (
    <View
      accessible
      accessibilityLabel={[
        period.lord,
        t(`dasha.${level}`),
        range,
        current ? t('dasha.current') : null,
      ]
        .filter(Boolean)
        .join(', ')}
      style={[
        styles.row,
        current && { backgroundColor: colors.surfaceAlt, borderColor: colors.accent },
      ]}
    >
      <View style={styles.rowTitle}>
        <Text variant={level === 'mahadasha' ? 'subheading' : 'label'} style={styles.flex}>
          {period.lord}
        </Text>
        {current && (
          <Text variant="caption" color="accent">
            {t('dasha.now')}
          </Text>
        )}
      </View>
      <Text color="textMuted">{range}</Text>
      {level === 'mahadasha' && (
        <Text variant="caption" color="textMuted">
          {periodYears(period)}
        </Text>
      )}
    </View>
  );
});

function Antardashas({ profileId, md, now }: { profileId: string; md: Graha; now: Date }) {
  const query = useAntardashas(profileId, md);
  if (query.isPending) return <ActivityIndicator accessibilityLabel={t('common.loading')} />;
  if (query.isError)
    return <ReadingError error={query.error} onRetry={() => void query.refetch()} />;
  return (
    <View style={styles.sub}>
      {query.data.antardashas.map((p) => (
        <PeriodRow key={p.start} period={p} current={isCurrent(p, now)} level="antardasha" />
      ))}
    </View>
  );
}

/** Mahadasha timeline; each period expands to its antardashas (fetched on demand). */
export function DashaList({
  profileId,
  periods,
  now = new Date(),
}: {
  profileId: string;
  periods: readonly DashaPeriod[];
  now?: Date;
}) {
  const { colors } = useTheme();
  const current = periods.find((p) => isCurrent(p, now));
  const [open, setOpen] = useState<Graha | null>(current?.lord ?? null);

  return (
    <View style={styles.list}>
      {periods.map((p) => {
        const expanded = open === p.lord;
        return (
          <View
            key={p.lord}
            style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <PeriodRow period={p} current={p === current} level="mahadasha" />
            <Pressable
              onPress={() => setOpen(expanded ? null : p.lord)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`${t(expanded ? 'dasha.hideSub' : 'dasha.showSub')}: ${p.lord}`}
              style={styles.toggle}
              testID={`toggle-${p.lord}`}
            >
              <Text color="primary" variant="label">
                {t(expanded ? 'dasha.hideSub' : 'dasha.showSub')}
              </Text>
            </Pressable>
            {expanded && <Antardashas profileId={profileId} md={p.lord} now={now} />}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  card: { borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, gap: spacing.xs },
  row: {
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 2,
  },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  toggle: { minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: spacing.sm },
  sub: { gap: spacing.xs, paddingLeft: spacing.md },
});
