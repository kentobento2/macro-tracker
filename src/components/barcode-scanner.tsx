import { View } from 'react-native';

import { Space } from '@/constants/theme';

import { AppText, Button } from './ui';

// Native camera scanning isn't wired up (the app ships as a PWA). The web version lives in barcode-scanner.web.tsx.
export function BarcodeScanner({ onCancel }: { onDetected: (code: string) => void; onCancel: () => void }) {
  return (
    <View style={{ gap: Space.md }}>
      <AppText variant="muted">Camera scanning is available in the web app. Type the barcode number instead.</AppText>
      <Button title="Cancel" variant="secondary" onPress={onCancel} />
    </View>
  );
}
