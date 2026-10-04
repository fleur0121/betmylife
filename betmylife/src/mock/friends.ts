/**
 * ID検索・QR追加で共通利用するモックユーザー一覧。
 * 自分のIDと初期の友達を固定し、バックエンドなしで追加フローを再現する。
 * API接続時はこの一覧検索をユーザー検索APIへ置き換える。
 */
export const myFriendId = "fuka-0980";
export const friendDirectory = [
  { id: myFriendId, name: "Fuka", avatar: "🌷", color: "#EEE7FC" },
  { id: "noah-1250", name: "Noah", avatar: "🦊", color: "#FFF3D8" },
  { id: "alex-0720", name: "Alex", avatar: "🐻", color: "#FFE8DA" },
  { id: "sarah-0640", name: "Sarah", avatar: "🍀", color: "#E8F5ED" },
  { id: "liam-0580", name: "Liam", avatar: "🐳", color: "#E4EFFC" },
  { id: "mia-0420", name: "Mia", avatar: "🍑", color: "#FCECEF" },
];
export type Friend = (typeof friendDirectory)[number];
export const initialFriendIds = ["alex-0720", "sarah-0640"];
