// SPDX-License-Identifier: MIT

// Author: 7flash
// Website: https://gemunion.io/

pragma solidity ^0.8.0;
pragma abicoder v2;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {CoinHolder, NativeReceiver} from "@gemunion/contracts-finance/contracts/Holder.sol";

import {
  TreasuryFeeTooHigh,
  PredictionAlreadyExists,
  PredictionNotFound,
  PredictionNotStarted,
  PredictionEnded,
  BetAmountTooLow,
  BetAmountNotMultipleOfStakeUnit,
  BetAlreadyPlaced,
  ResolutionNotAvailable,
  PredictionNotResolved,
  NotEligibleForClaim,
  CannotResolveAfterExpirationDate,
  PredictionAlreadyResolved,
  ExpiryTimeNotPassed,
  MustBeGreaterThanZero,
  ZeroAddressNotAllowed,
  TransferAmountExceedsAllowance,
  CannotClaimBeforeResolution,
  WrongToken,
  RewardAlreadyClaimed,
  BetNotFound
} from "../../utils/errors.sol";

import {Asset, TokenType, AllowedTokenTypes} from "../../Exchange/lib/interfaces/IAsset.sol";
import {ExchangeUtils} from "../../Exchange/lib/ExchangeUtils.sol";

/**
 * @dev Contract module that allows users to participate in prediction markets.
 * Users can place bets on the outcome of events, and the contract handles the
 * resolution and reward distribution.
 */
