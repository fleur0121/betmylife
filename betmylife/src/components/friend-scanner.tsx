/**
 * 友達QRを読み取るカメラ領域。ユーザー操作後にだけカメラ権限を要求する。
 * 1回読み取ったらカメラを停止し、追加の確認は親画面に任せる。
 * 画面離脱・アプリのバックグラウンド移行時にも停止し、拒否や起動失敗時はID追加を案内する。
 */
import { palette as c } from "@/constants/design";
import * as Camera from "expo-camera";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform, View } from "react-native";
import { Text } from "./localized-text";
import { Button, s } from "./ui-kit";
export function FriendScanner({
  onScan,
}: {
  onScan: (payload: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const focused = useRef(true);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
        setActive(false);
      };
    }, []),
  );
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") setActive(false);
    });
    return () => listener.remove();
  }, []);
  async function start() {
    setPending(true);
    setError("");
    try {
      const result = permission?.granted
        ? permission
        : await requestPermission();
      if (!focused.current) return;
      if (result.granted) {
        locked.current = false;
        setActive(true);
      } else
        setError(
          "Camera permission was denied. Enable it in settings or add by ID.",
        );
    } catch {
      setError("Camera unavailable. Try another device or add by ID.");
    } finally {
      setPending(false);
    }
  }
  async function pickScreenshot() {
    setError("");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
    });
    if (result.canceled) return;
    try {
      const codes = await Camera.scanFromURLAsync(result.assets[0].uri, ["qr"]);
      const data = codes[0]?.data;
      if (data) onScan(data);
      else setError("No QR code found in this image.");
    } catch {
      setError("Could not read this image. Try a clearer QR screenshot.");
    }
  }
  return (
    <View style={{ gap: 16 }}>
      <Text style={s.muted}>
        {active
          ? "Point the camera at your friend’s QR."
          : "Camera access is needed to scan a friend’s QR code."}
      </Text>
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: c.red }}>
          {error}
        </Text>
      )}
      {active && (
        <CameraView
          style={{ height: 270, borderRadius: 16 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={({ data }) => {
            if (locked.current) return;
            locked.current = true;
            setActive(false);
            onScan(data);
          }}
          onMountError={() => {
            setActive(false);
            setError("Camera unavailable. Try another device or add by ID.");
          }}
        />
      )}
      <Button
        disabled={pending}
        label={active ? "Stop camera" : "Start camera"}
        onPress={() => (active ? setActive(false) : void start())}
      />
      <Button
        secondary
        label="Read QR from screenshot"
        onPress={() => void pickScreenshot()}
      />
      {permission &&
        !permission.granted &&
        !permission.canAskAgain &&
        Platform.OS !== "web" && (
          <Button
            secondary
            label="Open settings"
            onPress={() => {
              void Linking.openSettings().catch(() =>
                setError(
                  "Camera unavailable. Try another device or add by ID.",
                ),
              );
            }}
          />
        )}
    </View>
  );
}
