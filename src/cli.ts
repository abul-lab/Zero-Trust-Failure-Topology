#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { TopologyAuditLedger } from "./audit/TopologyAuditLedger.js";
import { detectStructuralRisks } from "./graph/RiskDetector.js";
import { TopologyGraph } from "./graph/TopologyGraph.js";
import { startTopologyServer } from "./server.js";
import type { TopologyDefinition } from "./types/index.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? "serve";

  if (command === "serve") {
    const portArgIdx = args.indexOf("--port");
    const port =
      portArgIdx >= 0 && args[portArgIdx + 1]
        ? Number(args[portArgIdx + 1])
        : undefined;
    const running = await startTopologyServer({ port });
    const host = process.env.TOPOLOGY_HOST ?? "127.0.0.1";
    process.stdout.write(
      `Zero-Trust Failure Topology running at http://${host}:${running.port}\n`,
    );
    return;
  }

  if (command === "scan") {
    const filePath = args[1];
    if (!filePath) {
      process.stderr.write("Usage: failure-topology scan <topology.json>\n");
      process.exitCode = 1;
      return;
    }
    const raw = fs.readFileSync(path.resolve(filePath), "utf8");
    const def = JSON.parse(raw) as TopologyDefinition;
    const graph = new TopologyGraph(def);
    const findings = detectStructuralRisks(graph);
    process.stdout.write(
      JSON.stringify(
        {
          topologyId: def.topologyId,
          totalFindings: findings.length,
          findings,
        },
        null,
        2,
      ) + "\n",
    );
    if (findings.some((f) => f.severity === "critical")) {
      process.exitCode = 2;
    }
    return;
  }

  if (command === "verify-audit") {
    const filePath = args[1];
    if (!filePath) {
      process.stderr.write("Usage: failure-topology verify-audit <audit.jsonl>\n");
      process.exitCode = 1;
      return;
    }
    const raw = fs.readFileSync(path.resolve(filePath), "utf8");
    const report = TopologyAuditLedger.verifyJsonl(raw);
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    if (!report.valid) {
      process.exitCode = 2;
    }
    return;
  }

  process.stderr.write(
    "Commands: serve [--port 4200] | scan <topology.json> | verify-audit <audit.jsonl>\n",
  );
  process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(
    `Fatal error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exitCode = 1;
});
