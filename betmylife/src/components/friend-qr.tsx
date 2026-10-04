/**
 * 友達IDを実際に読み取り可能なQRへ変換して表示する。
 * QR生成は端末内で完結し、外部のQR生成サービスにIDを送らない。
 * qrcode-generatorのモジュール行列をViewで描画し、周囲に4セルの余白を確保する。
 */
import { useMemo } from 'react';
import { View, useWindowDimensions } from 'react-native';
import createQRCode from 'qrcode-generator';
import { encodeFriendQR } from '@/utils/friend-id';
export function FriendQR({ id }: { id: string }) {
  const rows = useMemo(() => {
    const qr = createQRCode(0, 'M');
    qr.addData(encodeFriendQR(id));
    qr.make();
    const count = qr.getModuleCount();
    return Array.from({ length: count }, (_, row) =>
      Array.from({ length: count }, (_, col) => qr.isDark(row, col)),
    );
  }, [id]);
  const { width } = useWindowDimensions();
  const cell = Math.max(
    2,
    Math.min(6, Math.floor((width - 96) / (rows.length + 8))),
  );
  return (
    <View
      accessible
      accessibilityLabel={`QR: ${id}`}
      style={{
        padding: cell * 4,
        backgroundColor: '#FFFFFF',
        alignSelf: 'center',
      }}
    >
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row' }}>
          {row.map((dark, j) => (
            <View
              key={j}
              style={{
                width: cell,
                height: cell,
                backgroundColor: dark ? '#000000' : '#FFFFFF',
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
