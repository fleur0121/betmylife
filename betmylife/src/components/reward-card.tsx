/**
 * Shopの商品カード。プレビュー、名前、必要ポイント、購入ボタンを表示する。
 * 所有済み・残高不足の場合はボタンを無効にし、状態に応じたラベルへ切り替える。
 * 購入処理そのものは持たず、操作時に呼び出し元のonBuyを実行する。
 */
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/localized-text';
import { Button, s } from './ui-kit';
import type { Reward } from '@/mock/data';
import { palette as c } from '@/constants/design';
import { BrandAsset } from '@/components/brand-asset';
export function RewardCard({
  reward,
  owned,
  affordable,
  onBuy,
}: {
  reward: Reward;
  owned: boolean;
  affordable: boolean;
  onBuy: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={[styles.preview, { backgroundColor: reward.color }]}>
        <BrandAsset name={reward.asset} style={styles.previewArt} label={reward.name} />
        <Text style={styles.previewLabel}>{reward.slot.toUpperCase()}</Text>
      </View>
      <View style={styles.details}>
        <Text style={[s.bold, { minHeight: 38, fontSize: 14 }]}>
          {reward.name}
        </Text>
        <Text style={[s.caption, { color: c.primaryDark, fontWeight: '800' }]}>
          ✦ {reward.price.toLocaleString()} PT
        </Text>
        <Button
          label={owned ? '✓ Owned' : affordable ? 'Buy' : 'Need more PT'}
          secondary={owned}
          disabled={owned || !affordable}
          onPress={onBuy}
        />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 20,
    overflow: 'hidden',
    maxWidth: '49%',
  },
  preview: {
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  previewLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: c.primaryDark,
  },
  previewArt: { width: 102, height: 100 },
  details: { padding: 13, gap: 12 },
});
