import { memo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { DashaPeriod, Graha } from '@astro/shared';
import { Icon, Tag, Text } from '@/components/ui';
import { t } from '@/i18n/en';
import { MIN_TOUCH, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { useAntardashas } from '@/features/chart/hooks';
import { BODY_COLOR } from '@/features/chart/north-indian-chart';
import { ABBREVIATIONS } from '@/features/chart/north-indian-layout';
import { ReadingError } from '@/features/chart/reading-error';
import { formatInstant, isCurrent, periodLength, periodYears, yearOf } from './dates';

type Status = 'past' | 'current' | 'future';

function statusOf(period: DashaPeriod, now: Date): Status {
  if (isCurrent(period, now)) return 'current';
  return Date.parse(period.end) <= now.getTime() ? 'past' : 'future';
}

/** The graha's two-letter code in its chart colour, on the saffron chart ground. */
function GrahaBadge({ lord }: { lord: Graha }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: colors.chartBg }]}>
      <Text variant="label" style={{ color: colors[BODY_COLOR[lord]] }}>
        {ABBREVIATIONS[lord]}
      </Text>
    </View>
  );
}

/**
 * The whole Vimshottari cycle as one bar: a segment per Mahadasha in its graha's colour, with a
 * marker at today. Colour is decorative; the list below carries the same information as text.
 */
export function LifetimeBar({
  periods,
  now = new Date(),
}: {
  periods: readonly DashaPeriod[];
  now?: Date;
}) {
  const { colors } = useTheme();
  const first = periods[0];
  const last = periods[periods.length - 1];
  if (!first || !last) return null;
  const start = Date.parse(first.start);
  const span = Date.parse(last.end) - start;
  const at = Math.min(1, Math.max(0, (now.getTime() - start) / span));
  const current = periods.find((p) => isCurrent(p, now));
  const label = [
    `${t('dasha.lifetime')}: ${String(yearOf(first.start))} – ${String(yearOf(last.end))}`,
    current ? `${t('dasha.youAreHere')}: ${current.lord} ${t('dasha.mahadasha')}` : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[styles.lifetime, { backgroundColor: colors.surface, borderColor: colors.hairline }]}
    >
      <View style={styles.lifetimeHead}>
        <Text variant="overline" color="accent">
          {t('dasha.lifetime')}
        </Text>
        <Text variant="caption" color="textMuted">
          {yearOf(first.start)} – {yearOf(last.end)}
        </Text>
      </View>
      <View style={styles.track}>
        {periods.map((p) => (
          <View
            key={p.lord}
            style={{
              flexGrow: Date.parse(p.end) - Date.parse(p.start),
              flexBasis: 0,
              backgroundColor: colors[BODY_COLOR[p.lord]],
              opacity: p === current ? 1 : 0.35,
            }}
          />
        ))}
      </View>
      <View style={styles.markerRow}>
        <View style={[styles.markerLine, { left: `${String(at * 100)}%` }]}>
          <View style={[styles.markerTick, { backgroundColor: colors.text }]} />
        </View>
      </View>
      <Text variant="caption" color="textMuted">
        {t('dasha.youAreHere')} · {now.getFullYear()}
        {current ? ` · ${current.lord} ${t('dasha.mahadasha')}` : ''}
      </Text>
    </View>
  );
}

const SubPeriodRow = memo(function SubPeriodRow({
  period,
  md,
  index,
  current,
}: {
  period: DashaPeriod;
  md: Graha;
  index: number;
  current: boolean;
}) {
  const { colors } = useTheme();
  const range = `${formatInstant(period.start)} – ${formatInstant(period.end)}`;
  return (
    <View
      accessible
      accessibilityLabel={[
        period.lord,
        t('dasha.antardasha'),
        range,
        current ? t('dasha.current') : null,
      ]
        .filter(Boolean)
        .join(', ')}
      style={[styles.subRow, { backgroundColor: current ? colors.accentSoft : colors.surfaceAlt }]}
    >
      <Text variant="caption" color={current ? 'onAccentSoft' : 'textMuted'} style={styles.index}>
        {index}
      </Text>
      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <Text variant="label" color={current ? 'onAccentSoft' : 'text'}>
            {md} · {period.lord}
          </Text>
          {current && <Tag label={t('dasha.now')} />}
        </View>
        <Text variant="caption" color={current ? 'onAccentSoft' : 'textMuted'}>
          {range}
        </Text>
      </View>
      <Text variant="caption" color={current ? 'onAccentSoft' : 'textMuted'}>
        {periodLength(period)}
      </Text>
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
      {query.data.antardashas.map((p, i) => (
        <SubPeriodRow key={p.start} period={p} md={md} index={i + 1} current={isCurrent(p, now)} />
      ))}
    </View>
  );
}

const MahadashaCard = memo(function MahadashaCard({
  profileId,
  period,
  status,
  expanded,
  onToggle,
  now,
}: {
  profileId: string;
  period: DashaPeriod;
  status: Status;
  expanded: boolean;
  onToggle: () => void;
  now: Date;
}) {
  const { colors } = useTheme();
  const range = `${formatInstant(period.start)} – ${formatInstant(period.end)}`;
  const current = status === 'current';
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: current ? colors.accent : colors.hairline,
          borderWidth: current ? 2 : 1,
        },
      ]}
    >
      <View
        accessible
        accessibilityLabel={[
          period.lord,
          t('dasha.mahadasha'),
          range,
          current ? t('dasha.current') : null,
        ]
          .filter(Boolean)
          .join(', ')}
        style={styles.head}
      >
        <GrahaBadge lord={period.lord} />
        <View style={styles.flex}>
          <View style={styles.titleRow}>
            <Text variant="subheading">{period.lord}</Text>
            {current ? (
              <Tag label={t('dasha.now')} />
            ) : (
              <Tag
                label={t(status === 'past' ? 'dasha.completed' : 'dasha.upcoming')}
                tone="primary"
              />
            )}
          </View>
          <Text variant="caption" color="textMuted">
            {t('dasha.mahadasha')} · {range} · {periodYears(period)}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${t(expanded ? 'dasha.hideSub' : 'dasha.showSub')}: ${period.lord}`}
        style={styles.toggle}
        testID={`toggle-${period.lord}`}
      >
        <Text color="primary" variant="label">
          {t('dasha.subPeriods')}
        </Text>
        <Icon name={expanded ? 'expand-less' : 'expand-more'} color="primary" />
      </Pressable>
      {expanded && <Antardashas profileId={profileId} md={period.lord} now={now} />}
    </View>
  );
});

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
  const current = periods.find((p) => isCurrent(p, now));
  const [open, setOpen] = useState<Graha | null>(current?.lord ?? null);
  return (
    <View style={styles.list}>
      {periods.map((p) => (
        <MahadashaCard
          key={p.lord}
          profileId={profileId}
          period={p}
          status={statusOf(p, now)}
          expanded={open === p.lord}
          onToggle={() => setOpen(open === p.lord ? null : p.lord)}
          now={now}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: spacing.sm },
  card: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggle: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  sub: { gap: spacing.xs },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  index: { width: 18, textAlign: 'center' },
  lifetime: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  lifetimeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  track: { flexDirection: 'row', height: 12, borderRadius: radius.pill, overflow: 'hidden' },
  markerRow: { height: 10 },
  markerLine: { position: 'absolute', top: 0, marginLeft: -1 },
  markerTick: { width: 2, height: 10, borderRadius: 1 },
});
