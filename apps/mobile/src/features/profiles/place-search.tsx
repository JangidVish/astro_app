import { memo, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { Place } from '@astro/shared';
import { Button, TextField } from '@/components/form';
import { Text } from '@/components/ui';
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
        {
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
        },
      ]}
    >
      <Text>{label}</Text>
      <Text variant="caption" color="textMuted">
        {place.timezoneId}
      </Text>
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
      <View style={styles.selected}>
        <Text variant="label">{t('profile.place')}</Text>
        <Text>
          {value.name}, {value.countryCode}
        </Text>
        <Text variant="caption" color="textMuted">
          {value.timezoneId}
        </Text>
        {error ? (
          <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <Button label={t('profile.change')} variant="link" onPress={() => onChange(null)} />
      </View>
    );
  }

  const places = search.data?.places ?? [];
  return (
    <View style={styles.selected}>
      <TextField
        label={t('profile.place')}
        placeholder={t('profile.placeSearch')}
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
      {places.map((place) => (
        <PlaceOption key={place.placeId} place={place} onPick={onChange} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  selected: { gap: spacing.xs },
  option: {
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
});
