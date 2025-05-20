use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid authority pda provided.")]
    InvalidMintAuthorityPDA,
    #[msg("Bump seed not found for PDA.")]
    BumpSeedNotInHashMap,
    #[msg("Transfer amount is less than the calculated fee.")]
    TransferAmountLessThanFee,
    #[msg("Fee calculation failed.")]
    FeeCalculationFailed,
    #[msg("Invalid mint account provided.")]
    InvalidMintAccount,
    #[msg("Round is not active")]
    RoundNotActive,
    #[msg("Round is already active")]
    RoundAlreadyActive,
    #[msg("Round has not ended")]
    RoundNotEnded,
    #[msg("Invalid bet amount")]
    InvalidBetAmount,
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Unauthorized access")]
    UnauthorizedAccess,
    #[msg("Invalid seed commitment")]
    InvalidSeedCommitment,
    #[msg("Invalid revealed seed")]
    InvalidRevealedSeed,
    #[msg("Round has no players")]
    NoPlayers,
    #[msg("Maximum players reached")]
    MaxPlayersReached,
    #[msg("Bet window closed")]
    BetWindowClosed,
    #[msg("Invalid time parameters")]
    InvalidTimeParameters,
    #[msg("Spin already in progress")]
    SpinInProgress,
    #[msg("Calculation error")]
    CalculationError,
    #[msg("Invalid house fee")]
    InvalidHouseFee,
    #[msg("Invalid house fee config")]
    InvalidHouseFeeConfig,
    #[msg("Invalid round ID provided for PDA seed")]
    InvalidRoundIdForSeed,
    #[msg("Game calculation error")]
    GameCalculationError,
    #[msg("No players in round")]
    NoPlayersInRound,
    #[msg("Error in PDA Bump")]
    PdaBumpError,
    #[msg("Round is still active")]
    RoundStillActive,
    #[msg("Winner not yet determined for this round.")]
    WinnerNotDetermined,
    #[msg("Reward already claimed")]
    RewardAlreadyClaimed,
    #[msg("Not Eligible for rewards")]
    NotEligibleForReward,
    #[msg("Invalid game state")]
    InvalidGameState,
    #[msg("Round is not in the correct state for reward distribution.")]
    RoundNotInCorrectStateForRewardDistribution,
    #[msg("Invalid token program ID provided.")]
    InvalidTokenProgram,
    #[msg("Round is not in the correct state.")]
    RoundNotInCorrectState,
    #[msg("Invalid status discriminant.")]
    InvalidStatusDiscriminant,
    #[msg("Unauthorized access to escrow account.")]
    UnauthorizedEscrowAccess,
    #[msg("Invalid deposit amount. Must be greater than zero.")]
    InvalidDepositAmount, // For deposit_sol
    #[msg("Invalid withdrawal amount. Must be greater than zero.")]
    InvalidWithdrawalAmount,
    #[msg("Insufficient platform balance for withdrawal.")]
    InsufficientPlatformBalance,
    #[msg("Withdrawal would make the escrow account rent-deficient.")]
    WithdrawWouldMakeEscrowRentDeficient,
    #[msg("Invalid house wallet address provided for fee collection.")]
    InvalidHouseWalletAddress
}
