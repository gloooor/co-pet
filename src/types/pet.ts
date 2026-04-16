export type PetStats = {
  hunger: number; // 0..100 (lower is better)
  happiness: number; // 0..100
  energy: number; // 0..100
};

export type RoomUser = {
  id: string;
  name: string;
  joinedAt: number;
};

export type RoomState = {
  id: string;
  createdAt: number;
  updatedAt: number;
  petName: string;
  petMood: "happy" | "ok" | "tired" | "grumpy";
  stats: PetStats;
  users: RoomUser[]; // max 2
  lastEvent?: { at: number; text: string };
};

export type ClientIdentity = {
  roomId: string;
  userId: string;
  userName: string;
};

export type PetAction = "feed" | "play" | "rest";
