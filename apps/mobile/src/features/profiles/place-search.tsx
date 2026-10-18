import { memo, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { Place } from '@astro/shared';
import { Button, TextField } from '@/components/form';
import { Card, Icon, IconTile, Text } from '@/components/ui';
import { t } from '@/i18n/en';
import { MIN_TOUCH, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { usePlaceSearch } from './hooks';

const DEBOUNCE_MS = 400;

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [value, ms]);
  return debounced;
}

const PlaceOption = memo(function PlaceOption({
  place,
  onPick,
}: {
  place: Place;
  onPick: (place: Place) => void;
}) {
  const { colors } = useTheme();
  const label = `${place.name}, ${place.countryCode}`;
  return (
    <Pressable
      onPress={() => onPick(place)}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${place.timezoneId}`}
      style={({ pressed }) => [
        styles.option,
        { backgroundColor: pressed ? colors.surfaceAlt : 'transparent' },
      ]}
    >
      <Icon name="place" color="accent" />
      <View style={styles.flex}>
        <Text variant="label">{label}</Text>
        <Text variant="caption" color="textMuted">
          {place.timezoneId}
        </Text>
      </View>
    </Pressable>
  );
});

export interface PlaceSearchProps {
  value: Place | null;
  onChange: (place: Place | null) => void;
  error?: string | null;
}

/** Search-as-you-type (≥ 3 characters, debounced). Only places from results can be chosen. */
export function PlaceSearch({ value, onChange, error }: PlaceSearchProps) {
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, DEBOUNCE_MS);
  const search = usePlaceSearch(debounced);

  if (value) {
    return (
      <View style={styles.group}>
        <Text variant="label">{t('profile.place')}</Text>
        <Card style={styles.chosen}>
          <IconTile name="location-city" />
          <View style={styles.flex}>
            <Text variant="label">
              {value.name}, {value.countryCode}
            </Text>
            <Text variant="caption" color="textMuted">
              {value.timezoneId}
            </Text>
          </View>
          <Button label={t('profile.change')} variant="link" onPress={() => onChange(null)} />
        </Card>
        {error ? (
          <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>
    );
  }
  const places = search.data?.places ?? [];
  return (
    <View style={styles.group}>
      <TextField
        label={t('profile.place')}
        placeholder={t('profile.placeSearch')}
        icon="search"
        value={query}
        onChangeText={setQuery}
        error={error ?? null}
        autoCorrect={false}
        testID="place-query"
      />
      {search.isFetching && <ActivityIndicator accessibilityLabel={t('common.loading')} />}
      {search.isError && <Text color="danger">{t('common.offline')}</Text>}
      {search.isSuccess && places.length === 0 && (
        <Text color="textMuted" accessibilityLiveRegion="polite">
          {t('profile.placeNoResults')}
        </Text>
      )}
      {places.length > 0 && (
        <Card style={styles.results}>
          {places.map((place) => (
            <PlaceOption key={place.placeId} place={place} onPick={onChange} />
          ))}
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  flex: { flex: 1 },
  chosen: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  results: { padding: spacing.xs, gap: 0 },
  option: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.md,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
