// Jest setup: in-memory stand-ins for native modules that have no JS implementation in tests.
jest.mock('@react-native-async-storage/async-storage', () =>
  // jest.mock factories are hoisted above imports, so the mock must be loaded with require.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Icons are decorative (hidden from screen readers); in tests they render nothing instead of
// loading the icon font.
jest.mock('@expo/vector-icons/MaterialIcons', () => ({ __esModule: true, default: () => null }));
