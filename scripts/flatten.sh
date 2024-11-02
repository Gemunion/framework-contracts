mkdir -p dist

# mkdir -p dist/ContractManager
# hardhat flatten contracts/ContractManager/ContractManager.sol > dist/ContractManager/ContractManager.sol

mkdir -p dist/ERC20
hardhat flatten contracts/ERC20/ERC20Blacklist.sol > dist/ERC20/ERC20Blacklist.sol
hardhat flatten contracts/ERC20/ERC20Simple.sol > dist/ERC20/ERC20Simple.sol
hardhat flatten contracts/ERC20/ERC20Whitelist.sol > dist/ERC20/ERC20Whitelist.sol

mkdir -p dist/ERC721
hardhat flatten contracts/ERC721/ERC721Blacklist.sol > dist/ERC721/ERC721Blacklist.sol
hardhat flatten contracts/ERC721/ERC721BlacklistDiscrete.sol > dist/ERC721/ERC721BlacklistDiscrete.sol
hardhat flatten contracts/ERC721/ERC721BlacklistDiscreteRandom.sol > dist/ERC721/ERC721BlacklistDiscreteRandom.sol
hardhat flatten contracts/ERC721/ERC721BlacklistDiscreteRentable.sol > dist/ERC721/ERC721BlacklistDiscreteRentable.sol
hardhat flatten contracts/ERC721/ERC721BlacklistDiscreteRentableRandom.sol > dist/ERC721/ERC721BlacklistDiscreteRentableRandom.sol
hardhat flatten contracts/ERC721/ERC721BlacklistRandom.sol > dist/ERC721/ERC721BlacklistRandom.sol
hardhat flatten contracts/ERC721/ERC721BlacklistRentable.sol > dist/ERC721/ERC721BlacklistRentable.sol
hardhat flatten contracts/ERC721/ERC721Discrete.sol > dist/ERC721/ERC721Discrete.sol
hardhat flatten contracts/ERC721/ERC721DiscreteRandom.sol > dist/ERC721/ERC721DiscreteRandom.sol
hardhat flatten contracts/ERC721/ERC721DiscreteRentable.sol > dist/ERC721/ERC721DiscreteRentable.sol
hardhat flatten contracts/ERC721/ERC721Genes.sol > dist/ERC721/ERC721Genes.sol
hardhat flatten contracts/ERC721/ERC721Random.sol > dist/ERC721/ERC721Random.sol
hardhat flatten contracts/ERC721/ERC721Rentable.sol > dist/ERC721/ERC721Rentable.sol
hardhat flatten contracts/ERC721/ERC721Simple.sol > dist/ERC721/ERC721Simple.sol
hardhat flatten contracts/ERC721/ERC721Soulbound.sol > dist/ERC721/ERC721Soulbound.sol
hardhat flatten contracts/ERC721/ERC721SoulboundWotes.sol > dist/ERC721/ERC721SoulboundWotes.sol
hardhat flatten contracts/ERC721/ERC721Wotes.sol > dist/ERC721/ERC721Wotes.sol

# TODO
# add fuckton of random and genes contracts

mkdir -p dist/ERC998
hardhat flatten contracts/ERC998/ERC998Blacklist.sol > dist/ERC998/ERC998Blacklist.sol
hardhat flatten contracts/ERC998/ERC998BlacklistDiscrete.sol > dist/ERC998/ERC998BlacklistDiscrete.sol
hardhat flatten contracts/ERC998/ERC998BlacklistDiscreteRandom.sol > dist/ERC998/ERC998BlacklistDiscreteRandom.sol
hardhat flatten contracts/ERC998/ERC998BlacklistRandom.sol > dist/ERC998/ERC998BlacklistRandom.sol
hardhat flatten contracts/ERC998/ERC998Discrete.sol > dist/ERC998/ERC998Discrete.sol
hardhat flatten contracts/ERC998/ERC998DiscreteRandom.sol > dist/ERC998/ERC998DiscreteRandom.sol
hardhat flatten contracts/ERC998/ERC998ERC20Enum.sol > dist/ERC998/ERC998ERC20Enum.sol
hardhat flatten contracts/ERC998/ERC998ERC20Simple.sol > dist/ERC998/ERC998ERC20Simple.sol
hardhat flatten contracts/ERC998/ERC998ERC1155Enum.sol > dist/ERC998/ERC998ERC1155Enum.sol
hardhat flatten contracts/ERC998/ERC998ERC1155ERC20Enum.sol > dist/ERC998/ERC998ERC1155ERC20Enum.sol
hardhat flatten contracts/ERC998/ERC998ERC1155ERC20HEnum.sol > dist/ERC998/ERC998ERC1155ERC20HEnum.sol
hardhat flatten contracts/ERC998/ERC998ERC1155ERC20Simple.sol > dist/ERC998/ERC998ERC1155ERC20Simple.sol
hardhat flatten contracts/ERC998/ERC998ERC1155Simple.sol > dist/ERC998/ERC998ERC1155Simple.sol
hardhat flatten contracts/ERC998/ERC998Genes.sol > dist/ERC998/ERC998Genes.sol
hardhat flatten contracts/ERC998/ERC998Random.sol > dist/ERC998/ERC998Random.sol
hardhat flatten contracts/ERC998/ERC998Rentable.sol > dist/ERC998/ERC998Rentable.sol
hardhat flatten contracts/ERC998/ERC998Simple.sol > dist/ERC998/ERC998Simple.sol
hardhat flatten contracts/ERC998/ERC998SimpleEnum.sol > dist/ERC998/ERC998SimpleEnum.sol
hardhat flatten contracts/ERC998/ERC998StateHash.sol > dist/ERC998/ERC998StateHash.sol

