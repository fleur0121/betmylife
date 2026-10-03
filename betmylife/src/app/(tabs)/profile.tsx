/**
 * SNSで見慣れたカバー・アバター・ID・自己紹介の順で見せるプロフィール。
 * 概要と自分の投稿をタブで切り替え、友達・分析・カスタマイズへ直接移動できる。
 * 購入済みアイテムの装備とモック実績の表示は共有状態を利用する。
 */
import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/localized-text';
import {
  Avatar,
  Button,
  Card,
  Pill,
  Screen,
  SectionHeader,
  StatCard,
  s,
} from '@/components/ui-kit';
import { FeedTabs } from '@/components/feed-tabs';
import { ChallengeCard } from '@/components/challenge-card';
import { currentUser as user, rewards, type CosmeticSlot } from '@/mock/data';
import { myFriendId } from '@/mock/friends';
import { useAppState } from '@/state/app-state';
import { palette as c } from '@/constants/design';
export default function Profile() {
  const { state, dispatch } = useAppState();
  const [tab, setTab] = useState('Overview');
  const slots: CosmeticSlot[] = ['Frame', 'Badge', 'Background', 'Title'];
  const owned = rewards.filter((item) => state.owned.includes(item.id));
  const posts = state.challenges.filter(
    (challenge) => challenge.user === user.name,
  );
  return (
    <Screen title="Profile">
      <View style={styles.profile}>
        <View
          style={[
            styles.cover,
            state.equipped.Background === 'Galaxy Background' && {
              backgroundColor: '#D8CEF0',
            },
          ]}
        >
          <Text style={styles.stars}>
            {state.equipped.Background === 'Galaxy Background'
              ? '✧     🪐     ✦'
              : '✧      ✦      ✧'}
          </Text>
        </View>
        <View style={styles.identity}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarBorder}>
              <Avatar
                emoji={user.avatar}
                frameColor={
                  state.equipped.Frame === 'Fire Frame'
                    ? '#EAA06C'
                    : state.equipped.Frame === 'Purple Aura Frame'
                      ? c.primary
                      : '#B29BDF'
                }
                size={80}
                framed
              />
            </View>
            <Button
              secondary
              label="Add friends"
              onPress={() => router.push('/friends')}
            />
          </View>
          <Text translate={false} style={styles.name}>
            {user.name}
          </Text>
          <Text translate={false} style={s.muted}>
            @{myFriendId}
          </Text>
          <View style={styles.badges}>
            <Pill>✦ {state.equipped.Title}</Pill>
            <Pill tone="green">
              {state.equipped.Badge === 'Gold Crown'
                ? '👑 Gold Crown'
                : '🌟 Rising Star'}
            </Pill>
          </View>
          <Text style={s.body}>
            Making little promises. Keeping big dreams.
          </Text>
          <View style={styles.meta}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/friends')}
              style={({ pressed }) => [styles.metaLink, pressed && s.pressed]}
            >
              <Text style={s.bold}>{state.friendIds.length} friends</Text>
            </Pressable>
            <Text style={s.muted}>{user.points} PT this week</Text>
          </View>
        </View>
      </View>
      <FeedTabs
        options={['Overview', 'My challenges']}
        value={tab}
        onChange={setTab}
      />
      {tab === 'My challenges' ? (
        <View style={styles.posts}>
          {posts.map((challenge) => (
            <ChallengeCard key={challenge.id} challenge={challenge} />
          ))}
          {!posts.length && (
            <Card>
              <Text style={s.muted}>No challenges here yet</Text>
              <Button
                label="Post a challenge"
                onPress={() => router.push('/create')}
              />
            </Card>
          )}
        </View>
      ) : (
        <>
          <Card>
            <View style={s.row}>
              <StatCard value={`${user.accuracy}%`} label="Accuracy" />
              <StatCard value={`${user.streak} days`} label="Streak" />
              <StatCard value={`${user.completed}`} label="Completed" />
            </View>
          </Card>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/habit-dna')}
            style={({ pressed }) => [styles.dna, pressed && s.pressed]}
          >
            <Text style={{ fontSize: 28 }}>🧬</Text>
            <View style={s.flex}>
              <Text style={s.sectionTitle}>Habit DNA</Text>
              <Text style={s.caption}>See your habits and success rates</Text>
            </View>
            <Text style={{ color: c.primary, fontSize: 22 }}>→</Text>
          </Pressable>
          <SectionHeader title="Profile style" detail="EQUIPPED" />
          <Card>
            {slots.map((slot, index) => (
              <View key={slot} style={[s.between, index > 0 && styles.divider]}>
                <Text style={s.muted}>{slot}</Text>
                <Text style={[s.bold, { flex: 1, textAlign: 'right' }]}>
                  {state.equipped[slot]}
                </Text>
              </View>
            ))}
          </Card>
          {owned.length > 0 && (
            <>
              <SectionHeader title="Your reward collection" />
              <Card>
                {owned.map((item) => (
                  <View key={item.id} style={s.row}>
                    <Text style={{ fontSize: 23 }}>{item.emoji}</Text>
                    <Text style={[s.body, s.flex]}>{item.name}</Text>
                    <Button
                      secondary
                      label={
                        state.equipped[item.slot] === item.name
                          ? 'Equipped'
                          : 'Equip'
                      }
                      disabled={state.equipped[item.slot] === item.name}
                      onPress={() => dispatch({ type: 'equip', id: item.id })}
                    />
                  </View>
                ))}
              </Card>
            </>
          )}
          <Button
            secondary
            label="Browse rewards →"
            onPress={() => router.push('/shop')}
          />
        </>
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  profile: {
    backgroundColor: c.card,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: c.border,
  },
  cover: {
    height: 96,
    backgroundColor: c.lavender,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
  },
  stars: { fontSize: 38, color: '#B29BDF', letterSpacing: 8 },
  identity: { gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  avatarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: -30,
    marginBottom: 4,
  },
  avatarBorder: { padding: 4, backgroundColor: c.card, borderRadius: 50 },
  name: { fontSize: 24, fontWeight: '800', color: c.text },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 4 },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 16,
  },
  metaLink: { minHeight: 44, justifyContent: 'center' },
  dna: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
    borderRadius: 16,
    backgroundColor: c.lavenderLight,
    borderWidth: 1,
    borderColor: c.border,
  },
  divider: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 16 },
  posts: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: c.border,
  },
});
