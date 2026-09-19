import { CanonicalLedgerDiscovery } from '../../src/server/services/phase2fasttrack/CanonicalLedgerDiscovery';

async function test() {
    const discovery = new CanonicalLedgerDiscovery();
    try {
        const ledger = await discovery.runDiscoveryGate();
        console.log("Canonical Ledger:", ledger);
    } catch(e) {
        console.error(e);
    }
}
test();
