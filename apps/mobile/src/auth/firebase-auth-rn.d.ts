// The Firebase JS SDK's React Native build exports getReactNativePersistence (Metro resolves the
// package's "react-native" entry at runtime), but its published typings describe the web build.
// This augmentation declares the React Native export so TypeScript knows it exists.
import type { Persistence } from 'firebase/auth';

declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  }): Persistence;
}
