import { useSpinGame } from '../../lib/solana/SpinGameContext';

export function Sidebar() {
  const { currentRound } = useSpinGame();
  
  const renderPlayers = () => {
    if (!currentRound) {
      console.log("Cannot render players: No current round data");
      return <div className="no-players">No active round</div>;
    }

    console.log("Rendering players from round:", currentRound);
    const players = Object.values(currentRound.players || {});
    console.log(`Found ${players.length} players in the current round`);
    
    if (players.length === 0) {
      return <div className="no-players">No players in this round yet</div>;
    }

    // Sort players by bet amount (highest first)
    const sortedPlayers = [...players].sort((a, b) => b.amount - a.amount);
    
    return (
      <div className="players-list">
        {sortedPlayers.map((player) => {
          // Format the player's public key for display
          const displayAddress = player.pubkey 
            ? `${player.pubkey.substring(0, 4)}...${player.pubkey.substring(player.pubkey.length - 4)}`
            : 'Unknown';
          
          // Calculate percentage of total pot
          const percentage = currentRound.totalPot > 0 
            ? ((player.amount / currentRound.totalPot) * 100).toFixed(1) 
            : '0';
          
          console.log(`Rendering player ${displayAddress} with amount ${player.amount} (${percentage}%)`);
          
          return (
            <div key={player.pubkey} className="player-item">
              <div className="player-color" style={{ backgroundColor: player.color || '#cccccc' }}></div>
              <div className="player-info">
                <div className="player-address">{displayAddress}</div>
                <div className="player-amount">{player.amount.toFixed(4)} SOL ({percentage}%)</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return renderPlayers();
} 