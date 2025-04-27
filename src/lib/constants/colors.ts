// Define a consistent color palette for the entire application
export const PLAYER_COLORS = [
  { start: '#D4AF37', end: '#AA8B2F' },  // Rich gold
  { start: '#1E3F66', end: '#0D1B2A' },  // Deep navy
  { start: '#8B0000', end: '#660000' },  // Dark red
  { start: '#006400', end: '#004D00' },  // Forest green
  { start: '#4B0082', end: '#2E004D' },  // Royal purple
  { start: '#B8860B', end: '#8B6508' },  // Dark goldenrod
  { start: '#191970', end: '#0F0F4D' },  // Midnight blue
  { start: '#800000', end: '#4D0000' },  // Maroon
  { start: '#2F4F4F', end: '#1C2F2F' },  // Dark slate
  { start: '#483D8B', end: '#2B2452' },  // Dark slate blue
];

// Store player colors in memory
const playerColorMap = new Map<string, number>();

export const getPlayerColor = (playerId: string): { start: string; end: string } => {
  // Check if player already has an assigned color
  let colorIndex = playerColorMap.get(playerId);
  
  if (colorIndex === undefined) {
    // Assign new color based on current map size
    colorIndex = playerColorMap.size % PLAYER_COLORS.length;
    playerColorMap.set(playerId, colorIndex);
  }
  
  return PLAYER_COLORS[colorIndex];
};

export const getPlayerBaseColor = (playerId: string): string => {
  return getPlayerColor(playerId).start;
}; 