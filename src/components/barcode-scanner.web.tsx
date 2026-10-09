import { BarcodeFormat, BrowserMultiFormatOneDReader, type IScannerControls } from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Radius, Space } from '@/constants/theme';

import { AppText, Button } from './ui';

const FORMATS = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E];

/** Camera barcode scanner for the web (iPhone Safari, Android Chrome). Needs HTTPS or localhost. */
export function BarcodeScanner({ onDetected, onCancel }: { onDetected: (code: string) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  const [startError, setStartError] = useState<string | null>(null);
  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  const error = supported
    ? startError
    : 'Camera access needs a secure (https) connection. Type the barcode number instead.';

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !supported) return;

    const reader = new BrowserMultiFormatOneDReader(new Map([[DecodeHintType.POSSIBLE_FORMATS, FORMATS]]));
    let controls: IScannerControls | undefined;
    let stopped = false;
    let detected = false;

    reader
      .decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, video, (result, _err, c) => {
        if (!result || detected) return;
        detected = true;
        c.stop();
        onDetectedRef.current(result.getText());
      })
      .then((c) => {
        controls = c;
        if (stopped) c.stop();
      })
      .catch((e: unknown) => {
        const name = e instanceof Error ? e.name : '';
        setStartError(
          name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow camera access in your browser settings, or type the barcode.'
            : "Couldn't start the camera. Type the barcode number instead."
        );
      });

    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [supported]);

  return (
    <View style={styles.wrap}>
      {error ? (
        <AppText variant="muted">{error}</AppText>
      ) : (
        <View style={styles.viewport}>
          <video ref={videoRef} playsInline muted autoPlay style={videoStyle} />
          <View pointerEvents="none" style={styles.guide} />
        </View>
      )}
      {!error ? <AppText variant="small">Point the camera at the barcode.</AppText> : null}
      <Button title="Cancel" variant="secondary" onPress={onCancel} />
    </View>
  );
}

const videoStyle = { width: '100%', height: '100%', objectFit: 'cover' } as const;

const styles = StyleSheet.create({
  wrap: { gap: Space.md },
  viewport: { width: '100%', aspectRatio: 4 / 3, borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: '#000' },
  guide: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    top: '35%',
    bottom: '35%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: Radius.md,
  },
});
