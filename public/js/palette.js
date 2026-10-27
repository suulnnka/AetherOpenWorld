// Low Poly 北京 — 全局调色板(十六进制,sRGB)

export const C = {
  // 地面 / 道路
  grass: 0x8fbf5e,
  grassDark: 0x79a94e,
  dirt: 0xb99e6f,
  rock: 0x8d8a84,
  snow: 0xe8ecef,
  asphalt: 0x474c54,
  asphaltDark: 0x3b4048,
  roadLine: 0xd8d8d2,
  sidewalk: 0xb9bdc4,
  curb: 0x9b9fa6,
  concrete: 0xc9cbd0,

  // 水体
  water: 0x4f8fd0,
  waterDeep: 0x3d77b8,
  shore: 0xcbb98a,

  // 建筑
  wallBeige: 0xcfc4b0,
  wallCream: 0xd8d0bf,
  wallGray: 0xb7bcc2,
  wallBlue: 0xa9c0cc,
  wallTeal: 0x8fb7c9,
  wallBrick: 0xc47b58,
  wallStone: 0x8f8a80,
  wallRedBrown: 0xa05c4a,
  glassDark: 0x6f93aa,
  glassTeal: 0x6ba7bf,
  trim: 0xe3e7ea,
  roofDark: 0x565b63,
  roofRedBrown: 0x8a4a42,
  roofSlate: 0x4f5a66,

  // 中式建筑
  redWall: 0x9e2b25,
  redWallDark: 0x821f1a,
  goldRoof: 0xe8b33a,
  goldRoofDeep: 0xc9932a,
  blueRoof: 0x3f6fb5,
  whiteMarble: 0xece9e2,
  woodBrown: 0x7a5230,

  // 树木
  trunk: 0x6b4a34,
  leaf1: 0x4e7a3a,
  leaf2: 0x5d8a44,
  leaf3: 0x6f9c4b,
  leaf4: 0x87a94f,
  leafGold: 0xd9a83c,
  leafWillow: 0x7fa656,

  // 杂项
  flowerPink: 0xe58fb1,
  flowerRed: 0xd9503f,
  flowerYellow: 0xe8c44a,
  flowerWhite: 0xeef0ef,
  flagRed: 0xde2910,
  steel: 0xb9c2c9,
  steelDark: 0x8a949c,
  silver: 0xd7dde2,

  // 天空
  skyTop: 0x6fa8dc,
  skyHorizon: 0xdcebf2,
  fog: 0xc6d8e4,
};

// 建筑外墙配色池(按风格)
export const WALL_POOLS = {
  hutong: [0xb9a894, 0xada08c, 0x8f8a80, 0xa89880, 0xc2b49e],
  oldcity: [0xcfc4b0, 0xc9b9a0, 0xc47b58, 0xb5c0c9, 0xd8d0bf, 0xa3a69e],
  modern: [0x9fb6c8, 0xa8bcc4, 0x8fa8b8, 0xc5cdd2, 0xb0b9be, 0x93a8b0],
  tower: [0x7e9fb5, 0x93b0bd, 0x6d8fa6, 0xa4bcc8, 0x87a5b5],
  cbd: [0x6fa3b8, 0x5f8fb0, 0x88b7c9, 0x74a8c0, 0x6a9cc4],
};

export const ROOF_POOLS = {
  hutong: [0x6d6459, 0x8a4a42, 0x5c554c, 0x77503f],
  oldcity: [0x565b63, 0x4f5a66, 0x6a5f52],
};
