import { initTestBridgeIfRequested } from "../ui/qa/testBridge.js";
import { wireSeedCopyControl } from "../ui/seedDisplay.js";

export function initSeedUx(): void {
  void initTestBridgeIfRequested();
  wireSeedCopyControl();
}
