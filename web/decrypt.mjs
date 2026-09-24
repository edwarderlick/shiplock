import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import fs from "fs";
import { english, generateMnemonic, mnemonicToAccount } from "viem/accounts";
import { decrypt } from "viem/accounts"; // or something to decrypt keystore

// Actually viem keystore decryption is easy:
import { Web3 } from "web3";
// ...wait, do I have web3? No, web3 is not in package.json... but viem is.
// Actually I can just use ethers or viem to decrypt the keystore.