# TODO
# add fuckton of random and genes contracts

mkdir -p dist/ERC1155
hardhat flatten contracts/ERC1155/ERC1155Blacklist.sol > dist/ERC1155/ERC1155Blacklist.sol
hardhat flatten contracts/ERC1155/ERC1155Simple.sol > dist/ERC1155/ERC1155Simple.sol
hardhat flatten contracts/ERC1155/ERC1155Soulbound.sol > dist/ERC1155/ERC1155Soulbound.sol

#mkdir -p dist/Exchange
#hardhat flatten contracts/Exchange/Exchange.sol > dist/Exchange/Exchange.sol

mkdir -p dist/Mechanics

mkdir -p dist/Mechanics/Collection
hardhat flatten contracts/Mechanics/Collection/ERC721CollectionBlacklist.sol > dist/Mechanics/Collection/ERC721CollectionBlacklist.sol
hardhat flatten contracts/Mechanics/Collection/ERC721CollectionSimple.sol > dist/Mechanics/Collection/ERC721CollectionSimple.sol

mkdir -p dist/Mechanics/Dispenser
hardhat flatten contracts/Mechanics/Dispenser/Dispenser.sol > dist/Mechanics/Dispenser/Dispenser.sol

mkdir -p dist/Mechanics/LootBox
hardhat flatten contracts/Mechanics/LootBox/ERC721LootBoxBlacklist.sol > dist/Mechanics/LootBox/ERC721LootBoxBlacklist.sol
hardhat flatten contracts/Mechanics/LootBox/ERC721LootBoxBlacklistPausable.sol > dist/Mechanics/LootBox/ERC721LootBoxBlacklistPausable.sol
hardhat flatten contracts/Mechanics/LootBox/ERC721LootBoxPausable.sol > dist/Mechanics/LootBox/ERC721LootBoxPausable.sol
hardhat flatten contracts/Mechanics/LootBox/ERC721LootBoxSimple.sol > dist/Mechanics/LootBox/ERC721LootBoxSimple.sol

# TODO
# add fuckton of random contracts

mkdir -p dist/Mechanics/Lottery
hardhat flatten contracts/Mechanics/Lottery/ERC721LotteryTicket.sol > dist/Mechanics/Lottery/ERC721LotteryTicket.sol
hardhat flatten contracts/Mechanics/Lottery/Lottery.sol > dist/Mechanics/Lottery/Lottery.sol

mkdir -p dist/Mechanics/MysteryBox
hardhat flatten contracts/Mechanics/MysteryBox/ERC721MysteryBoxBlacklist.sol > dist/Mechanics/MysteryBox/ERC721MysteryBoxBlacklist.sol
hardhat flatten contracts/Mechanics/MysteryBox/ERC721MysteryBoxBlacklistPausable.sol > dist/Mechanics/MysteryBox/ERC721MysteryBoxBlacklistPausable.sol
hardhat flatten contracts/Mechanics/MysteryBox/ERC721MysteryBoxPausable.sol > dist/Mechanics/MysteryBox/ERC721MysteryBoxPausable.sol
hardhat flatten contracts/Mechanics/MysteryBox/ERC721MysteryBoxSimple.sol > dist/Mechanics/MysteryBox/ERC721MysteryBoxSimple.sol

mkdir -p dist/Mechanics/Ponzi
hardhat flatten contracts/Mechanics/Ponzi/Ponzi.sol > dist/Mechanics/Ponzi/Ponzi.sol

mkdir -p dist/Mechanics/Raffle
hardhat flatten contracts/Mechanics/Raffle/ERC721RaffleTicket.sol > dist/Mechanics/Raffle/ERC721RaffleTicket.sol
hardhat flatten contracts/Mechanics/Raffle/Raffle.sol > dist/Mechanics/Raffle/Raffle.sol

mkdir -p dist/Mechanics/Staking
hardhat flatten contracts/Mechanics/Staking/Staking.sol > dist/Mechanics/Staking/Staking.sol

mkdir -p dist/Mechanics/LegacyVesting
hardhat flatten contracts/Mechanics/LegacyVesting/LegacyVesting.sol > dist/Mechanics/LegacyVesting/LegacyVesting.sol

mkdir -p dist/Mechanics/Waitlist
hardhat flatten contracts/Mechanics/Waitlist/Waitlist.sol > dist/Mechanics/Waitlist/Waitlist.sol

mkdir -p dist/Mechanics/Wrapper
hardhat flatten contracts/Mechanics/Wrapper/ERC721Wrapper.sol > dist/Mechanics/Wrapper/ERC721Wrapper.sol



