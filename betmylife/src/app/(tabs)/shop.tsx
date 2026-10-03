/**
 * リワード購入画面。共有状態のウォレット残高と購入済みアイテムを表示する。
 * 全商品／購入済みを切り替え、購入時はbuyアクションで残高と所有状態をまとめて更新する。
 * 購入したアイテムはProfileから装備できる。ポイントや購入結果はメモリ内のみで保持する。
 */
import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/localized-text';
import { router } from 'expo-router';
import {
  Button,
  Card,
  PageHeading,
  Screen,
  SectionHeader,
  Segments,
  s,
} from '@/components/ui-kit';
import { RewardCard } from '@/components/reward-card';
import { rewards } from '@/mock/data';
import { useAppState } from '@/state/app-state';
import { palette as c } from '@/constants/design';
export default function Shop() {
  const { state, dispatch } = useAppState();
  const [filter, setFilter] = useState('All rewards');
  const [message, setMessage] = useState('');
  const items = rewards.filter(
    (item) => filter === 'All rewards' || state.owned.includes(item.id),
  );
  return (
    <Screen title="Shop">
      <PageHeading
        title="Rewards shop"
        subtitle="Use points to personalize your profile."
      />
      <Card style={{ backgroundColor: c.primary, borderColor: c.primary }}>
        <Text style={{ color: '#E6DAFF', fontSize: 12 }}>
          YOUR POINTS WALLET
        </Text>
        <View style={s.between}>
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: c.card, fontSize: 36, fontWeight: '800' }}
          >
            ✦ {state.wallet.toLocaleString()}{' '}
            <Text style={{ fontSize: 17 }}>PT</Text>
          </Text>
          <Text style={{ fontSize: 38 }}>🎁</Text>
        </View>
        <Text style={{ color: '#E6DAFF', fontSize: 12 }}>
          Earn by showing up. Spend on standing out.
        </Text>
      </Card>
      <Segments
        options={['All rewards', 'Owned']}
        value={filter}
        onChange={setFilter}
      />
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={{ color: c.green }}>
          {message}
        </Text>
      )}
      <SectionHeader
        title={
          filter === 'Owned'
            ? 'Your collection'
            : 'Made for your main character era'
        }
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {items.map((reward) => (
          <RewardCard
            key={reward.id}
            reward={reward}
            owned={state.owned.includes(reward.id)}
            affordable={state.wallet >= reward.price}
            onBuy={() => {
              dispatch({ type: 'buy', id: reward.id });
              setMessage(
                `${reward.name} is yours! Equip it from your profile.`,
              );
            }}
          />
        ))}
      </View>
      {!items.length && (
        <Card>
          <Text style={s.sectionTitle}>Your collection is waiting ✨</Text>
          <Text style={s.muted}>
            Pick something that feels like you. Your rewards will appear here.
          </Text>
        </Card>
      )}
      <Button
        secondary
        label="Customize my profile →"
        onPress={() => router.push('/profile')}
      />
      <Text style={[s.caption, { textAlign: 'center' }]}>
        Just for fun. Points have no cash value.
      </Text>
    </Screen>
  );
}
