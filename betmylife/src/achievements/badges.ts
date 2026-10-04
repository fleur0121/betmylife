import { BADGE_ARTWORK } from "./badge-assets";
import { BADGE_METADATA } from "./badge-metadata";

export const BADGES = BADGE_METADATA.map((badge) => ({
  ...badge,
  ...BADGE_ARTWORK[badge.id],
}));

export const BADGE_BY_ID = Object.fromEntries(BADGES.map((badge) => [badge.id, badge]));
