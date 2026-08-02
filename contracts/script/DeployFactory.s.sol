// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {Factory} from "../src/Factory.sol";

contract DeployFactory is Script {
    function run() external returns (Factory factory) {
        vm.startBroadcast();
        factory = new Factory();
        vm.stopBroadcast();
    }
}