contract Prediction is AccessControl, Pausable, ReentrancyGuard, CoinHolder, NativeReceiver {
    using SafeERC20 for IERC20;

    uint256 public _treasuryFee;
    uint256 public _minBetUnits;
    Asset[] public _treasuryFees;
    uint256 internal _predictionIdCounter;

    uint256 public constant MAX_TREASURY_FEE = 2000; // 20%

    // predictionId => PredictionMatch
    mapping(uint256 => PredictionMatch) private _predictions;
    // predictionId => account => BetInfo
    mapping(uint256 => mapping(address => BetInfo)) public _ledger;

    enum Position {
        LEFT,
        RIGHT
    }

    enum Outcome {
        LEFT,
        RIGHT,
        DRAW,
        ERROR,
        EXPIRED
    }

    struct PredictionMatch {
        uint256 startTimestamp;
        uint256 endTimestamp;
        uint256 expiryTimestamp;
        Asset betOnLeft;
        Asset betOnRight;
        Asset betAsset;
        Asset rewardAsset;
        Outcome outcome;
        bool resolved;
    }

    struct BetInfo {
        Position position;
        uint256 multiplier;
        bool claimed;
    }

    event BetPlaced(uint256 predictionId, address indexed sender, Asset asset, Position position);
    event RewardsCalculated(uint256 predictionId, Asset rewardBase);
    event Claim(uint256 predictionId, address indexed sender, Asset asset);
    event PredictionStart(uint256 predictionId);
    event PredictionEnd(uint256 predictionId, Outcome outcome);
    event NewTreasuryFee(uint256 treasuryFee);
    event TreasuryClaim();

    /**
     * @dev Initializes the contract with the given parameters.
     *
     * Requirements:
     *
     * - `_treasuryFee` must be less than or equal to `MAX_TREASURY_FEE`.
     */
    constructor(uint256 treasuryFee) {
        _setTreasuryFee(treasuryFee);
        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }

    /**
     * @dev Starts a new prediction round with the given parameters.
     *
     * Requirements:
     *
     * - The caller must have the `DEFAULT_ADMIN_ROLE`.
     * - `startTimestamp` must be less than `endTimestamp`.
     * - `endTimestamp` must be less than `expiryTimestamp`.
     * - `expiryTimestamp` terminates prediction no matter what.
     */
    function startPrediction(
        uint256 startTimestamp,
        uint256 endTimestamp,
        uint256 expiryTimestamp,
        Asset memory betUnit
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 predictionId = ++_predictionIdCounter;

        if (startTimestamp >= endTimestamp) {
            revert PredictionNotStarted();
        }
        if (endTimestamp >= expiryTimestamp) {
            revert PredictionEnded();
        }
        if (betUnit.tokenType != TokenType.ERC20 && betUnit.tokenType != TokenType.NATIVE) {
            revert WrongToken();
        }

        if (_predictions[predictionId].startTimestamp != 0) {
            revert PredictionAlreadyExists();
        }

        _predictions[predictionId] = PredictionMatch({
            startTimestamp: startTimestamp,
            endTimestamp: endTimestamp,
            expiryTimestamp: expiryTimestamp,
            betOnLeft: Asset(betUnit.tokenType, betUnit.token, betUnit.tokenId, 0),
            betOnRight: Asset(betUnit.tokenType, betUnit.token, betUnit.tokenId, 0),
            betAsset: betUnit,
            rewardAsset: betUnit,
            outcome: Outcome.ERROR,
            resolved: false
        });

        emit PredictionStart(predictionId);
    }

    /**
     * @dev Places a bet on the left or right side of the prediction using ERC20 or native tokens.
     *
     * Requirements:
     *
     * - The prediction must exist.
     * - The current timestamp must be within the betting period.
     * - The bet amount must be greater than or equal to `minBetUnits`.
     * - The user must not have already placed a bet on this prediction.
     */
    function placeBet(
        uint256 predictionId,
        uint256 multiplier,
        Position position
    ) external payable whenNotPaused nonReentrant {
        PredictionMatch storage prediction = _predictions[predictionId];

        if (predictionId == 0) {
            revert PredictionNotFound();
        }
        if (block.timestamp < prediction.startTimestamp) {
            revert PredictionNotStarted();
        }
        if (block.timestamp > prediction.endTimestamp) {
            revert PredictionEnded();
        }
        if (multiplier < _minBetUnits) {
            revert BetAmountTooLow();
        }

        // TODO add new bet to old bet
        if (_ledger[predictionId][_msgSender()].multiplier != 0) {
            revert BetAlreadyPlaced();
        }

        Asset memory betUnit = prediction.betAsset;

        Asset[] memory price = new Asset[](1);
        price[0] = betUnit;
        price[0].amount = multiplier * betUnit.amount;

        ExchangeUtils.spend(price, address(this), AllowedTokenTypes(true, false, false, false, false));

        if (position == Position.LEFT) {
            prediction.betOnLeft.amount += price[0].amount;
        } else {
            prediction.betOnRight.amount += price[0].amount;
        }

        BetInfo storage betInfo = _ledger[predictionId][_msgSender()];
        betInfo.position = position;
        betInfo.multiplier = multiplier;

        emit BetPlaced(predictionId, _msgSender(), price[0], position);
    }

    /**
     * @dev Claims the reward for a resolved prediction.
     *
     * Requirements:
     *
     * - The prediction must exist.
     * - The current timestamp must be after the resolution timestamp.
     * - The prediction must be resolved.
     * - The user must be eligible for the claim.
     */
    function claim(uint256 predictionId) external nonReentrant {
        PredictionMatch storage prediction = _predictions[predictionId];
        BetInfo memory betInfo = _ledger[predictionId][_msgSender()];

        if (predictionId == 0 || prediction.startTimestamp == 0) {
            revert PredictionNotFound();
        }

        // first claim after expiration date resolves prediction
        if (!prediction.resolved && prediction.expiryTimestamp < block.timestamp) {
            _safePredictionEnd(predictionId, Outcome.EXPIRED);
        }

        if (!prediction.resolved) {
            revert CannotClaimBeforeResolution();
        }

        if (betInfo.multiplier != 0) {
            revert BetNotFound();
        }

        if (
            !((prediction.outcome == Outcome.LEFT && betInfo.position == Position.LEFT) ||
            (prediction.outcome == Outcome.RIGHT && betInfo.position == Position.RIGHT))) {
            revert NotEligibleForClaim();
        }

        if (betInfo.claimed) {
            revert RewardAlreadyClaimed();
        }

        _ledger[predictionId][_msgSender()].claimed = true;

        Asset memory rewardAsset = Asset({
            tokenType: prediction.betAsset.tokenType,
            token: prediction.betAsset.token,
            tokenId: 0,
            amount: betInfo.multiplier * prediction.betAsset.amount + betInfo.multiplier * prediction.rewardAsset.amount
        });

        ExchangeUtils.spend(
            ExchangeUtils._toArray(rewardAsset),
            _msgSender(),
            AllowedTokenTypes(true, true, false, false, false)
        );

        emit Claim(predictionId, _msgSender(), rewardAsset);
    }

    /**
     * @dev Resolves a prediction with the given outcome.
     *
     * Requirements:
     *
     * - The caller must have the `DEFAULT_ADMIN_ROLE`.
     * - The prediction must exist.
     * - The current timestamp must be after the resolution timestamp.
     * - The prediction must not be already resolved.
     */
    function resolvePrediction(uint256 predictionId, Outcome outcome) external whenNotPaused onlyRole(DEFAULT_ADMIN_ROLE) {
        PredictionMatch storage prediction = _predictions[predictionId];

        if (predictionId == 0 || prediction.startTimestamp == 0) {
            revert PredictionNotFound();
        }

        if (prediction.resolved) {
            revert PredictionAlreadyResolved();
        }

        if (prediction.betOnLeft.amount == 0 || prediction.betOnRight.amount == 0) {
            _safePredictionEnd(predictionId, Outcome.ERROR);
        } else if (prediction.expiryTimestamp < block.timestamp) {
            _safePredictionEnd(predictionId, Outcome.EXPIRED);
        } else {
            _safePredictionEnd(predictionId, outcome);
            _calculateRewards(predictionId);
        }
    }

    /**
     * @dev Claims the treasury amount.
     *
     * Requirements:
     *
     * - The caller must have the `DEFAULT_ADMIN_ROLE`.
     */
    function claimTreasury() external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        ExchangeUtils.spend(_treasuryFees, _msgSender(), AllowedTokenTypes(true, true, false, false, false));

        emit TreasuryClaim();
    }

    function getTreasuryFees() external view returns (Asset[] memory) {
        return _treasuryFees;
    }

    /**
     * @dev Pauses the contract.
     *
     * Requirements:
     *
     * - The caller must have the `DEFAULT_ADMIN_ROLE`.
     */
    function pause() external whenNotPaused onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpauses the contract.
     *
     * Requirements:
     *
     * - The caller must have the `DEFAULT_ADMIN_ROLE`.
     */
    function unpause() external whenPaused onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev Sets the treasury fee.
     *
     * Requirements:
     *
     * - The caller must have the `DEFAULT_ADMIN_ROLE`.
     * - `_treasuryFee` must be less than or equal to `MAX_TREASURY_FEE`.
     */
    function setTreasuryFee(uint256 treasuryFee) external whenPaused onlyRole(DEFAULT_ADMIN_ROLE) {
        _setTreasuryFee(treasuryFee);
    }

    function _setTreasuryFee(uint256 treasuryFee) internal {
        if (treasuryFee > MAX_TREASURY_FEE) {
            revert TreasuryFeeTooHigh(treasuryFee);
        }
        _treasuryFee = treasuryFee;
        emit NewTreasuryFee(treasuryFee);
    }

    /**
     * @dev Calculates the rewards for a resolved prediction.
     */
    function _calculateRewards(uint256 predictionId) internal {
        PredictionMatch storage prediction = _predictions[predictionId];
        Asset memory betUnit = prediction.betAsset;
        uint256 rewardBaseUnits = 0;
        uint256 treasuryAmt = 0;
        uint256 rewardAmount = 0;

        if (prediction.outcome == Outcome.LEFT) {
            rewardBaseUnits = prediction.betOnLeft.amount / betUnit.amount;
            treasuryAmt = (prediction.betOnRight.amount * _treasuryFee) / 10000;
            rewardAmount = prediction.betOnRight.amount - treasuryAmt;
        } else if (prediction.outcome == Outcome.RIGHT) {
            rewardBaseUnits = prediction.betOnRight.amount / betUnit.amount;
            treasuryAmt = (prediction.betOnLeft.amount * _treasuryFee) / 10000;
            rewardAmount = prediction.betOnLeft.amount - treasuryAmt;
        }

        prediction.rewardAsset = Asset({
            tokenType: TokenType.ERC20,
            token: betUnit.token,
            tokenId: 0,
            amount: rewardAmount / rewardBaseUnits
        });

        _treasuryFees.push(Asset({
            tokenType: betUnit.tokenType,
            token: betUnit.token,
            tokenId: 0,
            amount: treasuryAmt
        }));

        emit RewardsCalculated(predictionId, prediction.rewardAsset);
    }

    /**
     * @dev Safely ends a prediction with the given outcome.
     */
    function _safePredictionEnd(uint256 predictionId, Outcome outcome) internal {
        PredictionMatch storage prediction = _predictions[predictionId];

        if (prediction.endTimestamp == 0) {
            revert PredictionNotFound();
        }

        prediction.outcome = outcome;
        prediction.resolved = true;

        emit PredictionEnd(predictionId, outcome);
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(
      bytes4 interfaceId
    ) public view virtual override(AccessControl, CoinHolder) returns (bool) {
      return super.supportsInterface(interfaceId);
    }
}
