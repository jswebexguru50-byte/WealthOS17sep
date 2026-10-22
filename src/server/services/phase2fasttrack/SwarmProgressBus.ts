import fs from 'fs';
import path from 'path';

export interface AgentStatus {
    agentId: string;
    track: string;
    status: 'NOT_STARTED' | 'RUNNING' | 'WAITING' | 'BLOCKED' | 'COMPLETE' | 'FAILED' | 'SUPERSEDED';
    startedAt?: string;
    completedAt?: string;
    currentStep: string;
    progressPct: number;
    recordsProcessed: number;
    recordsRemaining: number;
    criticalFindings: string[];
    blockingIssues: string[];
    artifactPaths: string[];
    artifactHashes: string[];
    datasetHash: string;
    dependencyHash: string;
    lastCheckpoint: string;
    nextAction: string;
}

export class SwarmProgressBus {
    private reportsDir: string;
    
    constructor() {
        this.reportsDir = path.join(process.cwd(), 'reports', 'v674-fasttrack', 'swarm');
        if (!fs.existsSync(this.reportsDir)) {
            fs.mkdirSync(this.reportsDir, { recursive: true });
        }
    }

    public updateAgentStatus(status: AgentStatus) {
        const filePath = path.join(this.reportsDir, `${status.agentId}_STATUS.json`);
        fs.writeFileSync(filePath, JSON.stringify(status, null, 2));
        this.compileOverallProgress();
    }

    private compileOverallProgress() {
        const overallPath = path.join(process.cwd(), 'reports', 'v674-fasttrack', '00_OVERALL_PROGRESS.json');
        
        const files = fs.readdirSync(this.reportsDir).filter(f => f.endsWith('_STATUS.json'));
        let totalPct = 0;
        let runningAgents = 0;

        const tracks: any = {
            A: { status: 'NOT_STARTED', progressPct: 0, validSignals: 0, dataInsufficient: 0 },
            B: { status: 'NOT_STARTED', progressPct: 0 },
            C: { status: 'NOT_STARTED', progressPct: 0 },
            D: { status: 'NOT_STARTED', progressPct: 0 },
            RED_TEAM: { status: 'NOT_STARTED', progressPct: 0 },
            CLEAN_ROOM: { status: 'NOT_STARTED', progressPct: 0 }
        };

        let hasBlockers = false;

        for (const file of files) {
            const data = JSON.parse(fs.readFileSync(path.join(this.reportsDir, file), 'utf8')) as AgentStatus;
            
            if (data.status === 'RUNNING') runningAgents++;
            if (data.status === 'BLOCKED' || data.status === 'FAILED') hasBlockers = true;

            totalPct += data.progressPct;

            if (data.track === 'A') {
                tracks.A.progressPct = data.progressPct;
                tracks.A.status = data.status;
            } else if (data.track === 'B') {
                tracks.B.progressPct = data.progressPct;
                tracks.B.status = data.status;
            } else if (data.track === 'C') {
                tracks.C.progressPct = data.progressPct;
                tracks.C.status = data.status;
            } else if (data.track === 'D') {
                tracks.D.progressPct = data.progressPct;
                tracks.D.status = data.status;
            } else if (data.agentId === 'X1') {
                tracks.RED_TEAM.progressPct = data.progressPct;
                tracks.RED_TEAM.status = data.status;
            } else if (data.agentId === 'X2') {
                tracks.CLEAN_ROOM.progressPct = data.progressPct;
                tracks.CLEAN_ROOM.status = data.status;
            }
        }

        const avgPct = files.length > 0 ? (totalPct / files.length) : 0;

        const gates: any = {
            CP0: 'PASS', CP1: 'PASS', CP2: 'WAITING', CP3: 'WAITING', CP4: 'WAITING',
            CP5: 'WAITING', CP6: 'WAITING', CP7: 'WAITING', CP8: 'WAITING', CP9: 'WAITING',
            CP10: 'WAITING', CP11: 'WAITING'
        };

        let currentGate = "CP2_OUTCOMES";

        if (tracks.A.status === 'COMPLETE' && tracks.C.status === 'COMPLETE' && tracks.D.status === 'COMPLETE') {
            gates.CP2 = 'PASS';
            gates.CP3 = 'PASS';
            gates.CP4 = 'PASS';
            currentGate = "CP5_MATCHED_CONTROLS";
            if (tracks.B.status === 'RUNNING') gates.CP5 = 'RUNNING';
            if (tracks.B.status === 'COMPLETE') {
                gates.CP5 = 'PASS';
                gates.CP6 = 'PASS';
                gates.CP7 = 'PASS';
                currentGate = "CP8_RED_TEAM";
                if (tracks.RED_TEAM.status === 'RUNNING') gates.CP8 = 'RUNNING';
                if (tracks.RED_TEAM.status === 'COMPLETE') {
                    gates.CP8 = 'PASS';
                    currentGate = "CP9_CLEAN_ROOM";
                }
            }
        } else {
            if (tracks.A.status === 'RUNNING') gates.CP2 = 'RUNNING';
            if (tracks.C.status === 'RUNNING') gates.CP3 = 'RUNNING';
            if (tracks.D.status === 'RUNNING') gates.CP4 = 'RUNNING';
        }

        const overallStatus = {
            program: "WEALTHOS_PHASE2_FASTTRACK_ECONOMIC_VALIDATION",
            version: "FT-EV-1.0",
            overallStatus: hasBlockers ? "BLOCKED" : (runningAgents > 0 ? "RUNNING" : "COMPLETE"),
            currentGate,
            overallProgressPct: avgPct,
            population: {
                canonicalSignals: 6501,
                evaluatedSecurityDays: 3500,
                tradingSessions: 7
            },
            tracks,
            gates,
            blockingIssues: [],
            criticalFindings: [],
            capitalEligibility: false,
            productionAuthorization: false,
            liveAuthorization: false,
            lastCheckpoint: "CP1",
            nextCheckpoint: "CP2",
            updatedAt: new Date().toISOString()
        };

        fs.writeFileSync(overallPath, JSON.stringify(overallStatus, null, 2));
    }
}
